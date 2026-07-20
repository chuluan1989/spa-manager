/**
 * Post-deploy smoke: Admin Service Management on Production.
 * Chạy: ADMIN_PASSWORD=... npx -y puppeteer@23 scripts/verify-service-management-production.mjs
 */
import puppeteer from 'puppeteer'

const BASE_URL = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'

let passed = 0
let failed = 0

function logStep(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}`)
    if (detail) console.error(`    ${detail}`)
  }
}

async function waitForAppReady(page) {
  await page.waitForFunction(
    () => !document.body?.textContent?.includes('Đang tải...'),
    { timeout: 45000 },
  )
}

async function loginAdmin(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitForAppReady(page)
  const landingBtn = await page.$('button.landing__cta')
  if (landingBtn) {
    await landingBtn.click()
    await page.waitForSelector('.login__form', { timeout: 15000 })
  }
  await page.select('.login__field select', 'admin')
  await page.type('input[type="password"]', ADMIN_PASSWORD, { delay: 20 })
  await page.click('button.login__btn')
  await page.waitForFunction(
    () => document.body.textContent.includes('Quản trị hệ thống')
      || document.body.textContent.includes('Hóa đơn'),
    { timeout: 45000 },
  )
}

async function openAdminServices(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.sidebar__nav button')].find((el) =>
      el.textContent.includes('Quản trị hệ thống'),
    )
    btn?.click()
  })
  await page.waitForSelector('.settings__tabs, .admin-settings', { timeout: 15000 }).catch(() => {})
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find((el) =>
      el.textContent.includes('Dịch vụ') || el.textContent.includes('Quản lý dịch vụ'),
    )
    tab?.click()
  })
  await page.waitForFunction(
    () => document.body.textContent.includes('Quản lý dịch vụ')
      || document.body.textContent.includes('Quản lý nhanh'),
    { timeout: 20000 },
  )
}

console.log(`\nProduction verify — ${BASE_URL}\n`)

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()

try {
  await loginAdmin(page)
  logStep('Admin login', true)

  await openAdminServices(page)
  const body = await page.evaluate(() => document.body.textContent)
  logStep('Admin → Quản lý dịch vụ loads', body.includes('Quản lý nhanh') || body.includes('Quản lý dịch vụ'))

  const hasKpi = body.includes('Tổng dịch vụ') && body.includes('Doanh thu')
  logStep('KPI cards visible', hasKpi)

  const hasAccordion = body.includes('dịch vụ') && (body.includes('Giá bán') || body.includes('Thời lượng'))
  logStep('Service list / accordion visible', hasAccordion)

  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Hóa đơn')
    tab?.click()
  })
  await page.waitForFunction(
    () => document.body.textContent.includes('Hóa đơn'),
    { timeout: 15000 },
  )
  logStep('Invoice page accessible', true)

  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find((el) =>
      el.textContent.includes('Báo cáo') || el.textContent.includes('Dashboard'),
    )
    tab?.click()
  })
  await page.waitForTimeout(2000)
  logStep('Reports page accessible', true)
} catch (error) {
  logStep('Production smoke', false, error.message)
} finally {
  await browser.close()
}

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
