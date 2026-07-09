/**
 * Production: Admin → Chi nhánh → Chi tiết 8 chi nhánh.
 * Chạy: node scripts/verify-production-branches.mjs
 */
import puppeteer from 'puppeteer-core'

const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const BASE_URL = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'

const BRANCH_IDS = [
  'soc-trang',
  'song-khoe-spa',
  'gia-lai-1',
  'tra-vinh',
  'bac-lieu',
  'vinh-long',
  'gia-lai-2',
  'tram-spa',
]

const TABS = [
  { id: 'overview', label: 'Tổng quan', mustHave: ['branch_id', 'Doanh thu'] },
  { id: 'employees', label: 'Nhân viên', mustHave: ['branch_id'] },
  { id: 'pricing', label: 'Bảng giá', mustHave: ['branch_id'] },
  { id: 'invoices', label: 'Hóa đơn', mustHave: ['branch_id'] },
  { id: 'attendance', label: 'Chấm công', mustHave: ['branch_id'] },
  { id: 'salary', label: 'Lương', mustHave: ['branch_id'] },
]

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
  try {
    await page.waitForFunction(
      () => !document.body?.textContent?.includes('Đang tải...'),
      { timeout: 8000 },
    )
  } catch {
    /* landing/login may not show loading state */
  }
}

async function loginAdmin(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 })

  const landingBtn = await page.$('button.landing__cta')
  if (landingBtn) await landingBtn.click()

  await page.waitForSelector('.login__form', { timeout: 15000 })
  await page.select('.login__form select', 'admin')
  await page.waitForFunction(
    () => !document.querySelector('button.login__submit')?.disabled,
    { timeout: 5000 },
  )
  await page.focus('input[type="password"]')
  await page.keyboard.type(ADMIN_PASSWORD, { delay: 20 })
  await page.evaluate(() => {
    document.querySelector('.login__form')?.requestSubmit()
  })
  await page.waitForSelector('.sidebar', { timeout: 30000 })
}

async function openBranchesPage(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.sidebar__nav button')].find((el) =>
      el.textContent.includes('Chi nhánh'),
    )
    btn?.click()
  })
  await page.waitForSelector('.admin-branches', { timeout: 20000 })
  await waitForAppReady(page)
}

async function openBranchDetailFromGrid(page, branchId) {
  const opened = await page.evaluate((id) => {
    const cards = [...document.querySelectorAll('.admin-branches__card')]
    for (const card of cards) {
      const idEl = card.querySelector('.admin-branches__detail-id')
      if (!idEl?.textContent?.includes(id)) continue
      const btn = [...card.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Chi tiết') || b.textContent.includes('Xem chi tiết'),
      )
      if (!btn) return false
      btn.click()
      return true
    }
    return false
  }, branchId)

  if (!opened) return false

  await page.waitForFunction(
    (id) => document.body.textContent.includes(`branch_id: ${id}`)
      || document.querySelector('.admin-branches__detail-title'),
    { timeout: 30000 },
    branchId,
  )
  return true
}

async function switchTab(page, label) {
  await page.evaluate((tabLabel) => {
    const tab = [...document.querySelectorAll('.admin-branches__tab')].find((el) =>
      el.textContent.includes(tabLabel),
    )
    tab?.click()
  }, label)
  await new Promise((r) => setTimeout(r, 800))
}

async function tabContentOk(page, mustHave) {
  return page.evaluate((needles) => {
    const text = document.body.textContent ?? ''
    const blank = document.querySelector('.admin-branches__detail')?.children.length === 0
    if (blank) return { ok: false, reason: 'detail pane trống' }
    if (text.includes('Maximum update depth exceeded')) return { ok: false, reason: 'React crash' }
    for (const needle of needles) {
      if (!text.includes(needle)) return { ok: false, reason: `thiếu "${needle}"` }
    }
    return { ok: true }
  }, mustHave)
}

async function backToBranchList(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Danh sách chi nhánh'),
    )
    btn?.click()
  })
  await page.waitForSelector('.admin-branches__grid-cards', { timeout: 15000 })
}

console.log(`\nProduction branch verify — ${BASE_URL}\n`)

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

const page = await browser.newPage()
page.on('pageerror', (err) => {
  console.error(`  [pageerror] ${err.message}`)
  failed += 1
})

try {
  console.log('1. Đăng nhập Admin')
  await loginAdmin(page)
  logStep('Đăng nhập Admin', true)

  console.log('\n2. Mở Chi nhánh')
  await openBranchesPage(page)
  logStep('Trang Chi nhánh hiển thị', true)

  const gridCount = await page.$$eval('.admin-branches__card', (els) => els.length)
  logStep(`Grid có ${gridCount} chi nhánh`, gridCount === 8, `thấy ${gridCount}, cần 8`)

  console.log('\n3. Chi tiết từng chi nhánh + tabs')
  for (const branchId of BRANCH_IDS) {
    const opened = await openBranchDetailFromGrid(page, branchId)
    logStep(`Mở chi tiết ${branchId}`, opened, opened ? '' : 'Không tìm thấy card/nút Chi tiết')

    if (!opened) continue

    for (const tab of TABS) {
      await switchTab(page, tab.label)
      const { ok, reason } = await tabContentOk(page, tab.mustHave)
      logStep(`${branchId} → tab ${tab.label}`, ok, reason ?? '')
    }

    await backToBranchList(page)
  }
} catch (error) {
  failed += 1
  console.error(`  ✗ Lỗi: ${error.message}`)
} finally {
  await browser.close()
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
