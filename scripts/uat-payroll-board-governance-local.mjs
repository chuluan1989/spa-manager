/**
 * LOCAL UAT QUẢN TRỊ — chứng minh ONE SOURCE OF TRUTH sau Sửa bảng lương.
 * Không deploy. Không PASS nghiệp vụ — chỉ evidence để anh duyệt.
 *
 *   UAT_BASE_URL=http://127.0.0.1:5173 \
 *   node --env-file=.env.development.local scripts/uat-payroll-board-governance-local.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { assertOneSource, diffGovernance } from './lib/payrollGovernanceSnapshot.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/admin-payroll-board-local/governance-uat')
const SHOT = path.join(OUT, 'shots')
const VIDEO_DIR = path.join(OUT, 'video')
mkdirSync(SHOT, { recursive: true })
mkdirSync(VIDEO_DIR, { recursive: true })

const BASE = process.env.UAT_BASE_URL || 'http://127.0.0.1:5173'
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
const EMP_ID = 'soc-trang-ly-ly'
const BRANCH = 'soc-trang'
const MONTH = '2026-08'
const CYCLE = 'period1'
const FIELD_ORDER = ['bonus', 'kpi', 'penalty', 'advance']

function snapEngine(label) {
  const outFile = path.join(OUT, `engine-${label}.json`)
  const r = spawnSync(
    'npx',
    [
      'vite-node',
      '--env-file=.env.development.local',
      'scripts/snapshot-governance-once.mjs',
      `--employee=${EMP_ID}`,
      `--month=${MONTH}`,
      `--cycle=${CYCLE}`,
      `--branch=${BRANCH}`,
      `--label=${label}`,
      `--out=${outFile}`,
    ],
    { cwd: ROOT, encoding: 'utf8', env: process.env },
  )
  if (r.status !== 0) {
    throw new Error(`snapshot failed (${label}): ${r.stderr || r.stdout}`)
  }
  return JSON.parse(readFileSync(outFile, 'utf8'))
}

function parseVnd(text) {
  const cleaned = String(text ?? '').replace(/[^\d+-]/g, '')
  if (!cleaned || cleaned === '+' || cleaned === '-') return 0
  return Number(cleaned)
}

async function goSalary(page) {
  await page.getByRole('button', { name: /HRM lương/ }).click({ force: true })
  await page.waitForTimeout(2000)
}

async function loginAdmin(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.selectOption('select', 'admin')
  await page.fill('input[type="password"], input[placeholder*="mật khẩu" i]', ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.getByRole('button', { name: /HRM lương/ }).waitFor({ timeout: 45000 })
}

async function openLyLy(page) {
  await goSalary(page)
  await page.locator('article.salary-branch-card').first().waitFor({ timeout: 45000 })
  await page.locator('.salary-page__toolbar input[type="month"]').first().fill(MONTH)
  await page.locator('.salary-page__toolbar select').first().selectOption(CYCLE)
  await page.waitForTimeout(2000)
  await page.locator('article.salary-branch-card').first().waitFor({ timeout: 30000 })
  const card = page.locator('article.salary-branch-card', { hasText: /Sóc Trăng/i }).first()
  await card.locator('button').filter({ hasText: /Xem nhân viên/ }).click()
  await page.waitForTimeout(1200)
  const search = page.locator('.salary-page__toolbar input[type="search"]')
  if (await search.count()) {
    await search.fill('Ly Ly')
    await page.waitForTimeout(600)
  }
  await page.getByRole('button', { name: /^Ly Ly/ }).first().click({ timeout: 20000 })
  await page.waitForTimeout(2000)
}

async function reloadProfile(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  if (await page.getByRole('button', { name: 'Đăng nhập' }).count()) await loginAdmin(page)
  if (!(await page.locator('.salary-wallet__stats article').count())) await openLyLy(page)
  else await page.locator('.salary-wallet__stats article').first().waitFor({ timeout: 20000 })
}

async function readWallet(page) {
  const articles = page.locator('.salary-wallet__stats article')
  await articles.first().waitFor({ timeout: 20000 })
  const stats = {}
  const n = await articles.count()
  for (let i = 0; i < n; i += 1) {
    const label = (await articles.nth(i).locator('span').innerText()).trim()
    const value = (await articles.nth(i).locator('strong').innerText()).trim()
    stats[label] = value
    stats[`${label}__num`] = parseVnd(value)
  }
  return stats
}

async function openBoard(page) {
  await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await page.waitForTimeout(400)
  return dialog
}

async function fillBoard(dialog, values) {
  const inputs = dialog.locator('.salary-edit-totals__row input')
  for (let i = 0; i < FIELD_ORDER.length; i += 1) {
    await inputs.nth(i).fill(String(values[FIELD_ORDER[i]]))
  }
  await pageWait(500)
}

function pageWait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function saveBoard(dialog, reason) {
  await dialog.locator('textarea').fill(reason)
  await dialog.getByRole('button', { name: /^Lưu$/ }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 30000 })
  await pageWait(1500)
}

async function shot(page, name) {
  const p = path.join(SHOT, name)
  const opts = { path: p, animations: 'disabled', timeout: 60000 }
  try {
    await page.screenshot({ ...opts, fullPage: true })
  } catch {
    await page.screenshot({ ...opts, fullPage: false }).catch(() => {})
  }
  return p
}

async function goBranchList(page) {
  // Ép về dashboard Admin rồi mở lại Lương (grid chi nhánh)
  await page.locator('button.sidebar__link').filter({ hasText: /Tổng quan/ }).first().click({ force: true }).catch(async () => {
    await page.getByRole('button', { name: /^Tổng quan/ }).first().click({ force: true }).catch(() => {})
  })
  await pageWait(1500)
  await goSalary(page)
  await page.locator('article.salary-branch-card').first().waitFor({ timeout: 45000 })
  await page.locator('.salary-page__toolbar input[type="month"]').first().fill(MONTH)
  await page.locator('.salary-page__toolbar select').first().selectOption(CYCLE)
  await pageWait(2000)
  await page.locator('article.salary-branch-card').first().waitFor({ timeout: 30000 })
}

async function shotBranchTotals(page, name) {
  await goBranchList(page)
  const card = page.locator('article.salary-branch-card', { hasText: /Sóc Trăng/i }).first()
  await card.scrollIntoViewIfNeeded()
  await card.screenshot({ path: path.join(SHOT, name) })
  const text = await card.innerText()
  return text
}

async function openEmployeeList(page) {
  await goBranchList(page)
  const card = page.locator('article.salary-branch-card', { hasText: /Sóc Trăng/i }).first()
  await card.locator('button').filter({ hasText: /Xem nhân viên/ }).click()
  await pageWait(1200)
  const search = page.locator('.salary-page__toolbar input[type="search"]')
  if (await search.count()) {
    await search.fill('Ly Ly')
    await pageWait(600)
  }
}

async function shotEmployeeList(page, name) {
  await openEmployeeList(page)
  await shot(page, name)
}

async function shotLiveDashboard(page, name) {
  const dash = page.locator('.salary-live-dashboard').first()
  if (await dash.count()) {
    await dash.scrollIntoViewIfNeeded().catch(() => {})
    await dash.screenshot({ path: path.join(SHOT, name) }).catch(async () => shot(page, name))
  } else {
    await shot(page, name)
  }
}

async function shotExcelMirror(page, name, engineSnap, label) {
  const excel = engineSnap?.excel ?? {}
  const html = `<!doctype html><html><body style="font-family:ui-monospace,monospace;padding:24px;background:#fff;color:#111">
  <h2>Excel export mirror · ${label}</h2>
  <p>Nguồn: mapPayrollRowForExport(payrollRow) — cùng computePayrollReport</p>
  <table border="1" cellpadding="8" style="border-collapse:collapse">
    <tr><th>Field</th><th>Value</th></tr>
    <tr><td>Thưởng</td><td>${excel.bonus ?? 0}</td></tr>
    <tr><td>KPI</td><td>${excel.kpi ?? 0}</td></tr>
    <tr><td>Phạt</td><td>${excel.penalty ?? 0}</td></tr>
    <tr><td>Ứng</td><td>${excel.advance ?? 0}</td></tr>
    <tr><td>Net</td><td>${excel.netSalary ?? 0}</td></tr>
  </table>
  </body></html>`
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  await shot(page, name)
}

async function openAuditShot(page, name) {
  await page.getByRole('button', { name: 'Nhật ký' }).click().catch(() => {})
  await pageWait(800)
  await shot(page, name)
  await page.getByRole('button', { name: 'Tổng quan' }).click().catch(() => {})
  await pageWait(400)
}

async function openPayslipShot(page, name) {
  const tab = page.getByRole('button', { name: /Phiếu lương|Payslip/i })
  if (await tab.count()) {
    await tab.first().click()
    await pageWait(800)
  }
  const slipBtn = page.getByRole('button', { name: /Xem phiếu|Phiếu lương|In phiếu/i })
  if (await slipBtn.count()) {
    await slipBtn.first().click().catch(() => {})
    await pageWait(800)
  }
  await shot(page, name)
  await page.keyboard.press('Escape').catch(() => {})
  await page.getByRole('button', { name: 'Tổng quan' }).click().catch(() => {})
  await pageWait(400)
}

async function openReportProfitShot(page, name) {
  await page.getByRole('button', { name: /Báo cáo/ }).first().click({ force: true })
  await pageWait(3000)
  await shot(page, name)
}

async function captureModuleBundle(page, caseDir, phase, engineSnap) {
  // phase: before | after — assumes currently on Ly Ly profile when possible
  if (phase === 'before' || phase === 'after') {
    await shot(page, `${caseDir}__01_${phase}_detail.png`)
    await shotLiveDashboard(page, `${caseDir}__06_${phase}_dashboard.png`)
    await openPayslipShot(page, `${caseDir}__08_${phase}_pdf.png`)
    await openAuditShot(page, `${caseDir}__09_${phase}_audit.png`)
  }
  await shotEmployeeList(page, `${caseDir}__02_${phase}_list.png`)
  const branchText = await shotBranchTotals(page, `${caseDir}__03_${phase}_branch.png`)
  await openReportProfitShot(page, `${caseDir}__04_${phase}_labor_profit.png`)
  await shotExcelMirror(page, `${caseDir}__07_${phase}_excel.png`, engineSnap, `${caseDir} ${phase}`)
  // Restore app after setContent
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  if (await page.getByRole('button', { name: 'Đăng nhập' }).count()) await loginAdmin(page)
  await openLyLy(page)
  return branchText
}

const CASES = [
  {
    id: 'case1_penalty_400_to_1000',
    label: 'Phạt 400.000 → 1.000.000',
    setup: { bonus: 0, kpi: 0, penalty: 400000, advance: 0 },
    after: { bonus: 0, kpi: 0, penalty: 1000000, advance: 0 },
    expectedNetDelta: -600000,
  },
  {
    id: 'case2_advance_500_to_200',
    label: 'Ứng 500.000 → 200.000',
    setup: { bonus: 0, kpi: 0, penalty: 1000000, advance: 500000 },
    after: { bonus: 0, kpi: 0, penalty: 1000000, advance: 200000 },
    expectedNetDelta: 300000,
  },
  {
    id: 'case3_kpi_0_to_minus300',
    label: 'KPI 0 → -300.000',
    setup: { bonus: 0, kpi: 0, penalty: 1000000, advance: 200000 },
    after: { bonus: 0, kpi: -300000, penalty: 1000000, advance: 200000 },
    expectedNetDelta: -300000,
  },
  {
    id: 'case4_kpi_minus300_to_500',
    label: 'KPI -300.000 → 500.000',
    setup: { bonus: 0, kpi: -300000, penalty: 1000000, advance: 200000 },
    after: { bonus: 0, kpi: 500000, penalty: 1000000, advance: 200000 },
    expectedNetDelta: 800000,
  },
  {
    id: 'case5_bonus_0_to_500',
    label: 'Thưởng 0 → 500.000',
    setup: { bonus: 0, kpi: 500000, penalty: 1000000, advance: 200000 },
    after: { bonus: 500000, kpi: 500000, penalty: 1000000, advance: 200000 },
    expectedNetDelta: 500000,
  },
]

const MODULES = [
  '1. Chi tiết nhân viên — computePayrollReport → payrollRow / wallet',
  '2. Danh sách bảng lương — mergeEmployeePayrollRows(report.rows)',
  '3. Tổng lương chi nhánh — aggregateBranchSummaries(report.rows)',
  '4. Chi phí nhân sự — loadPayrollCostForFilters → computePayrollCostByBranch (Σ net)',
  '5. Lợi nhuận Spa — actualRevenue − laborCost − expenses (cùng labor trên)',
  '6. Dashboard Live Payroll — đọc field từ payrollRow (không tự cộng lại)',
  '7. Excel — mapPayrollRowForExport(payrollRow)',
  '8. PDF/phiếu — payslip từ payrollRow (+ KPI)',
  '9. Audit — payroll_audit_logs ghi lúc SET',
]

const report = {
  startedAt: new Date().toISOString(),
  deploy: false,
  passClaim: false,
  employeeId: EMP_ID,
  month: MONTH,
  cycle: CYCLE,
  modulesChecked: MODULES,
  oneSourceStatement:
    'Sau Admin SET Thưởng/KPI/Phạt/Ứng: mọi module đọc cùng nguồn payroll_adjustments → computeEmployeePayrollRow / computePayrollReport / computePayrollCostByBranch. Không fallback commission+tips.',
  cases: [],
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
})
context.setDefaultTimeout(45000)
const page = await context.newPage()

try {
  await loginAdmin(page)

  // Reset clean
  await openLyLy(page)
  let dialog = await openBoard(page)
  await fillBoard(dialog, { bonus: 0, kpi: 0, penalty: 0, advance: 0 })
  await saveBoard(dialog, 'GOVERNANCE UAT: reset về 0 trước 5 case')
  await reloadProfile(page)

  for (const c of CASES) {
    const caseDir = `${c.id}`
    // Setup "before" official values
    dialog = await openBoard(page)
    await fillBoard(dialog, c.setup)
    await saveBoard(dialog, `GOVERNANCE UAT setup — ${c.label}`)
    await reloadProfile(page)

    const beforeEngine = snapEngine(`${c.id}-before`)
    const beforeWallet = await readWallet(page)
    const branchBeforeText = await captureModuleBundle(page, caseDir, 'before', beforeEngine)

    // Preview + save to target
    dialog = await openBoard(page)
    await fillBoard(dialog, c.after)
    await pageWait(600)
    const previewText = await dialog.locator('.salary-board-edit__preview').innerText()
    await shot(page, `${caseDir}__00_preview_save.png`)
    await saveBoard(dialog, `GOVERNANCE UAT — ${c.label}`)
    await reloadProfile(page)
    await pageWait(1500)

    const afterEngine = snapEngine(`${c.id}-after`)
    const afterWallet = await readWallet(page)
    const branchAfterText = await captureModuleBundle(page, caseDir, 'after', afterEngine)

    const diff = diffGovernance(beforeEngine, afterEngine)
    const sourceCheck = assertOneSource(diff, c.expectedNetDelta)
    const uiNetDelta = afterWallet['Lương thực nhận__num'] - beforeWallet['Lương thực nhận__num']
    const uiMatch = Math.abs(uiNetDelta - c.expectedNetDelta) <= 1
    const detailMatchEngine = afterWallet['Lương thực nhận__num'] === afterEngine.employeeDetail.netSalary
      && afterWallet.Phạt__num === afterEngine.employeeDetail.penalty
      && afterWallet['Ứng lương__num'] === afterEngine.employeeDetail.advance
      && afterWallet.KPI__num === afterEngine.employeeDetail.kpi
      && afterWallet.Thưởng__num === afterEngine.employeeDetail.bonus
    const identityOk = afterEngine.identity?.laborEqualsSystemNet !== false
      && afterEngine.identity?.profitFormulaOk !== false

    report.cases.push({
      id: c.id,
      label: c.label,
      setup: c.setup,
      after: c.after,
      expectedNetDelta: c.expectedNetDelta,
      expectedLaborCostDelta: c.expectedNetDelta,
      expectedProfitDelta: -c.expectedNetDelta,
      diff,
      sourceCheck,
      uiNetDelta,
      uiMatch,
      detailMatchEngine,
      identityOk,
      beforeEngine,
      afterEngine,
      previewText,
      branchBeforeText: String(branchBeforeText ?? '').slice(0, 500),
      branchAfterText: String(branchAfterText ?? '').slice(0, 500),
      ok: sourceCheck.ok && uiMatch && detailMatchEngine && identityOk,
    })
  }

  // Final cleanup
  dialog = await openBoard(page)
  await fillBoard(dialog, { bonus: 0, kpi: 0, penalty: 0, advance: 0 })
  await saveBoard(dialog, 'GOVERNANCE UAT: cleanup SET về 0')
  await reloadProfile(page)
  report.finalWallet = await readWallet(page)
} catch (err) {
  report.error = String(err?.stack || err)
  await page.screenshot({ path: path.join(SHOT, 'error.png'), fullPage: true }).catch(() => {})
} finally {
  await context.close()
  await browser.close()
}

report.finishedAt = new Date().toISOString()
report.allOk = !report.error && (report.cases ?? []).every((c) => c.ok)
report.oneSourceOfTruth = report.allOk ? 'PASS' : 'FAIL'
report.status = report.allOk
  ? 'ONE SOURCE OF TRUTH = PASS — CHỜ ANH DUYỆT DEPLOY (chưa deploy)'
  : 'ONE SOURCE OF TRUTH = FAIL — CHƯA ĐỦ ĐIỀU KIỆN DEPLOY'

// CSV đối chiếu
const csvLines = [
  'case,field,before,after,delta,expected,ok',
]
for (const c of report.cases ?? []) {
  const profitExpected = c.diff.spaProfitExpectedFromLabor ?? c.expectedProfitDelta
  const rows = [
    ['employeeNet', c.beforeEngine.employeeDetail.netSalary, c.afterEngine.employeeDetail.netSalary, c.diff.employeeNet, c.expectedNetDelta],
    ['laborCost', c.beforeEngine.laborCost, c.afterEngine.laborCost, c.diff.laborCost, c.diff.systemNet],
    ['spaProfit', c.beforeEngine.spaProfit, c.afterEngine.spaProfit, c.diff.spaProfit, profitExpected],
    ['branchNet', c.beforeEngine.branchTotals.netSalary, c.afterEngine.branchTotals.netSalary, c.diff.branchNet, c.expectedNetDelta],
    ['systemNet', c.beforeEngine.systemDashboard.netSalary, c.afterEngine.systemDashboard.netSalary, c.diff.systemNet, c.diff.laborCost],
    ['excelNet', c.beforeEngine.excel.netSalary, c.afterEngine.excel.netSalary, c.diff.excelNet, c.expectedNetDelta],
    ['pdfNet', c.beforeEngine.pdf.netSalary, c.afterEngine.pdf.netSalary, c.diff.pdfNet, c.expectedNetDelta],
  ]
  for (const [field, before, after, delta, expected] of rows) {
    const ok = Math.abs(Number(delta) - Number(expected)) <= 1
    csvLines.push([c.id, field, before, after, delta, expected, ok ? 'OK' : 'FAIL'].join(','))
  }
}
writeFileSync(path.join(OUT, 'GOVERNANCE_COMPARE.csv'), csvLines.join('\n'))
writeFileSync(path.join(OUT, 'GOVERNANCE_UAT_REPORT.json'), JSON.stringify(report, null, 2))

const md = [
  '# UAT Quản trị — ONE SOURCE OF TRUTH (LOCAL · CHƯA DEPLOY)',
  '',
  `## Kết luận`,
  '',
  `**ONE SOURCE OF TRUTH = ${report.oneSourceOfTruth}**`,
  '',
  report.allOk
    ? 'Đủ điều kiện xin anh duyệt deploy (script chưa tự deploy).'
    : 'Chưa đủ điều kiện deploy.',
  '',
  '## Xác nhận nguồn',
  '',
  `> ${report.oneSourceStatement}`,
  '',
  '## Module đã kiểm tra (Before → Save → After)',
  '',
  ...MODULES.map((m) => `- ${m}`),
  '',
  '## Before / After',
  '',
]
for (const c of report.cases ?? []) {
  md.push(`### ${c.label}`)
  md.push('')
  md.push('| Metric | Before | After | Δ | Expected |')
  md.push('|--------|-------:|------:|--:|---------:|')
  md.push(`| Lương NV | ${c.beforeEngine.employeeDetail.netSalary} | ${c.afterEngine.employeeDetail.netSalary} | ${c.diff.employeeNet} | ${c.expectedNetDelta} |`)
  md.push(`| Chi phí NS | ${c.beforeEngine.laborCost} | ${c.afterEngine.laborCost} | ${c.diff.laborCost} | (= Δ systemNet ${c.diff.systemNet}) |`)
  md.push(`| Lợi nhuận Spa | ${c.beforeEngine.spaProfit} | ${c.afterEngine.spaProfit} | ${c.diff.spaProfit} | ${c.diff.spaProfitExpectedFromLabor} (công thức) |`)
  md.push(`| Tổng CN | ${c.beforeEngine.branchTotals.netSalary} | ${c.afterEngine.branchTotals.netSalary} | ${c.diff.branchNet} | ${c.expectedNetDelta} |`)
  md.push(`| Dashboard hệ | ${c.beforeEngine.systemDashboard.netSalary} | ${c.afterEngine.systemDashboard.netSalary} | ${c.diff.systemNet} | (= Δ labor) |`)
  md.push(`| Excel net | ${c.beforeEngine.excel.netSalary} | ${c.afterEngine.excel.netSalary} | ${c.diff.excelNet} | ${c.expectedNetDelta} |`)
  md.push(`| PDF net | ${c.beforeEngine.pdf.netSalary} | ${c.afterEngine.pdf.netSalary} | ${c.diff.pdfNet} | ${c.expectedNetDelta} |`)
  md.push('')
  md.push(`Kết quả case: **${c.ok ? 'KHỚP' : 'FAIL'}** · UI Δnet=${c.uiNetDelta} · concurrentOtherNet=${c.diff.concurrentOtherNet ?? 0}`)
  md.push('')
}
md.push(`## Tổng`)
md.push(`allOk: ${report.allOk}`)
md.push(`ONE SOURCE OF TRUTH: ${report.oneSourceOfTruth}`)
md.push(`error: ${report.error || 'none'}`)
writeFileSync(path.join(OUT, 'GOVERNANCE_BEFORE_AFTER.md'), md.join('\n'))
writeFileSync(
  path.join(OUT, 'ONE_SOURCE_OF_TRUTH.md'),
  [
    `# ONE SOURCE OF TRUTH = ${report.oneSourceOfTruth}`,
    '',
    report.allOk
      ? 'Tất cả module đối chiếu khớp cùng nguồn sau Admin SET. Chưa deploy — chờ duyệt.'
      : 'Chưa PASS. Không xin deploy.',
    '',
    `Generated: ${report.finishedAt}`,
  ].join('\n'),
)

// Copy latest video
try {
  const videos = readdirSync(VIDEO_DIR).filter((f) => f.endsWith('.webm'))
  if (videos.length) {
    const bySize = videos
      .map((f) => ({ f, size: readFileSync(path.join(VIDEO_DIR, f)).length }))
      .sort((a, b) => b.size - a.size)[0]
    copyFileSync(path.join(VIDEO_DIR, bySize.f), path.join(OUT, 'GOVERNANCE_UAT.webm'))
  }
} catch { /* ignore */ }

console.log(JSON.stringify({
  status: report.status,
  oneSourceOfTruth: report.oneSourceOfTruth,
  allOk: report.allOk,
  error: report.error,
  cases: (report.cases ?? []).map((c) => ({
    id: c.id,
    ok: c.ok,
    expectedNetDelta: c.expectedNetDelta,
    diff: c.diff,
    sourceCheck: c.sourceCheck,
  })),
  out: OUT,
}, null, 2))

process.exit(report.error || !report.allOk ? 1 : 0)
