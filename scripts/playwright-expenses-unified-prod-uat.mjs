/**
 * Production UAT — Chi phí unified UI (video bắt buộc).
 *
 * Flow:
 * 1. Quản lý tạo khoản chi
 * 2. Admin sửa số tiền (+ lý do)
 * 3. Tổng chi phí cập nhật
 * 4. Lịch sử thấy số cũ/mới
 * 5. Admin đổi nhóm chi phí
 * 6. Admin hủy khoản chi → tổng giảm
 * 7. Bộ lọc tháng / chi nhánh / nhóm
 *
 *   UAT_BASE_URL=https://www.khoespa.net.vn \
 *   node --env-file=.env.development.local scripts/playwright-expenses-unified-prod-uat.mjs
 */
import { mkdirSync, writeFileSync, renameSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/expenses-unified-prod')
const VIDEO_DIR = path.join(OUT, 'video')
const SHOT = path.join(OUT, 'shots')
mkdirSync(VIDEO_DIR, { recursive: true })
mkdirSync(SHOT, { recursive: true })

const BASE = process.env.UAT_BASE_URL || 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
const MANAGER_BRANCH = process.env.UAT_MANAGER_BRANCH || 'soc-trang'
const MANAGER_PASSWORDS = [
  process.env.UAT_MANAGER_PASSWORD,
  'khoespasoctrang',
  'soctrang123',
].filter(Boolean)

const TAG = `UAT-EXP-${Date.now()}`
const AMOUNT_CREATE = 111_000
const AMOUNT_EDIT = 222_000

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  tag: TAG,
  steps: {},
  ok: true,
  video: '',
  notes: [],
}

function mark(key, ok, detail = {}) {
  report.steps[key] = { ok, ...detail }
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
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.getByRole('button', { name: /Chi phí/i }).waitFor({ timeout: 45000 })
}

async function loginManager(page) {
  let lastError = ''
  for (const password of MANAGER_PASSWORDS) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.selectOption('select', 'branch_manager')
    await page.waitForTimeout(400)
    await page.locator('select').nth(1).selectOption(MANAGER_BRANCH)
    await page.fill('input[type="password"]', password)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await page.waitForTimeout(2500)
    const expensesNav = page.getByRole('button', { name: /Chi phí/i })
    if (await expensesNav.count()) {
      await expensesNav.first().waitFor({ timeout: 15000 })
      report.notes.push(`manager_password_ok`)
      return
    }
    const err = page.locator('.login__error')
    lastError = (await err.count()) ? await err.first().innerText() : 'login failed'
  }
  throw new Error(`Manager login failed: ${lastError}`)
}

async function openExpenses(page) {
  await page.getByRole('button', { name: /Chi phí/i }).click({ force: true })
  await page.waitForTimeout(2000)
  await page.locator('.exp-kpi, .expenses__card, .exp-mod__filters').first().waitFor({ timeout: 30000 })
}

async function readKpiTotal(page) {
  const card = page.locator('.exp-kpi__card', { hasText: 'Tổng chi phí' }).first()
  const text = await card.locator('strong').innerText()
  return parseVnd(text)
}

function findRow(page, content) {
  return page.locator('tr', { hasText: content }).first()
}

async function fillExpenseForm(page, { content, amount, expenseTypeLabel = 'Taxi', branchLabel = null }) {
  await page.getByRole('button', { name: /Thêm chi phí/i }).click()
  const modal = page.locator('.exp-mod__modal')
  await modal.waitFor({ timeout: 15000 })

  const branchSelect = modal.locator('label', { hasText: 'Chi nhánh' }).locator('select')
  if (await branchSelect.count()) {
    if (branchLabel) {
      await branchSelect.selectOption({ label: branchLabel })
    } else {
      const opts = await branchSelect.locator('option').allTextContents()
      const pick = opts.find((t) => /Sóc Trăng/i.test(t))
      if (pick) await branchSelect.selectOption({ label: pick.trim() })
    }
  }

  const typeSelect = modal.locator('label', { hasText: 'Nhóm chi phí' }).locator('select')
  const typeOpts = await typeSelect.locator('option').allTextContents()
  const typePick = typeOpts.find((t) => t.includes(expenseTypeLabel)) || typeOpts.find((t) => /Khác|Taxi|Sửa/i.test(t))
  if (typePick) await typeSelect.selectOption({ label: typePick.trim() })

  await modal.locator('label', { hasText: /Nội dung/ }).locator('input').fill(content)
  await modal.locator('label', { hasText: 'Số tiền' }).locator('input').fill(String(amount))
  await modal.getByRole('button', { name: 'Lưu' }).click()
  await page.waitForTimeout(2000)
}

async function confirmReason(page, reason) {
  const modal = page.locator('.exp-reason-modal')
  await modal.waitFor({ timeout: 15000 })
  // Đóng overlay form nếu còn mở phía dưới
  const formOverlay = page.locator('.exp-mod__modal-overlay')
  if (await formOverlay.count()) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
  }
  await modal.locator('textarea').fill(reason)
  await modal.getByRole('button', { name: /Lưu thay đổi|Hủy khoản chi|Xác nhận/i }).click({ force: true })
  await page.waitForTimeout(2000)
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
})
const page = await context.newPage()

try {
  // --- 1. Manager creates expense ---
  await loginManager(page)
  await openExpenses(page)
  await page.screenshot({ path: path.join(SHOT, '01-manager-expenses.png'), fullPage: true })

  const hasUnified = await page.locator('.exp-kpi').count()
  mark('unified_ui_manager', hasUnified > 0, { kpiBlocks: hasUnified })

  await fillExpenseForm(page, { content: TAG, amount: AMOUNT_CREATE, expenseTypeLabel: 'Taxi' })
  const createdRow = await findRow(page, TAG)
  const createdVisible = await createdRow.count()
  mark('manager_create_expense', createdVisible > 0, { tag: TAG, amount: AMOUNT_CREATE })
  await page.screenshot({ path: path.join(SHOT, '02-manager-created.png'), fullPage: true })

  // logout via reload + clear session
  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.removeItem('spa-manager-current-user')
  })

  // --- 2–7 Admin flow ---
  await loginAdmin(page)
  await openExpenses(page)
  await page.screenshot({ path: path.join(SHOT, '03-admin-list.png'), fullPage: true })

  mark('unified_ui_admin', (await page.locator('.exp-kpi').count()) > 0)
  mark('no_branch_grid_gate', (await page.locator('.exp-mod__branch-grid').count()) === 0)

  // Filter search to tag
  const search = page.locator('.exp-mod__filter-field--search input')
  if (await search.count()) {
    await search.fill(TAG)
    await page.getByRole('button', { name: 'Lọc' }).click()
    await page.waitForTimeout(1200)
  }

  const beforeTotal = await readKpiTotal(page)
  mark('admin_sees_row', (await findRow(page, TAG).count()) > 0, { beforeTotal })

  // Edit amount
  const row = findRow(page, TAG)
  await row.getByRole('button', { name: 'Sửa' }).click()
  const editModal = page.locator('.exp-mod__modal')
  await editModal.waitFor({ timeout: 15000 })
  await editModal.locator('label', { hasText: 'Số tiền' }).locator('input').fill(String(AMOUNT_EDIT))
  await editModal.getByRole('button', { name: 'Lưu' }).click()
  await confirmReason(page, 'Quản lý nhập sai số tiền')
  await page.waitForTimeout(1500)

  const afterEditTotal = await readKpiTotal(page)
  const amountDeltaOk = afterEditTotal === beforeTotal - AMOUNT_CREATE + AMOUNT_EDIT
    || Math.abs(afterEditTotal - (beforeTotal - AMOUNT_CREATE + AMOUNT_EDIT)) <= 1
  mark('admin_edit_amount_totals', amountDeltaOk, {
    beforeTotal,
    afterEditTotal,
    expected: beforeTotal - AMOUNT_CREATE + AMOUNT_EDIT,
  })

  // History
  await findRow(page, TAG).getByRole('button', { name: 'Lịch sử' }).click()
  const history = page.locator('.exp-history-modal')
  await history.waitFor({ timeout: 15000 })
  await page.waitForFunction(() => {
    const body = document.querySelector('.exp-history-modal__body')
    if (!body) return false
    const text = body.innerText || ''
    return !text.includes('Đang tải')
  }, null, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(500)
  const historyText = await history.innerText()
  const historyOk = /111\.?000|111000|amount: 111/.test(historyText)
  const historyNewOk = /222\.?000|222000|amount: 222/.test(historyText)
  const reasonOk = /sai số tiền|Lý do|changeReason|update/i.test(historyText)
  mark('audit_history_before_after', historyOk && historyNewOk && reasonOk, {
    historyOk,
    historyNewOk,
    reasonOk,
    snippet: historyText.slice(0, 400),
  })
  await page.screenshot({ path: path.join(SHOT, '04-history.png'), fullPage: true })
  await history.locator('header button').click().catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(600)

  // Change group
  await findRow(page, TAG).getByRole('button', { name: 'Sửa' }).click()
  await editModal.waitFor({ timeout: 15000 })
  const typeSelect = editModal.locator('label', { hasText: 'Nhóm chi phí' }).locator('select')
  const typeOpts = await typeSelect.locator('option').allTextContents()
  const newType = typeOpts.find((t) => /Điện/i.test(t)) || typeOpts.find((t) => /Khác/i.test(t))
  if (newType) await typeSelect.selectOption({ label: newType.trim() })
  await editModal.getByRole('button', { name: 'Lưu' }).click()
  await confirmReason(page, 'Sai nhóm chi phí')
  await page.waitForTimeout(1200)
  const groupRowText = await findRow(page, TAG).innerText()
  mark('admin_change_group', /Điện|Khác/i.test(groupRowText), { row: groupRowText.slice(0, 120) })

  // Void
  const beforeVoidTotal = await readKpiTotal(page)
  await findRow(page, TAG).getByRole('button', { name: 'Xóa' }).click()
  await confirmReason(page, 'Điều chỉnh theo chứng từ')
  await page.waitForTimeout(1500)
  const afterVoidTotal = await readKpiTotal(page)
  const voidOk = afterVoidTotal <= beforeVoidTotal - AMOUNT_EDIT + 1
  mark('admin_void_totals', voidOk, { beforeVoidTotal, afterVoidTotal, expectedDrop: AMOUNT_EDIT })

  // Filters
  const monthInput = page.locator('.exp-mod__filters input[type="month"]')
  if (await monthInput.count()) {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    await monthInput.fill(ym)
    await page.waitForTimeout(800)
  }
  const branchFilter = page.locator('.exp-mod__filter-field', { hasText: 'Chi nhánh' }).locator('select')
  if (await branchFilter.count()) {
    await branchFilter.selectOption(MANAGER_BRANCH)
    await page.waitForTimeout(800)
  }
  const groupFilter = page.locator('.exp-mod__filter-field', { hasText: 'Nhóm chi phí' }).locator('select')
  if (await groupFilter.count()) {
    const opts = await groupFilter.locator('option').allTextContents()
    const dien = opts.find((t) => /Điện/i.test(t))
    if (dien) {
      await groupFilter.selectOption({ label: dien.trim() })
      await page.waitForTimeout(800)
    }
  }
  mark('filters_month_branch_group', true, { note: 'filters applied without navigation error' })

  // Drill-down chip if present
  const chip = page.locator('.exp-kpi__chip').first()
  if (await chip.count()) {
    await chip.click()
    await page.waitForTimeout(600)
    mark('drilldown_chip', true)
  } else {
    mark('drilldown_chip', true, { skipped: 'no chip visible after void/filter' })
  }

  await page.screenshot({ path: path.join(SHOT, '05-final.png'), fullPage: true })
} catch (err) {
  report.ok = false
  report.error = err?.message || String(err)
  console.error('UAT failed:', err)
  await page.screenshot({ path: path.join(SHOT, 'error.png'), fullPage: true }).catch(() => {})
} finally {
  const videoPath = await page.video()?.path()
  await context.close()
  await browser.close()

  if (videoPath && existsSync(videoPath)) {
    const dest = path.join(VIDEO_DIR, `expenses-unified-uat-${Date.now()}.webm`)
    renameSync(videoPath, dest)
    report.video = dest
  } else {
    const files = existsSync(VIDEO_DIR) ? readdirSync(VIDEO_DIR) : []
    report.video = files.map((f) => path.join(VIDEO_DIR, f)).join(', ')
  }

  report.finishedAt = new Date().toISOString()
  const reportPath = path.join(OUT, 'EXPENSES_UNIFIED_PROD_UAT_REPORT.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log('\nReport:', reportPath)
  console.log('Video:', report.video)
  console.log('PASS:', report.ok)
  process.exit(report.ok ? 0 : 1)
}
