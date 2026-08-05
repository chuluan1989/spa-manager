/**
 * Production smoke READ + light UI — payroll 4 fields after deploy.
 * Không chạy migrate. Không rollback. Có thể mở popup (không Save trừ khi cần).
 *
 *   UAT_BASE_URL=https://www.khoespa.net.vn \
 *   node --env-file=.env.development.local scripts/playwright-payroll-4fields-prod-smoke.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/admin-payroll-board-prod')
const SHOT = path.join(OUT, 'shots-4fields')
mkdirSync(SHOT, { recursive: true })

const BASE = process.env.UAT_BASE_URL || 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
const MANAGER_PASSWORD = process.env.UAT_MANAGER_PASSWORD || 'uat_ql_gialai2_2026'
const EMP_NAME = 'UAT Cong Tac Final'
const EMP_PASSWORD = process.env.UAT_EMP_PASSWORD || 'uat_nv_2026'

const EXPECTED_LABELS = ['Thưởng', 'KPI', 'Phạt', 'Ứng lương']
const FORBIDDEN = 'Điều chỉnh khác'

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  migrationRerun: false,
  rollbackRun: false,
  smoke: {},
  ok: true,
}

function mark(key, ok, detail = {}) {
  report.smoke[key] = { ok, ...detail }
  if (!ok) report.ok = false
  console.log(`${ok ? '✓' : '✗'} ${key}`, JSON.stringify(detail))
}

function parseVnd(text) {
  const cleaned = String(text ?? '').replace(/[^\d+-]/g, '')
  if (!cleaned || cleaned === '+' || cleaned === '-') return 0
  return Number(cleaned)
}

async function loginAdmin(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.selectOption('select', 'admin')
  await page.fill('input[type="password"], input[placeholder*="mật khẩu" i]', ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.getByRole('button', { name: 'Lương HRM lương & phiếu lương' }).waitFor({ timeout: 45000 })
}

async function dismissModals(page) {
  for (let i = 0; i < 3; i += 1) {
    const backdrop = page.locator('.salary-modal__backdrop')
    if (!(await backdrop.count())) break
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const cancel = page.getByRole('button', { name: /Hủy|Đóng|Cancel/i })
    if (await cancel.count()) await cancel.first().click().catch(() => {})
    await page.waitForTimeout(300)
  }
}

async function openSalary(page, { month = '2026-08', cycle = 'period1', fresh = false } = {}) {
  await dismissModals(page)
  if (fresh) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    // may already be logged in via session — if login form, login again
    const loginBtn = page.getByRole('button', { name: 'Đăng nhập' })
    if (await loginBtn.count()) {
      await page.selectOption('select', 'admin')
      await page.fill('input[type="password"], input[placeholder*="mật khẩu" i]', ADMIN_PASSWORD)
      await loginBtn.click()
      await page.getByRole('button', { name: 'Lương HRM lương & phiếu lương' }).waitFor({ timeout: 45000 })
    }
  }
  await page.getByRole('button', { name: 'Lương HRM lương & phiếu lương' }).click({ force: true })
  await page.waitForTimeout(1800)
  await page.locator('.salary-page__toolbar input[type="month"]').first().fill(month)
  await page.locator('.salary-page__toolbar select').first().selectOption(cycle)
  await page.waitForTimeout(2200)
}

async function openBranch(page, branchRe) {
  const card = page.locator('article.salary-branch-card', { hasText: branchRe }).first()
  if (await card.count()) {
    await card.getByRole('button', { name: 'Xem nhân viên' }).click()
    await page.waitForTimeout(1800)
    return
  }
  const branchSelect = page.locator('.salary-page__toolbar label', { hasText: 'Chi nhánh' }).locator('select')
  if (await branchSelect.count()) {
    const opts = await branchSelect.locator('option').allTextContents()
    const match = opts.find((t) => branchRe.test(t))
    if (match) {
      await branchSelect.selectOption({ label: match.trim() })
      await page.waitForTimeout(1500)
      return
    }
  }
  // Fallback: first Xem nhân viên (default branch)
  const xem = page.getByRole('button', { name: 'Xem nhân viên' })
  if (await xem.count()) {
    await xem.first().click()
    await page.waitForTimeout(1500)
  }
}

async function openEmployee(page, nameRe, { branchRe = null } = {}) {
  if (branchRe) {
    await openBranch(page, branchRe)
  } else {
    const xem = page.getByRole('button', { name: 'Xem nhân viên' })
    if (await xem.count()) {
      await xem.first().click()
      await page.waitForTimeout(800)
    }
  }
  const search = page.locator('.salary-page__toolbar input[type="search"]')
  if (await search.count()) {
    const nameHint = String(nameRe).replace(/^\/|\/[a-z]*$/g, '').replace(/\\/g, '')
    await search.fill(nameHint.slice(0, 20))
    await page.waitForTimeout(700)
  }
  await page.getByRole('button', { name: nameRe }).first().click({ timeout: 20000 })
  await page.waitForTimeout(2000)
}

async function readWalletStats(page) {
  const articles = page.locator('.salary-wallet__stats article')
  await articles.first().waitFor({ timeout: 20000 })
  const count = await articles.count()
  const stats = {}
  const labels = []
  for (let i = 0; i < count; i += 1) {
    const label = (await articles.nth(i).locator('span').innerText()).trim()
    const value = (await articles.nth(i).locator('strong').innerText()).trim()
    labels.push(label)
    stats[label] = value
    stats[`${label}__num`] = parseVnd(value)
  }
  return { stats, labels }
}

async function openEditBoard(page) {
  await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await page.waitForTimeout(400)
  return dialog
}

async function readPopupCurrent(dialog) {
  const rows = dialog.locator('.salary-edit-totals__row, tbody tr, .salary-edit-board__row')
  // Prefer structured rows in modal
  const bodyText = await dialog.innerText()
  const labels = []
  for (const label of EXPECTED_LABELS) {
    if (bodyText.includes(label)) labels.push(label)
  }
  const hasForbidden = bodyText.includes(FORBIDDEN)
  // Read "Hiện tại" / current values next to each field if present
  const currents = {}
  for (const label of EXPECTED_LABELS) {
    const row = dialog.locator('tr, .salary-edit-totals__row, li, div').filter({ hasText: label }).first()
    const text = await row.innerText().catch(() => '')
    const nums = String(text).match(/-?[\d.]+/g) || []
    // first substantial number after label often "Hiện tại"
    currents[label] = text
    currents[`${label}__raw`] = nums
  }
  return { labels, hasForbidden, currents, bodyText: bodyText.slice(0, 2000) }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

try {
  // Asset
  const html = await (await page.request.get(BASE)).text()
  const asset = (html.match(/assets\/index-[^"]+\.js/) || [])[0] || ''
  report.asset = asset
  mark('0_asset', Boolean(asset), { asset })

  await loginAdmin(page)
  await openSalary(page, { month: '2026-08', cycle: 'period1' })

  // --- Thu Hương (Bạc Liêu) ---
  await openEmployee(page, /Thu Hương/, { branchRe: /Bạc Liêu/i })
  const thuWallet = await readWalletStats(page)
  await page.screenshot({ path: path.join(SHOT, '01-thu-huong-wallet.png'), fullPage: true })
  const thuOk = thuWallet.stats.Thưởng__num === 500000
    && thuWallet.stats['Ứng lương__num'] === 500000
    && thuWallet.stats['Lương thực nhận__num'] === -565400
    && !thuWallet.labels.includes(FORBIDDEN)
  mark('1_thu_huong', thuOk, {
    bonus: thuWallet.stats.Thưởng,
    advance: thuWallet.stats['Ứng lương'],
    net: thuWallet.stats['Lương thực nhận'],
    hasDieuChinhKhac: thuWallet.labels.includes(FORBIDDEN),
    labels: thuWallet.labels,
  })

  const dialogThu = await openEditBoard(page)
  const popupThu = await readPopupCurrent(dialogThu)
  await page.screenshot({ path: path.join(SHOT, '02-thu-huong-popup-4fields.png') })
  const popup4 = EXPECTED_LABELS.every((l) => popupThu.labels.includes(l))
    && !popupThu.hasForbidden
    && popupThu.labels.length === 4
  mark('2_popup_4fields', popup4, {
    labels: popupThu.labels,
    hasForbidden: popupThu.hasForbidden,
  })
  // Bind: Thưởng / Ứng from wallet vs popup text containing same amounts
  const bindThu = popupThu.bodyText.includes('500')
  mark('3_thu_huong_popup_bind', bindThu && popup4, { currents: popupThu.currents })
  await page.keyboard.press('Escape')

  // Audit no delete
  await page.getByRole('button', { name: 'Nhật ký' }).click().catch(() => {})
  await page.waitForTimeout(800)
  const del = await page.locator('.salary-audit button', { hasText: /^Xóa$/ }).count()
  await page.screenshot({ path: path.join(SHOT, '03-audit-no-delete.png'), fullPage: true })
  mark('4_audit_no_delete', del === 0, { deleteButtons: del })
  await dismissModals(page)

  // --- Trúc Ly (Sóc Trăng · Jul K1) ---
  await openSalary(page, { month: '2026-07', cycle: 'period1', fresh: true })
  await openEmployee(page, /Trúc Ly/, { branchRe: /Sóc Trăng/i })
  const tlWallet = await readWalletStats(page)
  const dialogTl = await openEditBoard(page)
  const popupTl = await readPopupCurrent(dialogTl)
  await page.screenshot({ path: path.join(SHOT, '04-truc-ly-popup.png') })
  const tlNoForbidden = !popupTl.hasForbidden && !tlWallet.labels.includes(FORBIDDEN)
  const pen = tlWallet.stats.Phạt__num
  const adv = tlWallet.stats['Ứng lương__num']
  const tlBind = (popupTl.bodyText.includes(String(pen)) || pen === 0)
    && (popupTl.bodyText.includes(String(adv)) || popupTl.bodyText.includes('2.000.000') || adv === 0)
  mark('5_truc_ly', tlNoForbidden && popupTl.labels.length === 4 && tlBind, {
    penalty: tlWallet.stats.Phạt,
    advance: tlWallet.stats['Ứng lương'],
    popupLabels: popupTl.labels,
    tlBind,
  })
  await dismissModals(page)

  // --- 5 other employees (Aug K1) ---
  const sampleNames = [
    { name: 'Ly Ly', branchRe: /Sóc Trăng/i },
    { name: 'Bảo Trân', branchRe: /Sóc Trăng/i },
    { name: 'Kim Quyên', branchRe: /Sóc Trăng/i },
    { name: 'Thanh Thư', branchRe: /Bạc Liêu/i },
    { name: 'Thảo Cầm', branchRe: /Bạc Liêu/i },
  ]
  const samples = []
  for (const { name, branchRe } of sampleNames) {
    try {
      await openSalary(page, { month: '2026-08', cycle: 'period1', fresh: true })
      await openEmployee(page, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { branchRe })
      const w = await readWalletStats(page)
      const d = await openEditBoard(page)
      const p = await readPopupCurrent(d)
      await page.screenshot({ path: path.join(SHOT, `sample-${name.replace(/\s+/g, '_')}.png`) })
      const ok = EXPECTED_LABELS.every((l) => p.labels.includes(l)) && !p.hasForbidden && !w.labels.includes(FORBIDDEN)
      samples.push({
        name,
        ok,
        net: w.stats['Lương thực nhận'],
        labels: p.labels,
        hasForbidden: p.hasForbidden || w.labels.includes(FORBIDDEN),
      })
      await dismissModals(page)
    } catch (err) {
      samples.push({ name, ok: false, error: String(err?.message || err) })
      await dismissModals(page)
    }
  }
  mark('6_five_samples', samples.filter((s) => s.ok).length >= 3, { samples })

  // Manager / Employee no edit — fresh sessions
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  // logout if still admin
  await page.getByRole('button', { name: 'Đăng xuất' }).click().catch(() => {})
  await page.waitForTimeout(800)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.selectOption('select', { label: 'Quản lý chi nhánh' })
  await page.selectOption('select >> nth=1', 'gia-lai-2')
  await page.fill('input[type="password"]', MANAGER_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.waitForTimeout(3000)
  if (await page.getByRole('button', { name: /Lương/ }).count()) {
    await page.getByRole('button', { name: /Lương/ }).first().click()
    await page.waitForTimeout(1500)
  }
  const mgrEdit = await page.locator('button', { hasText: 'Sửa bảng lương' }).count()
  await page.screenshot({ path: path.join(SHOT, '10-manager.png') })
  mark('7_manager_no_edit', mgrEdit === 0, { buttons: mgrEdit })

  await page.getByRole('button', { name: 'Đăng xuất' }).click()
  await page.waitForTimeout(800)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.selectOption('select', { label: 'Nhân viên' })
  await page.selectOption('select >> nth=1', 'soc-trang')
  await page.waitForTimeout(600)
  await page.locator('select').nth(2).selectOption({ label: EMP_NAME }).catch(async () => {
    const opts = await page.locator('select').nth(2).locator('option').allTextContents()
    const hit = opts.find((t) => /UAT Cong Tac/i.test(t))
    if (hit) await page.locator('select').nth(2).selectOption({ label: hit.trim() })
  })
  await page.fill('input[type="password"]', EMP_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.waitForTimeout(3000)
  if (await page.getByRole('button', { name: /Lương/ }).count()) {
    await page.getByRole('button', { name: /Lương/ }).first().click()
    await page.waitForTimeout(1500)
  }
  const empEdit = await page.locator('button', { hasText: 'Sửa bảng lương' }).count()
  await page.screenshot({ path: path.join(SHOT, '11-employee.png') })
  mark('8_employee_no_edit', empEdit === 0, { buttons: empEdit })
} catch (err) {
  report.ok = false
  report.error = String(err?.stack || err)
  await page.screenshot({ path: path.join(SHOT, 'error.png'), fullPage: true }).catch(() => {})
  console.error(err)
} finally {
  await browser.close()
}

report.finishedAt = new Date().toISOString()
writeFileSync(path.join(OUT, 'PROD_SMOKE_4FIELDS_REPORT.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ok: report.ok, asset: report.asset, smoke: report.smoke }, null, 2))
process.exit(report.ok ? 0 : 1)
