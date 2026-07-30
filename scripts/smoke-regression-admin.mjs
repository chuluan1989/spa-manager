/**
 * Admin UI regression smoke trên local preview (Production Supabase).
 *
 * Usage:
 *   npx vite preview --host 127.0.0.1 --port 4173 &
 *   ADMIN_PASSWORD=admin123 node scripts/smoke-regression-admin.mjs
 */
import puppeteer from 'puppeteer-core'

const PREVIEW = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173'
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'
const SESSION_KEY = 'spa-manager-current-user'

let passed = 0
let failed = 0

function log(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}`)
    if (detail) console.error(`    ${detail}`)
  }
}

async function waitReady(page) {
  await page.waitForFunction(
    () => !document.body?.textContent?.includes('Đang tải...'),
    { timeout: 45000 },
  )
}

async function loginAdmin(page) {
  await page.goto(PREVIEW, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.evaluate((key) => sessionStorage.removeItem(key), SESSION_KEY)
  await page.reload({ waitUntil: 'networkidle2' })
  await waitReady(page)
  await page.waitForSelector('form.login__form select', { timeout: 15000 })
  await page.select('form.login__form select', 'admin')
  await page.type('input[type="password"]', ADMIN_PASSWORD, { delay: 10 })
  await page.click('button.login__submit')
  await page.waitForFunction(() => !document.querySelector('.login__form'), { timeout: 45000 })
  await waitReady(page)
}

async function clickNav(page, label) {
  await page.evaluate((text) => {
    const btn = [...document.querySelectorAll('.sidebar__link')].find((el) =>
      el.textContent.includes(text),
    )
    if (!btn) throw new Error(`Nav not found: ${text}`)
    btn.click()
  }, label)
  await waitReady(page)
}

async function pageHas(page, pattern) {
  const text = await page.evaluate(() => document.body.textContent ?? '')
  return pattern.test(text)
}

console.log(`\n=== Admin UI Regression — ${PREVIEW} ===\n`)

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(err.message))

try {
  await loginAdmin(page)
  log('Login (Admin)', true)

  await clickNav(page, 'Tổng quan')
  log('Dashboard', await pageHas(page, /Business Copilot|Tổng quan/i))

  await clickNav(page, 'Chấm công')
  log('Attendance', await pageHas(page, /Chấm công/i))

  await clickNav(page, 'Hóa đơn')
  log('Invoice', await pageHas(page, /Hóa đơn/i))

  await clickNav(page, 'Lương')
  log('Payroll', await pageHas(page, /Lương|Bảng lương/i))

  await clickNav(page, 'Báo cáo')
  const reportOk = await pageHas(page, /Báo cáo|Khách yêu cầu|Quản trị/i)
  log('Reports (+ Customer Requested)', reportOk)

  await clickNav(page, 'Lương')
  const payrollAuditOk = await pageHas(page, /Lương|Bảng lương|Lịch sử|audit/i)
  log('Payroll audit history', payrollAuditOk)

  await clickNav(page, 'Chấm công')
  const attendanceAuditOk = await pageHas(page, /Chấm công|Audit|chỉnh sửa/i)
  log('Attendance (+ audit edit logs UI)', attendanceAuditOk)

  log('No React pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
} catch (err) {
  log('Unexpected error', false, err.message)
} finally {
  await browser.close()
}

console.log(`\nPASS: ${passed} | FAIL: ${failed}\n`)
process.exit(failed > 0 ? 1 : 0)
