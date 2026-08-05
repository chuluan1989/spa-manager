/**
 * Playwright UAT video — Admin Payroll Board (local, không deploy).
 *
 * Setup once:
 *   npm i -D playwright
 *   npx playwright install chromium
 *
 * Run:
 *   node --env-file=.env.development.local scripts/playwright-admin-payroll-board-uat.mjs
 *
 * Video: docs/uat-evidence/admin-payroll-board-local/video/
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/admin-payroll-board-local')
const VIDEO_DIR = path.join(OUT, 'video')
mkdirSync(VIDEO_DIR, { recursive: true })

const BASE = process.env.UAT_BASE_URL || 'http://127.0.0.1:5173'
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || 'admin123'
const MANAGER_BRANCH = 'gia-lai-2'
const MANAGER_PASSWORD = 'uat_ql_gialai2_2026'
const EMP_NAME = 'UAT Cong Tac Final'
const EMP_PASSWORD = 'uat_nv_2026'

const BASELINE_NET = 1_569_400

const report = { startedAt: new Date().toISOString(), steps: [], ok: true }

function step(name, detail = {}) {
  report.steps.push({ name, at: new Date().toISOString(), ...detail })
  console.log('•', name, detail.note || detail.amount || '')
}

function fail(name, detail = {}) {
  report.ok = false
  step(name, { ...detail, failed: true })
}

function parseVnd(text) {
  const cleaned = String(text ?? '').replace(/[^\d+-]/g, '')
  if (!cleaned || cleaned === '+' || cleaned === '-') return 0
  return Number(cleaned)
}

async function loginAdmin(page) {
  await page.goto(BASE)
  await page.selectOption('select', 'admin')
  await page.fill('input[type="password"], input[placeholder*="mật khẩu" i]', ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.getByRole('button', { name: 'Lương HRM lương & phiếu lương' }).waitFor({ timeout: 30000 })
  step('admin_login')
}

async function openLyLyAug(page) {
  await page.getByRole('button', { name: 'Lương HRM lương & phiếu lương' }).click()
  await page.waitForTimeout(1500)
  const month = page.locator('.salary-page__toolbar input[type="month"]').first()
  await month.fill('2026-08')
  await page.locator('.salary-page__toolbar select').first().selectOption('period1')
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: 'Xem nhân viên' }).first().click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /^Ly Ly/ }).click()
  await page.waitForTimeout(2000)
  step('open_lyly_aug')
}

async function readWalletStats(page) {
  const articles = page.locator('.salary-wallet__stats article')
  await articles.first().waitFor({ timeout: 15000 })
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

async function assertCoreUnchanged(page, baseline, tag) {
  const stats = await readWalletStats(page)
  const keys = ['Doanh thu tiền vé', 'Tips', 'Hoa hồng']
  for (const key of keys) {
    if (stats[`${key}__num`] !== baseline[`${key}__num`]) {
      fail('core_unchanged_fail', {
        tag,
        key,
        expected: baseline[key],
        actual: stats[key],
      })
    }
  }
  step('core_unchanged', {
    tag,
    revenue: stats['Doanh thu tiền vé'],
    tips: stats.Tips,
    commission: stats['Hoa hồng'],
  })
  return stats
}

async function setKpi(page, amount, reason) {
  await page.locator('button.salary-page__btn--admin', { hasText: 'KPI' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.locator('input').first().fill(String(amount))
  const reasonInput = dialog.locator('label', { hasText: 'Lý do' }).locator('input')
  await reasonInput.fill(reason)
  const preview = await dialog.locator('.salary-modal__preview').innerText().catch(() => '')
  await dialog.getByRole('button', { name: 'Lưu KPI' }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 60000 })
  await page.waitForTimeout(800)
  step('set_kpi', { amount, preview: preview.slice(0, 240) })
  return preview
}

async function openEditBoard(page) {
  await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).click()
  const edit = page.getByRole('dialog')
  await edit.waitFor()
  return edit
}

async function waitEditBoardClosed(page, edit) {
  await edit.waitFor({ state: 'hidden', timeout: 90000 })
  await page.waitForTimeout(800)
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
  // Đợi preview phản ánh dòng mới trước khi lưu
  await page.waitForTimeout(400)
  const preview = await edit.locator('.salary-modal__preview').innerText().catch(() => '')
  await edit.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  await waitEditBoardClosed(page, edit)
  return preview
}

/** Chỉ đưa về 0 các loại chỉ định — không đụng dòng KPI lịch sử. */
async function zeroEditLinesByTypes(page, types, reason) {
  const edit = await openEditBoard(page)
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
    await page.waitForTimeout(400)
    return { count, changed: 0, preview: '' }
  }
  await edit.locator('textarea').fill(reason)
  const preview = await edit.locator('.salary-modal__preview').innerText().catch(() => '')
  await edit.getByRole('button', { name: 'Lưu chỉnh sửa' }).click()
  await waitEditBoardClosed(page, edit)
  return { count, changed, preview }
}

async function reloadLyLy(page) {
  await page.reload()
  await page.waitForTimeout(2500)
  await openLyLyAug(page)
}

async function expectNet(page, expected, tag) {
  const stats = await readWalletStats(page)
  const net = stats['Lương thực nhận__num']
  if (net !== expected) {
    fail('net_mismatch', { tag, expected, actual: net, text: stats['Lương thực nhận'] })
  } else {
    step('net_ok', { tag, net })
  }
  return stats
}

async function countActiveEditLines(page) {
  const edit = await openEditBoard(page)
  const rows = edit.locator('.salary-edit-lines__row')
  const count = await rows.count()
  let active = 0
  const byType = {}
  for (let i = 0; i < count; i += 1) {
    const type = await rows.nth(i).locator('select').inputValue()
    const amount = parseVnd(await rows.nth(i).locator('input').first().inputValue())
    if (amount !== 0) {
      active += 1
      byType[type] = (byType[type] || 0) + 1
    }
  }
  await edit.getByRole('button', { name: 'Huỷ' }).click()
  await page.waitForTimeout(400)
  return { total: count, active, byType }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  })
  const page = await context.newPage()

  try {
    await loginAdmin(page)
    await openLyLyAug(page)

    const hasKpi = await page.locator('button.salary-page__btn--admin', { hasText: 'KPI' }).isVisible()
    const hasEdit = await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).isVisible()
    step('admin_toolbar', { hasKpi, hasEdit })
    if (!hasKpi || !hasEdit) fail('admin_toolbar_missing')

    const baseline = await readWalletStats(page)
    step('baseline', {
      net: baseline['Lương thực nhận'],
      kpi: baseline.KPI,
      revenue: baseline['Doanh thu tiền vé'],
      tips: baseline.Tips,
      commission: baseline['Hoa hồng'],
    })
    if (baseline['Lương thực nhận__num'] !== BASELINE_NET) {
      fail('baseline_net', {
        expected: BASELINE_NET,
        actual: baseline['Lương thực nhận__num'],
      })
    }

    // --- KPI cycle: +100k → -100k → 0 ---
    await setKpi(page, 100000, 'UAT video KPI +100000')
    await reloadLyLy(page)
    await expectNet(page, BASELINE_NET + 100000, 'kpi_plus')
    await assertCoreUnchanged(page, baseline, 'after_kpi_plus')

    await setKpi(page, -100000, 'UAT video KPI -100000')
    await reloadLyLy(page)
    await expectNet(page, BASELINE_NET - 100000, 'kpi_minus')
    await assertCoreUnchanged(page, baseline, 'after_kpi_minus')

    await setKpi(page, 0, 'UAT video KPI = 0')
    await reloadLyLy(page)
    await expectNet(page, BASELINE_NET, 'kpi_zero')
    await assertCoreUnchanged(page, baseline, 'after_kpi_zero')

    // Dọn dòng thưởng/phạt/ứng/ĐC còn sót từ lần UAT trước (không đụng KPI).
    await zeroEditLinesByTypes(
      page,
      ['bonus', 'penalty', 'advance', 'adjustment'],
      'UAT cleanup trước test sửa bảng lương',
    )
    await reloadLyLy(page)
    await setKpi(page, 0, 'UAT đảm bảo KPI = 0 trước sửa bảng')
    await reloadLyLy(page)
    await expectNet(page, BASELINE_NET, 'pre_edit_board')

    // --- Edit board: từng trường ---
    const fieldCases = [
      { type: 'bonus', amount: 50000, note: 'UAT thưởng', delta: 50000, tag: 'bonus' },
      { type: 'penalty', amount: 30000, note: 'UAT phạt', delta: -30000, tag: 'penalty' },
      { type: 'advance', amount: 20000, note: 'UAT ứng', delta: -20000, tag: 'advance' },
      { type: 'adjustment', amount: 10000, note: 'UAT ĐC +', delta: 10000, tag: 'adj_plus' },
      { type: 'adjustment', amount: -10000, note: 'UAT ĐC -', delta: -10000, tag: 'adj_minus' },
    ]

    for (const fc of fieldCases) {
      const preview = await addEditLines(
        page,
        [{ type: fc.type, amount: fc.amount, note: fc.note }],
        `UAT sửa bảng lương — ${fc.tag}`,
      )
      step('edit_board_field', { tag: fc.tag, amount: fc.amount, preview: preview.slice(0, 200) })
      await reloadLyLy(page)
      await expectNet(page, BASELINE_NET + fc.delta, fc.tag)
      await assertCoreUnchanged(page, baseline, fc.tag)

      const active = await countActiveEditLines(page)
      step('active_lines_after_field', { tag: fc.tag, ...active })
      if (active.byType[fc.type] !== 1) {
        fail('duplicate_active_line', { tag: fc.tag, byType: active.byType })
      }

      await zeroEditLinesByTypes(page, [fc.type], `UAT hoàn tác ${fc.tag} về 0`)
      await reloadLyLy(page)
      await expectNet(page, BASELINE_NET, `${fc.tag}_zeroed`)
      await assertCoreUnchanged(page, baseline, `${fc.tag}_zeroed`)
    }

    // --- Multi-field cùng lúc ---
    const multiPreview = await addEditLines(
      page,
      [
        { type: 'bonus', amount: 40000, note: 'multi thưởng' },
        { type: 'penalty', amount: 10000, note: 'multi phạt' },
        { type: 'advance', amount: 5000, note: 'multi ứng' },
        { type: 'adjustment', amount: 15000, note: 'multi ĐC+' },
      ],
      'UAT multi-field thưởng/phạt/ứng/điều chỉnh',
    )
    // +40k -10k -5k +15k = +40k
    const multiDelta = 40000
    step('edit_board_multi', { preview: multiPreview.slice(0, 240), expectedDelta: multiDelta })
    await reloadLyLy(page)
    await expectNet(page, BASELINE_NET + multiDelta, 'multi')
    await assertCoreUnchanged(page, baseline, 'multi')

    const multiActive = await countActiveEditLines(page)
    step('active_lines_after_multi', multiActive)
    if (multiActive.active < 4) {
      fail('multi_active_too_few', multiActive)
    }

    await zeroEditLinesByTypes(
      page,
      ['bonus', 'penalty', 'advance', 'adjustment'],
      'UAT hoàn tác multi-field về 0',
    )
    await reloadLyLy(page)
    await expectNet(page, BASELINE_NET, 'multi_zeroed')
    await assertCoreUnchanged(page, baseline, 'multi_zeroed')

    // Audit tab — no delete
    await page.getByRole('button', { name: 'Nhật ký' }).click()
    await page.waitForTimeout(1000)
    const hasDelete = await page.locator('.salary-audit button', { hasText: /^Xóa$/ }).count()
    step('audit_no_delete', { deleteButtons: hasDelete })
    if (hasDelete > 0) fail('audit_has_delete')
    await page.screenshot({ path: path.join(OUT, 'uat-playwright-audit.png'), fullPage: true })

    // Lock E2E on Aug (UAT) — không đụng July
    page.once('dialog', async (d) => { await d.accept() })
    await page.getByRole('button', { name: /Chốt lương/ }).click()
    await page.waitForTimeout(2000)
    const kpiDisabled = await page.locator('button.salary-page__btn--admin', { hasText: 'KPI' }).isDisabled()
    const editDisabled = await page.locator('button.salary-page__btn--admin', { hasText: 'Sửa bảng lương' }).isDisabled()
    step('locked_disables_admin', { kpiDisabled, editDisabled })
    if (!kpiDisabled || !editDisabled) fail('locked_not_disabled')

    page.once('dialog', async (d) => { await d.accept('UAT mở khóa test kỳ') })
    await page.getByRole('button', { name: 'Mở khóa' }).click()
    await page.waitForTimeout(2000)
    step('unlock')

    await setKpi(page, 0, 'UAT sau mở khóa — giữ KPI 0')

    page.once('dialog', async (d) => { await d.accept() })
    await page.getByRole('button', { name: /Chốt lương/ }).click()
    await page.waitForTimeout(1500)
    page.once('dialog', async (d) => { await d.accept('UAT kết thúc — mở lại kỳ Aug') })
    await page.getByRole('button', { name: 'Mở khóa' }).click()
    await page.waitForTimeout(1500)
    step('relock_then_unlock_restore')

    // Logout → manager Gia Lai 2
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
    step('manager_no_admin_buttons', { mgrKpi, mgrEdit })
    if (mgrKpi || mgrEdit) fail('manager_sees_admin')
    await page.screenshot({ path: path.join(OUT, 'uat-playwright-manager.png'), fullPage: true })

    // Logout → employee UAT
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
    step('employee_no_admin_buttons', { empKpi, empEdit })
    if (empKpi || empEdit) fail('employee_sees_admin')
    await page.screenshot({ path: path.join(OUT, 'uat-playwright-employee.png'), fullPage: true })
  } catch (err) {
    report.ok = false
    report.error = err?.message || String(err)
    console.error(err)
    await page.screenshot({ path: path.join(OUT, 'uat-playwright-error.png'), fullPage: true }).catch(() => {})
  } finally {
    await context.close()
    await browser.close()
    report.finishedAt = new Date().toISOString()
    writeFileSync(path.join(OUT, 'PLAYWRIGHT_UAT_REPORT.json'), JSON.stringify(report, null, 2))
    console.log(report.ok ? 'PLAYWRIGHT UAT OK' : 'PLAYWRIGHT UAT FAIL')
    console.log('Video dir:', VIDEO_DIR)
  }
}

main()
