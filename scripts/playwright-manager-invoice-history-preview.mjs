/**
 * Preview + UAT — QL Sóc Trăng xem hóa đơn lịch sử tháng 8 (local Vite).
 *
 *   PREVIEW_URL=http://127.0.0.1:5173 node --env-file=.env.development.local \
 *     scripts/playwright-manager-invoice-history-preview.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/manager-invoice-history-preview')
const SHOT = path.join(OUT, 'shots')
mkdirSync(SHOT, { recursive: true })

const BASE = process.env.PREVIEW_URL || process.env.UAT_BASE_URL || 'http://127.0.0.1:5173'
const BRANCH_ID = 'soc-trang'

const report = {
  at: new Date().toISOString(),
  base: BASE,
  steps: [],
  ok: true,
}

function step(name, detail = {}) {
  report.steps.push({ name, at: new Date().toISOString(), ...detail })
  console.log(`${detail.failed ? 'FAIL' : 'PASS'} ${name}`, detail.note || detail.value || '')
  if (detail.failed) report.ok = false
}

function readStManagerPassword() {
  if (process.env.UAT_ST_MANAGER_PASSWORD) return process.env.UAT_ST_MANAGER_PASSWORD
  const csvPath = path.join(ROOT, 'docs/uat-evidence/CREDENTIALS_FROM_PROFILES.csv')
  const csv = readFileSync(csvPath, 'utf8')
  const row = csv.split(/\r?\n/).find((line) => line.includes(',soc-trang,') && line.startsWith('Quản lý'))
  return row ? row.split(',').at(-1).trim() : ''
}

async function loginManager(page) {
  const password = readStManagerPassword()
  if (!password) throw new Error('Không đọc được mật khẩu QL Sóc Trăng')
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('form.login__form select', { timeout: 20000 })
  const selects = page.locator('form.login__form select')
  await selects.nth(0).selectOption('branch_manager')
  await selects.nth(1).selectOption(BRANCH_ID)
  await page.locator('form.login__form input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.getByRole('button', { name: /Hóa đơn/ }).first().waitFor({ timeout: 45000 })
  step('manager_login', { note: 'QL Sóc Trăng' })
}

async function openInvoices(page) {
  await page.getByRole('button', { name: /Hóa đơn/ }).first().click()
  await page.locator('h2.invoice__title').waitFor({ timeout: 20000 })
  await page.locator('.invoice-filters').waitFor({ timeout: 20000 })
}

async function waitListSettled(page) {
  await page.waitForTimeout(400)
  const loading = page.getByText('Đang tải hóa đơn từ Supabase')
  try {
    await loading.waitFor({ state: 'visible', timeout: 2500 })
    await loading.waitFor({ state: 'hidden', timeout: 45000 })
  } catch {
    /* already settled */
  }
  await page.waitForTimeout(600)
}

async function applyDateRange(page, fromDate, toDate) {
  await page.locator('[data-testid="invoice-filter-from"]').fill(fromDate)
  await page.locator('[data-testid="invoice-filter-to"]').fill(toDate)
  await waitListSettled(page)
}

async function collectRows(page) {
  const rows = page.locator('[data-testid="invoice-row"]')
  const count = await rows.count()
  const items = []
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i)
    items.push({
      id: await row.getAttribute('data-invoice-id'),
      employeeId: await row.getAttribute('data-employee-id'),
      date: await row.getAttribute('data-date'),
      servingBranch: await row.getAttribute('data-serving-branch'),
      homeBranch: await row.getAttribute('data-home-branch'),
      text: (await row.innerText()).replace(/\s+/g, ' ').trim(),
    })
  }
  return items
}

function assertNoOtherBranchEmployees(rows) {
  return rows.filter((row) => row.homeBranch && row.homeBranch !== BRANCH_ID)
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(20000)

try {
  await loginManager(page)
  await openInvoices(page)
  await waitListSettled(page)
  await page.screenshot({ path: path.join(SHOT, '00-invoices-default.png'), fullPage: true })

  await applyDateRange(page, '2026-08-01', '2026-08-15')
  const p1 = await collectRows(page)
  await page.screenshot({ path: path.join(SHOT, '01-aug-p1.png'), fullPage: true })
  const p1Leak = assertNoOtherBranchEmployees(p1)
  step('aug_p1_01_15', {
    value: p1.length,
    failed: p1.length === 0 || p1Leak.length > 0,
    note: p1.length === 0 ? 'không có HĐ' : (p1Leak.length ? `lọt NV CN khác: ${p1Leak.length}` : 'có HĐ kỳ 1/8'),
  })

  if (p1.length) {
    await page.locator('[data-testid="invoice-row"]').first().locator('button.invoice-list__btn--detail').click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ timeout: 10000 })
    const detailText = await dialog.innerText()
    const hasCode = /Mã HĐ/i.test(detailText)
    const hasService = /Dịch vụ/i.test(detailText)
    const hasTips = /Tips/i.test(detailText)
    const hasPercent = /HH\s+\d+%/i.test(detailText)
    const hasServing = /Chi nhánh phục vụ/i.test(detailText)
    const hasEdit = await dialog.getByRole('button', { name: 'Sửa hóa đơn' }).count()
    await page.screenshot({ path: path.join(SHOT, '02-aug-p1-detail.png') })
    step('aug_p1_detail_fields', {
      failed: !hasCode || !hasService || !hasTips || !hasServing,
      note: `mã=${hasCode} dv=${hasService} tips=${hasTips} hh=${hasPercent} cn=${hasServing} sua=${hasEdit}`,
    })
    await dialog.locator('.invoice-detail-modal__close-btn').click()
  }

  await applyDateRange(page, '2026-08-16', '2026-08-31')
  const p2 = await collectRows(page)
  await page.screenshot({ path: path.join(SHOT, '03-aug-p2.png'), fullPage: true })
  const p2Leak = assertNoOtherBranchEmployees(p2)
  step('aug_p2_16_31', {
    value: p2.length,
    failed: p2.length === 0 || p2Leak.length > 0,
    note: p2.length === 0 ? 'không có HĐ' : (p2Leak.length ? `lọt NV CN khác: ${p2Leak.length}` : 'có HĐ kỳ 2/8'),
  })

  await page.locator('[data-testid="invoice-filter-month"]').fill('2026-08')
  await page.locator('[data-testid="invoice-filter-cycle"]').selectOption('full')
  await waitListSettled(page)
  const empSelect = page.locator('[data-testid="invoice-filter-employee"]')
  const empOptions = await empSelect.locator('option').allTextContents()
  const hasLyLy = empOptions.some((label) => /ly ly/i.test(label))
  const hasOtherBranchName = empOptions.some((label) => /thanh thư|thanh thu/i.test(label))
  const lyValue = await empSelect.locator('option').evaluateAll((opts) => {
    const hit = opts.find((opt) => /ly ly/i.test(opt.textContent || ''))
    return hit?.value || ''
  })
  if (lyValue) {
    await empSelect.selectOption(lyValue)
    await waitListSettled(page)
  }
  const lyRows = await collectRows(page)
  await page.screenshot({ path: path.join(SHOT, '04-ly-ly-aug.png'), fullPage: true })
  const lyOk = hasLyLy && !hasOtherBranchName && lyRows.length > 0 && lyRows.every((row) => (
    row.employeeId === lyValue || /ly ly/i.test(row.text)
  ))
  step('filter_ly_ly_august', {
    value: lyRows.length,
    failed: !lyOk,
    note: `dropdown Ly Ly=${hasLyLy} ẩn NV CN khác=${!hasOtherBranchName}`,
  })

  const foreign = [...p1, ...p2, ...lyRows].filter((row) => row.servingBranch && ![
    'soc-trang',
    'tram-spa',
    'song-khoe-spa',
  ].includes(row.servingBranch) && !String(row.employeeId || '').startsWith('soc-trang'))
  step('no_other_branch_employees', {
    failed: foreign.length > 0,
    value: foreign.length,
  })
} catch (error) {
  report.ok = false
  report.error = error?.message || String(error)
  await page.screenshot({ path: path.join(SHOT, '99-error.png'), fullPage: true }).catch(() => {})
  console.error('FAIL', error)
} finally {
  writeFileSync(path.join(OUT, 'REPORT.json'), JSON.stringify(report, null, 2))
  await browser.close()
}

if (!report.ok) process.exit(1)
console.log('\nPASS — manager invoice history preview')
console.log(OUT)
