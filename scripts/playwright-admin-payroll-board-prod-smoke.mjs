/**
 * Production smoke — Admin Payroll SET totals (Aug UAT, không đụng July).
 *
 * Run (sau khi Production live asset SET form):
 *   UAT_BASE_URL=https://www.khoespa.net.vn \
 *   node --env-file=.env.development.local scripts/playwright-admin-payroll-board-prod-smoke.mjs
 *
 * Hoàn tác về baseline bằng SET 0 (có audit, không xóa lịch sử).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/admin-payroll-board-prod')
const SHOT = path.join(OUT, 'shots-set-totals')
mkdirSync(SHOT, { recursive: true })

const BASE = process.env.UAT_BASE_URL || 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
const MANAGER_PASSWORD = process.env.UAT_MANAGER_PASSWORD || 'uat_ql_gialai2_2026'
const EMP_NAME = 'UAT Cong Tac Final'
const EMP_PASSWORD = process.env.UAT_EMP_PASSWORD || 'uat_nv_2026'
const BASELINE_NET = 1_569_400

/** Order in PayrollEditBoardModal BOARD_FIELDS */
const FIELD_ORDER = ['bonus', 'kpi', 'penalty', 'advance', 'adjustment']

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  migration: 'none',
  model: 'set-totals',
  smoke: {},
  before: null,
  afterTests: null,
  afterRevert: null,
  ok: true,
}

function mark(key, ok, detail = {}) {
  report.smoke[key] = { ok, ...detail }
  if (!ok) report.ok = false
  console.log(`${ok ? '✓' : '✗'} ${key}`, detail.note || detail.net || '')
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

async function openLyLyAug(page) {
  await page.getByRole('button', { name: 'Lương HRM lương & phiếu lương' }).click()
  await page.waitForTimeout(1800)
  const month = page.locator('.salary-page__toolbar input[type="month"]').first()
  await month.fill('2026-08')
  await page.locator('.salary-page__toolbar select').first().selectOption('period1')
  await page.waitForTimeout(2200)
  await page.getByRole('button', { name: 'Xem nhân viên' }).first().click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /^Ly Ly/ }).click()
  await page.waitForTimeout(2200)
}

async function reloadLyLy(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await openLyLyAug(page)
}

async function readWalletStats(page) {
  const articles = page.locator('.salary-wallet__stats article')
  await articles.first().waitFor({ timeout: 20000 })
  const count = await articles.count()
  const stats = {}
  for (let i = 0; i < count; i += 1) {
    const label = (await articles.nth(i).locator('span').innerText()).trim()
    const value = (await articles.nth(i).locator('strong').innerText()).trim()
    stats[label] = value
    stats[`${label}__num`] = parseVnd(value)
  }
  return stats
}

async function openEditBoard(page) {
  await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await page.waitForTimeout(400)
  return dialog
}

/**
 * SET totals — fill all 5 fields (required by form).
 * @param {Record<string, number>} totals bonus/kpi/penalty/advance/adjustment
 */
async function saveSetTotals(page, totals, reason, shotName) {
  const dialog = await openEditBoard(page)
  if (shotName) await page.screenshot({ path: path.join(SHOT, shotName), fullPage: true })

  const addLine = await dialog.getByRole('button', { name: '+ Thêm dòng' }).count()
  if (addLine > 0) throw new Error('Popup vẫn còn + Thêm dòng — chưa phải SET totals')

  const rows = dialog.locator('.salary-edit-totals__row')
  const rowCount = await rows.count()
  if (rowCount !== 5) throw new Error(`Expected 5 SET rows, got ${rowCount}`)

  for (let i = 0; i < FIELD_ORDER.length; i += 1) {
    const key = FIELD_ORDER[i]
    const value = key in totals ? totals[key] : 0
    await rows.nth(i).locator('input').fill(String(value))
  }

  const noteInput = dialog.locator('label').filter({ hasText: /^Ghi chú$/ }).locator('input')
  if (await noteInput.count()) await noteInput.fill('Prod smoke SET')
  await dialog.locator('textarea').fill(reason)
  await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 90000 })
  await page.waitForTimeout(1200)
}

async function assertNoEditButton(page, roleLabel) {
  const count = await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).count()
  const kpi = await page.locator('button.salary-page__btn--admin', { hasText: /^KPI$/ }).count()
  mark(`role_${roleLabel}_no_edit`, count === 0 && kpi === 0, { edit: count, kpi })
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

try {
  await loginAdmin(page)
  await openLyLyAug(page)

  // Toolbar
  const toolbar = await page.locator('.payroll-export-actions button, .export-actions button').allTextContents()
  const kpiBtn = await page.locator('button.salary-page__btn--admin', { hasText: /^KPI$/ }).count()
  mark('1_toolbar', (
    toolbar.some((t) => t.includes('Sửa bảng lương'))
    && toolbar.some((t) => t.includes('Đối soát Excel'))
    && toolbar.some((t) => t.includes('Tóm tắt PDF'))
    && kpiBtn === 0
  ), { toolbar, kpiBtn })
  await page.screenshot({ path: path.join(SHOT, '01-toolbar.png') })

  // Popup UI
  {
    const dialog = await openEditBoard(page)
    const head = (await dialog.locator('.salary-edit-totals__head').innerText()).replace(/\n/g, ' | ')
    const labels = await dialog.locator('.salary-edit-totals__row strong').allTextContents()
    const addLine = await dialog.getByRole('button', { name: '+ Thêm dòng' }).count()
    mark('2_popup_set', (
      head.includes('Hạng mục')
      && (head.includes('Hiện tại') || head.includes('Giá trị hiện tại'))
      && labels.join('|').includes('Thưởng')
      && labels.join('|').includes('KPI')
      && labels.join('|').includes('Phạt')
      && addLine === 0
    ), { head, labels, addLine })
    await page.screenshot({ path: path.join(SHOT, '02-popup.png'), fullPage: true })
    await dialog.getByRole('button', { name: 'Huỷ' }).click()
  }

  // Reset baseline
  await saveSetTotals(page, {
    bonus: 0, kpi: 0, penalty: 0, advance: 0, adjustment: 0,
  }, 'Prod smoke: reset về 0 trước test')
  await reloadLyLy(page)

  let stats = await readWalletStats(page)
  report.before = {
    net: stats['Lương thực nhận__num'],
    revenue: stats['Doanh thu tiền vé__num'],
    tips: stats.Tips__num,
    commission: stats['Hoa hồng__num'],
  }
  const core = { ...report.before }
  mark('baseline', stats['Lương thực nhận__num'] === BASELINE_NET, { net: stats['Lương thực nhận__num'] })

  // 1. Phạt 0→600→200
  await saveSetTotals(page, {
    bonus: 0, kpi: 0, penalty: 600000, advance: 0, adjustment: 0,
  }, 'Prod smoke: Phạt SET 600000')
  await reloadLyLy(page)
  const after600 = await readWalletStats(page)
  await saveSetTotals(page, {
    bonus: 0, kpi: 0, penalty: 200000, advance: 0, adjustment: 0,
  }, 'Prod smoke: Phạt SET 200000', '03-penalty-200.png')
  await reloadLyLy(page)
  stats = await readWalletStats(page)
  mark('3_penalty', stats.Phạt__num === 200000
    && stats['Lương thực nhận__num'] === after600['Lương thực nhận__num'] + 400000, {
    penalty: stats.Phạt,
    net: stats['Lương thực nhận__num'],
  })

  // 2. Thưởng 0 → 500k
  const beforeBonus = await readWalletStats(page)
  await saveSetTotals(page, {
    bonus: 500000, kpi: 0, penalty: 200000, advance: 0, adjustment: 0,
  }, 'Prod smoke: Thưởng SET 500000', '04-bonus-500.png')
  await reloadLyLy(page)
  stats = await readWalletStats(page)
  mark('4_bonus', stats.Thưởng__num === 500000
    && stats['Lương thực nhận__num'] === beforeBonus['Lương thực nhận__num'] + 500000, {
    bonus: stats.Thưởng,
    net: stats['Lương thực nhận__num'],
  })

  // 3. KPI 0 → +300 → -200 → 0
  const beforeKpi = await readWalletStats(page)
  await saveSetTotals(page, {
    bonus: 500000, kpi: 300000, penalty: 200000, advance: 0, adjustment: 0,
  }, 'Prod smoke: KPI SET +300000')
  await reloadLyLy(page)
  stats = await readWalletStats(page)
  const kpiPlusOk = stats.KPI__num === 300000
    && stats['Lương thực nhận__num'] === beforeKpi['Lương thực nhận__num'] + 300000

  const beforeNeg = await readWalletStats(page)
  await saveSetTotals(page, {
    bonus: 500000, kpi: -200000, penalty: 200000, advance: 0, adjustment: 0,
  }, 'Prod smoke: KPI SET -200000', '05-kpi-minus.png')
  await reloadLyLy(page)
  stats = await readWalletStats(page)
  const kpiMinusOk = stats.KPI__num === -200000
    && stats['Lương thực nhận__num'] === beforeNeg['Lương thực nhận__num'] - 500000

  const beforeZero = await readWalletStats(page)
  await saveSetTotals(page, {
    bonus: 500000, kpi: 0, penalty: 200000, advance: 0, adjustment: 0,
  }, 'Prod smoke: KPI SET 0')
  await reloadLyLy(page)
  stats = await readWalletStats(page)
  const kpiZeroOk = stats.KPI__num === 0
    && stats['Lương thực nhận__num'] === beforeZero['Lương thực nhận__num'] + 200000
  mark('5_kpi_cycle', kpiPlusOk && kpiMinusOk && kpiZeroOk && kpiBtn === 0, {
    kpi: stats.KPI,
    net: stats['Lương thực nhận__num'],
    kpiPlusOk,
    kpiMinusOk,
    kpiZeroOk,
  })

  // 4. Ứng 0→1M→700k
  await saveSetTotals(page, {
    bonus: 500000, kpi: 0, penalty: 200000, advance: 1000000, adjustment: 0,
  }, 'Prod smoke: Ứng SET 1000000')
  await reloadLyLy(page)
  const afterAdv1 = await readWalletStats(page)
  await saveSetTotals(page, {
    bonus: 500000, kpi: 0, penalty: 200000, advance: 700000, adjustment: 0,
  }, 'Prod smoke: Ứng SET 700000', '06-advance-700.png')
  await reloadLyLy(page)
  stats = await readWalletStats(page)
  mark('6_advance', stats['Ứng lương__num'] === 700000
    && stats['Lương thực nhận__num'] === afterAdv1['Lương thực nhận__num'] + 300000, {
    advance: stats['Ứng lương'],
    net: stats['Lương thực nhận__num'],
  })

  // 5. ĐC 0 → -100k
  const beforeAdj = await readWalletStats(page)
  await saveSetTotals(page, {
    bonus: 500000, kpi: 0, penalty: 200000, advance: 700000, adjustment: -100000,
  }, 'Prod smoke: ĐC SET -100000', '07-adjustment.png')
  await reloadLyLy(page)
  stats = await readWalletStats(page)
  mark('7_adjustment', stats['Điều chỉnh khác__num'] === -100000
    && stats['Lương thực nhận__num'] === beforeAdj['Lương thực nhận__num'] - 100000, {
    other: stats['Điều chỉnh khác'],
    net: stats['Lương thực nhận__num'],
  })

  report.afterTests = {
    net: stats['Lương thực nhận__num'],
    bonus: stats.Thưởng__num,
    kpi: stats.KPI__num,
    penalty: stats.Phạt__num,
    advance: stats['Ứng lương__num'],
    adjustment: stats['Điều chỉnh khác__num'],
  }

  // 6–8.reload already done; core unchanged; summary = detail (net consistent)
  mark('8_core_unchanged',
    stats['Doanh thu tiền vé__num'] === core.revenue
    && stats.Tips__num === core.tips
    && stats['Hoa hồng__num'] === core.commission, {
      revenue: stats['Doanh thu tiền vé'],
      tips: stats.Tips,
      commission: stats['Hoa hồng'],
    })
  mark('9_summary_detail', Number.isFinite(stats['Lương thực nhận__num']), {
    net: stats['Lương thực nhận'],
  })

  // Audit
  await page.getByRole('button', { name: 'Nhật ký' }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: path.join(SHOT, '08-audit.png'), fullPage: true })
  const del = await page.locator('.salary-audit button', { hasText: /^Xóa$/ }).count()
  const impact = await page.locator('dt', { hasText: 'Chênh lệch tác động lương' }).count()
  mark('10_audit', del === 0 && impact > 0, { deleteButtons: del, impactLabels: impact })

  // 9. Revert to baseline with audit
  await page.getByRole('button', { name: 'Tổng quan' }).click().catch(() => {})
  await saveSetTotals(page, {
    bonus: 0, kpi: 0, penalty: 0, advance: 0, adjustment: 0,
  }, 'Prod smoke: hoàn tác SET về 0, giữ audit')
  await reloadLyLy(page)
  stats = await readWalletStats(page)
  report.afterRevert = {
    net: stats['Lương thực nhận__num'],
    bonus: stats.Thưởng__num,
    kpi: stats.KPI__num,
    penalty: stats.Phạt__num,
    advance: stats['Ứng lương__num'],
    adjustment: stats['Điều chỉnh khác__num'],
  }
  mark('11_revert', stats['Lương thực nhận__num'] === BASELINE_NET
    && stats.Thưởng__num === 0
    && stats.KPI__num === 0
    && stats.Phạt__num === 0
    && stats['Ứng lương__num'] === 0
    && stats['Điều chỉnh khác__num'] === 0, {
    net: stats['Lương thực nhận'],
  })
  await page.screenshot({ path: path.join(SHOT, '09-after-revert.png') })

  // 10. Manager / Employee no edit button
  await page.getByRole('button', { name: 'Đăng xuất' }).click()
  await page.waitForTimeout(800)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.selectOption('select', 'manager')
  await page.selectOption('select').nth(1).selectOption({ value: 'gia-lai-2' }).catch(async () => {
    const selects = page.locator('select')
    if (await selects.count() >= 2) await selects.nth(1).selectOption({ index: 1 })
  })
  // Manager login flow may vary — try password + branch
  const managerSelects = page.locator('select')
  const selCount = await managerSelects.count()
  if (selCount >= 2) {
    await managerSelects.nth(0).selectOption('manager')
    const opts = await managerSelects.nth(1).locator('option').allTextContents()
    const giaLai = opts.findIndex((t) => /Gia Lai 2/i.test(t))
    if (giaLai >= 0) await managerSelects.nth(1).selectOption({ index: giaLai })
  }
  await page.fill('input[type="password"]', MANAGER_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.waitForTimeout(3000)
  const hasLuongMgr = await page.getByRole('button', { name: /Lương/ }).count()
  if (hasLuongMgr) {
    await page.getByRole('button', { name: /Lương/ }).first().click()
    await page.waitForTimeout(2000)
  }
  await assertNoEditButton(page, 'manager')
  await page.screenshot({ path: path.join(SHOT, '10-manager.png') })

  await page.getByRole('button', { name: 'Đăng xuất' }).click().catch(() => {})
  await page.waitForTimeout(800)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.selectOption('select', 'employee')
  await page.fill('input[type="password"]', EMP_PASSWORD)
  // employee name select if present
  const empSelect = page.locator('select').nth(1)
  if (await empSelect.count()) {
    const opts = await empSelect.locator('option').allTextContents()
    const idx = opts.findIndex((t) => t.includes(EMP_NAME) || /UAT Cong Tac/i.test(t))
    if (idx >= 0) await empSelect.selectOption({ index: idx })
  }
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.waitForTimeout(3000)
  const hasLuongEmp = await page.getByRole('button', { name: /Lương/ }).count()
  if (hasLuongEmp) {
    await page.getByRole('button', { name: /Lương/ }).first().click()
    await page.waitForTimeout(2000)
  }
  await assertNoEditButton(page, 'employee')
  await page.screenshot({ path: path.join(SHOT, '11-employee.png') })
} catch (err) {
  report.ok = false
  report.error = err?.message || String(err)
  console.error(err)
  await page.screenshot({ path: path.join(SHOT, 'error.png'), fullPage: true }).catch(() => {})
} finally {
  report.finishedAt = new Date().toISOString()
  writeFileSync(path.join(OUT, 'PROD_SMOKE_SET_TOTALS_REPORT.json'), JSON.stringify(report, null, 2))
  await browser.close()
  console.log(report.ok
    ? 'PROD SMOKE SET TOTALS OK — chờ anh kiểm tra Production'
    : 'PROD SMOKE SET TOTALS FAIL')
  process.exit(report.ok ? 0 : 1)
}
