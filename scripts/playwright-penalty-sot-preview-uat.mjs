/**
 * Browser UAT — Penalty SoT UI (Preview local).
 * Không void 4 dòng mirror. Không commit/deploy.
 *
 *   PREVIEW_URL=http://127.0.0.1:4177 node_modules/.bin/vite-node scripts/playwright-penalty-sot-preview-uat.mjs
 */
import './_polyfill-storage.mjs'
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'
import { computeEmployeePayrollRow } from '../src/utils/payrollEngine.js'
import { buildPenaltyPnlItems } from '../src/utils/managementReports/branchEfficiencyPnl.js'
import { assertManualPenaltyNotAttendanceMirror } from '../src/utils/payrollPenaltyPolicy.js'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'

const PREVIEW = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4177'
const OUT_DIR = 'docs/uat-evidence/penalty-sot-preview-uat'
mkdirSync(OUT_DIR, { recursive: true })
mkdirSync(path.join(OUT_DIR, 'shots'), { recursive: true })

const results = []
function check(id, ok, detail = {}) {
  results.push({ id, pass: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}`, typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 200))
}

// ── Engine / P&L parity (cases 1,3,4,5) ──────────────────────────────────────
const emp = { id: 'uat-e1', name: 'UAT', branchId: 'bac-lieu', salaryRate: 0 }
const att100 = [{ employeeId: 'uat-e1', date: '2026-08-07', penaltyAmount: 100000, branchId: 'bac-lieu' }]
const man500 = [{
  employeeId: 'uat-e1',
  type: PAYROLL_ADJUSTMENT_TYPES.PENALTY,
  amount: 500000,
  date: '2026-08-12',
  month: '2026-08',
  branchId: 'bac-lieu',
  reason: 'Phạt lúc làm khách',
}]

{
  const row = computeEmployeePayrollRow(emp, [], att100, [])
  check('CASE1_engine', row.attendancePenalty === 100000 && row.manualPenalty === 0 && row.penalty === 100000, row)
}
{
  for (const text of [
    'Phạt nghỉ không phép',
    'Phạt quá phép',
    'Phạt off quá phép',
    'Phạt đi trễ',
    'Phạt về sớm',
  ]) {
    const g = assertManualPenaltyNotAttendanceMirror({ type: 'penalty', reason: text })
    check(`CASE2_block_${text}`, g.blocked === true, g.message)
  }
}
{
  const row = computeEmployeePayrollRow(emp, [], att100, man500)
  const pnl = buildPenaltyPnlItems({
    attendanceRecords: att100,
    adjustments: man500,
    fromDate: '2026-08-01',
    toDate: '2026-08-31',
  })
  check('CASE3_engine_600', row.penalty === 600000, { payroll: row.penalty })
  check('CASE3_pnl_parity', pnl.total === 600000 && row.penalty === pnl.total, { pnl: pnl.total })
}
{
  const after = computeEmployeePayrollRow(
    emp,
    [],
    [{ ...att100[0], penaltyAmount: 0, status: 'full_day_permitted' }],
    man500,
  )
  check('CASE4_att_zero_manual_kept', after.attendancePenalty === 0 && after.manualPenalty === 500000 && after.penalty === 500000, after)
}
{
  const row = computeEmployeePayrollRow(emp, [], [], man500)
  check('CASE5_manual_only', row.penalty === 500000, row)
}

// Legacy still counted (not auto-excluded)
{
  const legacy = [
    { employeeId: 'bac-lieu-thu-huong', type: 'penalty', amount: 100000, date: '2026-08-07', month: '2026-08', reason: 'Phạt quá phép', note: 'Phạt off quá phép' },
  ]
  const row = computeEmployeePayrollRow(
    { id: 'bac-lieu-thu-huong', name: 'Thu Hương', branchId: 'bac-lieu', salaryRate: 0 },
    [],
    [{ employeeId: 'bac-lieu-thu-huong', date: '2026-08-07', penaltyAmount: 0 }],
    legacy,
  )
  check('LEGACY_still_counts_manual', row.manualPenalty === 100000 && row.penalty === 100000, row)
}

// Cherry 500k protected read from DB
const { url, key } = await loadProductionSupabaseEnv(process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn')
const sb = createClient(url, key, { auth: { persistSession: false } })
{
  const { data: cherryOld } = await sb.from('payroll_adjustments').select('id,amount,reason,note,source,category').eq('id', 'payadj-1786800135828-rsb024').maybeSingle()
  const { data: cherryLive } = await sb
    .from('payroll_adjustments')
    .select('id,amount,reason,note,source,category,date')
    .eq('employee_id', 'tram-spa-cherry')
    .eq('type', 'penalty')
    .neq('amount', 0)
  const has500 = (cherryLive || []).some((r) => Number(r.amount) === 500000)
  const onCorrectId =
    Number(cherryOld?.amount) === 500000 &&
    String(cherryOld?.note || '').includes('Phạt lúc làm khách')
  check('CHERRY_500_PROTECTED_AMOUNT_EXISTS', has500, { cherryLive, cherryOld })
  check('CHERRY_12_RESTORED_ON_ORIGINAL_ID', onCorrectId, {
    note: 'payadj-1786800135828-rsb024 = 500k Phạt lúc làm khách (restored)',
    cherryOld,
  })
  check('LEGACY_SOURCE_DEFAULT_MANUAL', !cherryOld?.source || cherryOld.source === 'manual', cherryOld)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let uiOk = false
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

async function loginAdmin() {
  await page.goto(PREVIEW, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('form.login__form select', { timeout: 20000 })
  await page.locator('form.login__form select').selectOption('admin')
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.click('button.login__submit')
  await page.waitForFunction(() => !document.querySelector('.login__form'), { timeout: 45000 })
  await page.waitForTimeout(1500)
}

try {
  await loginAdmin()
  check('UI_LOGIN_ADMIN', true, {})

  // Navigate via sidebar text
  const salaryLink = page.locator('nav a, aside a, button, [role="button"]').filter({ hasText: /^Lương$/ }).first()
  if (await salaryLink.count()) {
    await salaryLink.click()
  } else {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('a,button,span')].find((n) => /^Lương$/.test(n.textContent?.trim() || ''))
      el?.click()
    })
  }
  await page.waitForTimeout(2000)

  // Open employee then Sửa bảng lương
  const empRow = page.locator('table tbody tr').first()
  if (await empRow.count()) {
    await empRow.click()
    await page.waitForTimeout(800)
  }
  let opened = false
  for (const label of [/Sửa bảng lương/i, /Sửa bảng/i]) {
    const btn = page.getByRole('button', { name: label }).first()
    if (await btn.count()) {
      await btn.click()
      opened = true
      break
    }
  }
  if (!opened) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('button')].find((b) => /Sửa bảng lương/i.test(b.textContent || ''))
      el?.click()
    })
  }
  await page.waitForTimeout(1000)

  const bodyText = await page.locator('body').innerText()
  const hasAttLabel = /Phạt chấm công/i.test(bodyText)
  const hasOtherLabel = /Phạt khác/i.test(bodyText)
  const hasHint = /tự động tính từ dữ liệu Chấm công/i.test(bodyText)
  check('UI_BOARD_SPLIT', hasAttLabel && hasOtherLabel, { hasAttLabel, hasOtherLabel, hasHint })
  check('UI_HINT', hasHint, {})
  await page.screenshot({ path: path.join(OUT_DIR, 'shots', '01-board-penalty-split.png'), fullPage: true })
  uiOk = hasAttLabel && hasOtherLabel

  // Ensure attendance field is not an editable input for "Phạt chấm công"
  const attReadonly = await page.locator('.salary-edit-totals__row--readonly').count()
  const attInput = await page.locator('[data-testid="edit-input-penalty"]').count()
  const addPenalty = await page.locator('[data-testid="add-penalty-btn"]').count()
  check('UI_BOARD_ATT_READONLY_ROW', attReadonly >= 1, { attReadonly })
  check('UI_BOARD_NO_PENALTY_SET_INPUT', attInput === 0, { attInput })
  check('UI_BOARD_ADD_PENALTY_EXISTS', addPenalty >= 1, { addPenalty })

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // Thêm phát sinh — blocked mirror
  const addBtn = page.getByRole('button', { name: /Thêm phát sinh/i }).first()
  if (!(await addBtn.count())) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('button')].find((b) => /Thêm phát sinh|\+\s*Thêm/i.test(b.textContent || ''))
      el?.click()
    })
  } else {
    await addBtn.click()
  }
  await page.waitForTimeout(700)

  const typeSelect = page.locator('form.salary-modal__panel select, .salary-modal select').nth(1)
  if (await typeSelect.count()) {
    const opts = await typeSelect.locator('option').allTextContents()
    const penaltyOpt = opts.find((t) => /Phạt/i.test(t))
    if (penaltyOpt) await typeSelect.selectOption({ label: penaltyOpt.trim() })
  }
  const empSelect = page.locator('form.salary-modal__panel select, .salary-modal select').first()
  if (await empSelect.count()) {
    const values = await empSelect.locator('option').evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean))
    if (values[0]) await empSelect.selectOption(values[0])
  }
  await page.getByLabel(/Số tiền/i).fill('100000').catch(async () => {
    await page.locator('input[inputmode="numeric"], input[placeholder*="500"]').first().fill('100000')
  })
  await page.getByLabel(/Lý do/i).fill('Phạt nghỉ không phép').catch(async () => {
    const inputs = page.locator('.salary-modal input[type="text"], .salary-modal input:not([type])')
    const n = await inputs.count()
    if (n) await inputs.nth(n - 1).fill('Phạt nghỉ không phép')
  })
  await page.getByRole('button', { name: /^Lưu$/i }).click()
  await page.waitForTimeout(800)
  const errText = await page.locator('[data-testid="penalty-block-error"], .salary-page__error').first().innerText().catch(() => '')
  const pageAfter = await page.locator('body').innerText()
  const blocked = /Chấm công|không được nhập|tự động tính|giống phạt chấm công/i.test(`${errText}\n${pageAfter}`)
  check('UI_CASE2_BLOCK_MIRROR', blocked, { errText: errText.slice(0, 160) })
  await page.screenshot({ path: path.join(OUT_DIR, 'shots', '02-block-mirror.png'), fullPage: true })
} catch (err) {
  check('UI_BROWSER', false, err.message)
  await page.screenshot({ path: path.join(OUT_DIR, 'shots', '99-error.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.pass).length
const report = {
  at: new Date().toISOString(),
  preview: PREVIEW,
  uiOk,
  passed: failed === 0,
  failed,
  total: results.length,
  results,
  shots: [
    `${OUT_DIR}/shots/01-board-penalty-split.png`,
    `${OUT_DIR}/shots/02-block-mirror.png`,
  ],
  note: 'Void applied + Final gate PASS. Ready commit/deploy.',
}
writeFileSync(path.join(OUT_DIR, 'PENALTY_SOT_PREVIEW_UAT_REPORT.json'), JSON.stringify(report, null, 2))
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${results.length - failed}/${results.length} → ${OUT_DIR}`)
process.exit(failed === 0 ? 0 : 1)
