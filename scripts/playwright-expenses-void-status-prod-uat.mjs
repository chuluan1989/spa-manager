/**
 * Production UAT — sau migration 0045 (status void, không [[VOID]]).
 *
 *   UAT_BASE_URL=https://www.khoespa.net.vn \
 *   node --env-file=.env.development.local scripts/playwright-expenses-void-status-prod-uat.mjs
 */
import { mkdirSync, writeFileSync, renameSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/expenses-void-migration-prod/uat-video')
const VIDEO_DIR = path.join(OUT, 'video')
const SHOT = path.join(OUT, 'shots')
mkdirSync(VIDEO_DIR, { recursive: true })
mkdirSync(SHOT, { recursive: true })

const BASE = process.env.UAT_BASE_URL || 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
const TAG = `UAT-VOID-${Date.now()}`
const AMOUNT = 55_000
const AMOUNT_EDIT = 66_000

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  tag: TAG,
  steps: {},
  ok: true,
  video: '',
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

async function openExpenses(page) {
  await page.getByRole('button', { name: /Chi phí/i }).click({ force: true })
  await page.waitForTimeout(2000)
  await page.locator('.exp-kpi').first().waitFor({ timeout: 30000 })
}

async function readKpiTotal(page) {
  const card = page.locator('.exp-kpi__card', { hasText: 'Tổng chi phí' }).first()
  return parseVnd(await card.locator('strong').innerText())
}

async function readVariableTotal(page) {
  const card = page.locator('.exp-kpi__card', { hasText: 'Chi phí phát sinh' }).first()
  return parseVnd(await card.locator('strong').innerText())
}

function findRow(page, content) {
  return page.locator('tr', { hasText: content }).first()
}

async function clearSearch(page) {
  const search = page.locator('.exp-mod__filter-field--search input')
  if (await search.count()) {
    await search.fill('')
    await page.getByRole('button', { name: 'Lọc' }).click()
    await page.waitForTimeout(1200)
  }
}

async function searchTag(page) {
  const search = page.locator('.exp-mod__filter-field--search input')
  if (await search.count()) {
    await search.fill(TAG)
    await page.getByRole('button', { name: 'Lọc' }).click()
    await page.waitForTimeout(1200)
  }
}

async function confirmReason(page, reason, confirmName) {
  const modal = page.locator('.exp-reason-modal')
  await modal.waitFor({ timeout: 15000 })
  await modal.locator('textarea').fill(reason)
  await modal.getByRole('button', { name: confirmName }).click({ force: true })
  await page.waitForTimeout(2500)
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
})
const page = await context.newPage()

try {
  await loginAdmin(page)
  await openExpenses(page)
  await clearSearch(page)

  const beforeTotal = await readKpiTotal(page)
  const beforeVariable = await readVariableTotal(page)
  mark('baseline_total', true, { beforeTotal, beforeVariable })

  // Create
  await page.getByRole('button', { name: /Thêm chi phí/i }).click()
  const modal = page.locator('.exp-mod__modal')
  await modal.waitFor({ timeout: 15000 })
  const branchSelect = modal.locator('label', { hasText: 'Chi nhánh' }).locator('select')
  if (await branchSelect.count()) {
    const opts = await branchSelect.locator('option').allTextContents()
    const pick = opts.find((t) => /Sóc Trăng/i.test(t))
    if (pick) await branchSelect.selectOption({ label: pick.trim() })
  }
  const typeSelect = modal.locator('label', { hasText: 'Nhóm chi phí' }).locator('select')
  const typeOpts = await typeSelect.locator('option').allTextContents()
  const typePick = typeOpts.find((t) => /Taxi/i.test(t)) || typeOpts.find((t) => /Khác/i.test(t))
  if (typePick) await typeSelect.selectOption({ label: typePick.trim() })
  await modal.locator('label', { hasText: /Nội dung/ }).locator('input').fill(TAG)
  await modal.locator('label', { hasText: 'Số tiền' }).locator('input').fill(String(AMOUNT))
  await modal.getByRole('button', { name: 'Lưu' }).click()
  await page.waitForTimeout(2500)
  await clearSearch(page)

  const afterCreate = await readKpiTotal(page)
  mark('total_includes_new', afterCreate === beforeTotal + AMOUNT, {
    beforeTotal,
    afterCreate,
    expected: beforeTotal + AMOUNT,
  })
  await page.screenshot({ path: path.join(SHOT, '01-created.png'), fullPage: true })

  // Edit + audit
  await searchTag(page)
  await findRow(page, TAG).getByRole('button', { name: 'Sửa' }).click()
  await modal.waitFor({ timeout: 15000 })
  await modal.locator('label', { hasText: 'Số tiền' }).locator('input').fill(String(AMOUNT_EDIT))
  await modal.getByRole('button', { name: 'Lưu' }).click()
  await confirmReason(page, 'Điều chỉnh theo chứng từ', 'Lưu thay đổi')
  await clearSearch(page)

  const afterEdit = await readKpiTotal(page)
  mark('edit_totals', afterEdit === beforeTotal + AMOUNT_EDIT, {
    afterEdit,
    expected: beforeTotal + AMOUNT_EDIT,
  })

  await searchTag(page)
  await findRow(page, TAG).getByRole('button', { name: 'Lịch sử' }).click()
  const history = page.locator('.exp-history-modal')
  await history.waitFor({ timeout: 15000 })
  await page.waitForFunction(() => {
    const body = document.querySelector('.exp-history-modal__body')
    if (!body) return false
    const text = body.innerText || ''
    if (text.includes('Đang tải')) return false
    return text.includes('Trước') || text.includes('Lý do') || text.includes('update') || text.includes('Chưa có') || text.includes('Hết thời gian')
  }, null, { timeout: 45000 }).catch(() => {})
  let historyText = await history.innerText()
  if (/Chưa có nhật ký|Hết thời gian|Đang tải/i.test(historyText)) {
    await history.locator('header button').click().catch(() => page.keyboard.press('Escape'))
    await page.waitForTimeout(800)
    await findRow(page, TAG).getByRole('button', { name: 'Lịch sử' }).click()
    await history.waitFor({ timeout: 15000 })
    await page.waitForTimeout(3000)
    historyText = await history.innerText()
  }
  mark('audit_history', /55\.?000|55000/.test(historyText) && /66\.?000|66000/.test(historyText) && /Lý do|Điều chỉnh|update/i.test(historyText), {
    snippet: historyText.slice(0, 350),
  })
  await page.screenshot({ path: path.join(SHOT, '02-history.png'), fullPage: true })
  await history.locator('header button').click().catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(500)

  // Void — excluded from total
  await findRow(page, TAG).getByRole('button', { name: 'Xóa' }).click()
  await confirmReason(page, 'Điều chỉnh theo chứng từ', 'Hủy khoản chi')
  await clearSearch(page)

  const afterVoid = await readKpiTotal(page)
  mark('void_excluded_from_total', afterVoid === beforeTotal, {
    afterVoid,
    expected: beforeTotal,
  })

  // Show voided still visible
  await searchTag(page)
  const toggle = page.locator('.expenses__void-toggle input')
  await toggle.check()
  await page.waitForTimeout(1000)
  const voidRow = findRow(page, TAG)
  const voidVisible = (await voidRow.count()) > 0
  const voidBadge = voidVisible ? await voidRow.innerText() : ''
  mark('show_voided_visible', voidVisible && voidBadge.includes('Đã hủy'), {
    voidBadge: voidBadge.slice(0, 200),
  })
  mark('no_void_marker_in_ui', !voidBadge.includes('[[VOID]]'), {
    voidBadge: voidBadge.slice(0, 200),
  })

  await page.screenshot({ path: path.join(SHOT, '03-voided.png'), fullPage: true })
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
    const dest = path.join(VIDEO_DIR, `expenses-void-status-uat-${Date.now()}.webm`)
    renameSync(videoPath, dest)
    report.video = dest
  } else {
    const files = existsSync(VIDEO_DIR) ? readdirSync(VIDEO_DIR) : []
    report.video = files.map((f) => path.join(VIDEO_DIR, f)).join(', ')
  }
  report.finishedAt = new Date().toISOString()
  writeFileSync(path.join(OUT, 'EXPENSES_VOID_STATUS_UAT_REPORT.json'), JSON.stringify(report, null, 2))
  console.log('\nPASS:', report.ok)
  console.log('Video:', report.video)
  process.exit(report.ok ? 0 : 1)
}
