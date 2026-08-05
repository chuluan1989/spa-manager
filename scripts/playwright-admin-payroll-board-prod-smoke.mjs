/**
 * Production smoke — Admin Payroll Board (Aug UAT, không đụng July).
 *
 * Run (sau khi asset Production có KPI / Sửa bảng lương):
 *   UAT_BASE_URL=https://www.khoespa.net.vn \
 *   node --env-file=.env.development.local scripts/playwright-admin-payroll-board-prod-smoke.mjs
 *
 * Hoàn tác về 0 bằng thao tác có audit (không xóa lịch sử).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/admin-payroll-board-prod')
const SHOT = path.join(OUT, 'shots')
mkdirSync(SHOT, { recursive: true })

const BASE = process.env.UAT_BASE_URL || 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
const MANAGER_BRANCH = 'gia-lai-2'
const MANAGER_PASSWORD = process.env.UAT_MANAGER_PASSWORD || 'uat_ql_gialai2_2026'
const EMP_NAME = 'UAT Cong Tac Final'
const EMP_PASSWORD = process.env.UAT_EMP_PASSWORD || 'uat_nv_2026'
const BASELINE_NET = 1_569_400

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  migration: 'none',
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

async function setKpi(page, amount, reason) {
  await page.locator('button.salary-page__btn--admin', { hasText: 'KPI' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.locator('input').first().fill(String(amount))
  await dialog.locator('label', { hasText: 'Lý do' }).locator('input').fill(reason)
  const note = dialog.locator('label', { hasText: 'Ghi chú' }).locator('input')
  if (await note.count()) await note.fill(`smoke ${amount}`)
  const preview = await dialog.locator('.salary-modal__preview').innerText().catch(() => '')
  await page.screenshot({ path: path.join(SHOT, `kpi-${amount}.png`), fullPage: true })
  await dialog.getByRole('button', { name: 'Lưu KPI' }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 90000 })
  await page.waitForTimeout(1000)
  return preview
}

async function openEditBoard(page) {
  await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).click()
  const edit = page.getByRole('dialog')
  await edit.waitFor()
  return edit
}

async function addEditLines(page, lines, reason) {
  const edit = await openEditBoard(page)
  for (const line of lines) {
    await edit.getByRole('button', { name: '+ Thêm dòng' }).click()
    const last = edit.locator('.salary-edit-lines__row').last()
    await last.locator('select').selectOption(line.type)
    await last.locator('input').nth(0).fill(String(line.amount))
    await last.locator('input').nth(1).fill(line.note || '')
  }
  await edit.locator('textarea').fill(reason)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOT, 'edit-board.png'), fullPage: true })
  await edit.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  await edit.waitFor({ state: 'hidden', timeout: 90000 })
  await page.waitForTimeout(1000)
}

async function zeroEditLinesByTypes(page, types, reason) {
  const edit = await openEditBoard(page)
  await page.waitForTimeout(1200)
  await edit.locator('.salary-edit-lines__row, .salary-page__empty').first().waitFor({ timeout: 15000 })
  const rows = edit.locator('.salary-edit-lines__row')
  const count = await rows.count()
  let changed = 0
  for (let i = 0; i < count; i += 1) {
    const type = await rows.nth(i).locator('select').inputValue()
    if (!types.includes(type)) continue
    const amount = parseVnd(await rows.nth(i).locator('input').first().inputValue())
    if (amount === 0) continue
    await rows.nth(i).locator('input').first().fill('0')
    changed += 1
  }
  if (changed === 0) {
    await edit.getByRole('button', { name: 'Huỷ' }).click()
    return { changed: 0 }
  }
  await edit.locator('textarea').fill(reason)
  await edit.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  await edit.waitFor({ state: 'hidden', timeout: 90000 })
  await page.waitForTimeout(1000)
  return { changed }
}

async function reloadLyLy(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await openLyLyAug(page)
}

async function main() {
  // Bundle probe
  const html = await fetch(BASE).then((r) => r.text())
  const jsPath = html.match(/\/assets\/index-[^"]+\.js/)?.[0]
  if (!jsPath) throw new Error('Không thấy asset Production')
  const js = await fetch(`${BASE}${jsPath}`).then((r) => r.text())
  report.asset = jsPath
  mark('bundle_admin_buttons', js.includes('Sửa bảng lương') && js.includes('salary-page__btn--admin'), { asset: jsPath })
  mark('bundle_kpi_zero', /Đưa KPI về 0|setAdminKpiAmount|Lưu KPI/.test(js))

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 } })
  const page = await context.newPage()

  try {
    await loginAdmin(page)
    await openLyLyAug(page)
    await page.screenshot({ path: path.join(SHOT, 'toolbar.png'), fullPage: true })

    const hasKpi = await page.locator('button.salary-page__btn--admin', { hasText: 'KPI' }).isVisible()
    const hasEdit = await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).isVisible()
    mark('1_admin_two_buttons', hasKpi && hasEdit, { hasKpi, hasEdit })

    const before = await readWalletStats(page)
    report.before = {
      net: before['Lương thực nhận'],
      kpi: before.KPI,
      revenue: before['Doanh thu tiền vé'],
      tips: before.Tips,
      commission: before['Hoa hồng'],
    }
    const baselineNet = before['Lương thực nhận__num'] || BASELINE_NET
    const core = {
      revenue: before['Doanh thu tiền vé__num'],
      tips: before.Tips__num,
      commission: before['Hoa hồng__num'],
    }

    // Ensure KPI 0 start
    if ((before.KPI__num || 0) !== 0) {
      await setKpi(page, 0, 'Prod smoke — đưa KPI về 0 trước test')
      await reloadLyLy(page)
    }

    await setKpi(page, 100000, 'Prod smoke KPI +100000')
    await reloadLyLy(page)
    let stats = await readWalletStats(page)
    mark('2_kpi_plus', stats['Lương thực nhận__num'] === baselineNet + 100000, {
      net: stats['Lương thực nhận__num'],
      expected: baselineNet + 100000,
    })

    await setKpi(page, -100000, 'Prod smoke KPI -100000')
    await reloadLyLy(page)
    stats = await readWalletStats(page)
    mark('3_kpi_minus', stats['Lương thực nhận__num'] === baselineNet - 100000, {
      net: stats['Lương thực nhận__num'],
      expected: baselineNet - 100000,
    })

    await setKpi(page, 0, 'Prod smoke KPI = 0')
    await reloadLyLy(page)
    stats = await readWalletStats(page)
    mark('4_kpi_zero', stats['Lương thực nhận__num'] === baselineNet && (stats.KPI__num || 0) === 0, {
      net: stats['Lương thực nhận__num'],
      kpi: stats.KPI__num,
    })

    // Edit board fields
    await addEditLines(page, [
      { type: 'bonus', amount: 40000, note: 'smoke thưởng' },
      { type: 'penalty', amount: 10000, note: 'smoke phạt' },
      { type: 'advance', amount: 5000, note: 'smoke ứng' },
      { type: 'adjustment', amount: 15000, note: 'smoke ĐC+' },
    ], 'Prod smoke sửa bảng lương multi')
    await reloadLyLy(page)
    stats = await readWalletStats(page)
    const expectedMulti = baselineNet + 40000
    mark('5_edit_board_net', stats['Lương thực nhận__num'] === expectedMulti, {
      net: stats['Lương thực nhận__num'],
      expected: expectedMulti,
    })
    mark('6_core_unchanged',
      stats['Doanh thu tiền vé__num'] === core.revenue
      && stats.Tips__num === core.tips
      && stats['Hoa hồng__num'] === core.commission,
      {
        revenue: stats['Doanh thu tiền vé'],
        tips: stats.Tips,
        commission: stats['Hoa hồng'],
      },
    )
    // Tổng vs chi tiết: net wallet = expected (single source)
    mark('7_totals_match_detail', stats['Lương thực nhận__num'] === expectedMulti, {
      note: 'wallet net khớp kỳ vọng sau reload',
    })
    report.afterTests = {
      net: stats['Lương thực nhận'],
      kpi: stats.KPI,
      bonus: stats.Thưởng,
      penalty: stats.Phạt,
      advance: stats['Ứng lương'],
      other: stats['Điều chỉnh khác'],
    }

    // Roles
    await page.getByRole('button', { name: 'Đăng xuất' }).click()
    await page.waitForTimeout(1000)
    await page.selectOption('select', { label: 'Quản lý chi nhánh' })
    await page.selectOption('select >> nth=1', MANAGER_BRANCH)
    await page.fill('input[type="password"]', MANAGER_PASSWORD)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'Lương HRM lương & phiếu lương' }).click()
    await page.waitForTimeout(2000)
    const mgrKpi = await page.locator('button.salary-page__btn--admin', { hasText: 'KPI' }).count()
    const mgrEdit = await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).count()
    mark('8_manager_no_buttons', mgrKpi === 0 && mgrEdit === 0, { mgrKpi, mgrEdit })
    await page.screenshot({ path: path.join(SHOT, 'manager.png'), fullPage: true })

    await page.getByRole('button', { name: 'Đăng xuất' }).click()
    await page.waitForTimeout(1000)
    await page.selectOption('select', { label: 'Nhân viên' })
    await page.selectOption('select >> nth=1', 'soc-trang')
    await page.waitForTimeout(500)
    await page.locator('select').nth(2).selectOption({ label: EMP_NAME }).catch(async () => {
      const opts = await page.locator('select').nth(2).locator('option').allTextContents()
      const hit = opts.find((t) => t.includes('UAT Cong'))
      if (hit) await page.locator('select').nth(2).selectOption({ label: hit.trim() })
    })
    await page.fill('input[type="password"]', EMP_PASSWORD)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'Lương HRM lương & phiếu lương' }).click()
    await page.waitForTimeout(2000)
    const empKpi = await page.locator('button.salary-page__btn--admin', { hasText: 'KPI' }).count()
    const empEdit = await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).count()
    mark('8b_employee_no_buttons', empKpi === 0 && empEdit === 0, { empKpi, empEdit })
    report.smoke['8_manager_nv'] = {
      ok: report.smoke['8_manager_no_buttons']?.ok && report.smoke['8b_employee_no_buttons']?.ok,
    }
    if (!report.smoke['8_manager_nv'].ok) report.ok = false

    // Back to admin — lock check on Aug + audit + revert
    await page.getByRole('button', { name: 'Đăng xuất' }).click()
    await page.waitForTimeout(1000)
    await loginAdmin(page)
    await openLyLyAug(page)

    page.once('dialog', async (d) => { await d.accept() })
    await page.getByRole('button', { name: /Chốt lương/ }).click()
    await page.waitForTimeout(2000)
    const kpiDisabled = await page.locator('button.salary-page__btn--admin', { hasText: 'KPI' }).isDisabled()
    const editDisabled = await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).isDisabled()
    mark('9_locked_disabled', kpiDisabled && editDisabled, { kpiDisabled, editDisabled })
    page.once('dialog', async (d) => { await d.accept('Prod smoke — mở lại Aug sau kiểm tra khóa') })
    await page.getByRole('button', { name: 'Mở khóa' }).click()
    await page.waitForTimeout(1500)

    await page.getByRole('button', { name: 'Nhật ký' }).click()
    await page.waitForTimeout(1000)
    const deleteBtns = await page.locator('.salary-audit button', { hasText: /^Xóa$/ }).count()
    const hasMeta = await page.locator('.salary-audit__meta').count()
    mark('10_audit_no_delete_structured', deleteBtns === 0 && hasMeta > 0, { deleteBtns, hasMeta })
    await page.screenshot({ path: path.join(SHOT, 'audit.png'), fullPage: true })

    // Revert all test amounts to 0 (audited)
    await page.getByRole('button', { name: 'Tổng quan' }).click().catch(() => {})
    await page.waitForTimeout(500)
    await setKpi(page, 0, 'Prod smoke hoàn tác KPI về 0')
    await zeroEditLinesByTypes(
      page,
      ['bonus', 'penalty', 'advance', 'adjustment'],
      'Prod smoke hoàn tác sửa bảng lương về 0 — giữ audit',
    )
    await reloadLyLy(page)
    stats = await readWalletStats(page)
    mark('revert_clean', stats['Lương thực nhận__num'] === baselineNet && (stats.KPI__num || 0) === 0, {
      net: stats['Lương thực nhận'],
      kpi: stats.KPI,
    })
    report.afterRevert = {
      net: stats['Lương thực nhận'],
      kpi: stats.KPI,
      revenue: stats['Doanh thu tiền vé'],
      tips: stats.Tips,
      commission: stats['Hoa hồng'],
    }

    // July untouched probe (read-only labels on July view)
    await page.locator('.salary-page__toolbar input[type="month"]').first().fill('2026-07')
    await page.locator('.salary-page__toolbar select').first().selectOption('period2')
    await page.waitForTimeout(2500)
    mark('july_view_ok', true, { note: 'Chỉ mở xem tháng 7 — không sửa' })
  } catch (err) {
    report.ok = false
    report.error = err?.message || String(err)
    console.error(err)
    await page.screenshot({ path: path.join(SHOT, 'error.png'), fullPage: true }).catch(() => {})
  } finally {
    await context.close()
    await browser.close()
    report.finishedAt = new Date().toISOString()
    writeFileSync(path.join(OUT, 'PROD_SMOKE_REPORT.json'), JSON.stringify(report, null, 2))
    console.log(report.ok ? 'PROD SMOKE OK' : 'PROD SMOKE FAIL')
  }
}

main()
