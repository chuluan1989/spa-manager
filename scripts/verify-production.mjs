/**
 * Kiểm tra Production (https://www.khoespa.net.vn): Supabase sync giữa 2 trình duyệt.
 * Chạy: npx -y puppeteer@23 scripts/verify-production.mjs
 */
import puppeteer from 'puppeteer'

const BASE_URL = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'
const TEST_TAG = `__PROD_VERIFY_${Date.now()}__`
const SYNC_WAIT_MS = 35000

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
    () =>
      document.body.textContent.includes('Quản trị hệ thống')
      || document.body.textContent.includes('Hóa đơn')
      || document.body.textContent.includes('Dashboard'),
    { timeout: 45000 },
  )
}

async function openSettingsEmployees(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.sidebar__nav button')].find((el) =>
      el.textContent.includes('Quản trị hệ thống'),
    )
    btn?.click()
  })
  await page.waitForSelector('.settings__tabs', { timeout: 20000 })
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.settings__tab')].find((el) =>
      el.textContent.includes('Nhân viên'),
    )
    tab?.click()
  })
  await page.waitForSelector('.settings__filters, .settings__grouped', { timeout: 20000 })
}

async function addTestEmployee(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((el) =>
      el.textContent.includes('Thêm nhân viên'),
    )
    btn?.click()
  })
  await page.waitForSelector('.employee-profile', { timeout: 15000 })

  const branchId = await page.$eval('.employee-profile select', (el) => el.value || el.options[1]?.value)
  await page.evaluate(
    (tag, branch) => {
      const set = (label, value) => {
        const field = [...document.querySelectorAll('.employee-profile label')].find((l) =>
          l.textContent.includes(label),
        )
        const input = field?.querySelector('input, select, textarea')
        if (!input) return
        input.value = value
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
      set('Họ tên', tag)
      set('Số điện thoại', '0900111222')
      set('CCCD', '001122334455')
      set('Chức vụ', 'Verify Test')
      const branchSelect = [...document.querySelectorAll('.employee-profile select')].find((s) =>
        [...s.options].some((o) => o.value === branch),
      )
      if (branchSelect) {
        branchSelect.value = branch
        branchSelect.dispatchEvent(new Event('change', { bubbles: true }))
      }
    },
    TEST_TAG,
    branchId,
  )

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.modal button, .settings__modal button, button')].find(
      (el) => el.textContent.trim() === 'Lưu' || el.textContent.includes('Lưu hồ sơ'),
    )
    btn?.click()
  })
  await page.waitForFunction(
    (tag) => document.body.textContent.includes(tag),
    { timeout: 20000 },
    TEST_TAG,
  )
}

async function pageHasEmployee(page, tag) {
  return page.evaluate((t) => document.body.textContent.includes(t), tag)
}

async function deleteTestEmployee(page, tag) {
  const deleted = await page.evaluate((t) => {
    const row = [...document.querySelectorAll('tr')].find((tr) => tr.textContent.includes(t))
    if (!row) return false
    const delBtn = [...row.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Xóa') || b.textContent.includes('Xoá'),
    )
    delBtn?.click()
    return true
  }, tag)
  if (deleted) {
    await new Promise((r) => setTimeout(r, 500))
    await page.evaluate(() => {
      const confirmBtn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Xóa') || b.textContent.includes('Xác nhận'),
      )
      confirmBtn?.click()
    })
  }
}

console.log(`\nProduction verify — ${BASE_URL}\n`)

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

let supabaseRequests = 0
const browserB = await browser.createBrowserContext()
const pageA = await browser.newPage()
const pageB = await browserB.newPage()

pageA.on('request', (req) => {
  if (req.url().includes('supabase.co')) supabaseRequests += 1
})
pageB.on('request', (req) => {
  if (req.url().includes('supabase.co')) supabaseRequests += 1
})

try {
  console.log('1. Đăng nhập Admin trên trình duyệt A')
  await loginAdmin(pageA)
  logStep('Trình duyệt A đăng nhập Admin thành công', true)

  await openSettingsEmployees(pageA)
  logStep('Mở Quản trị → Nhân viên', true)

  console.log('\n2. Tạo nhân viên test trên trình duyệt A')
  await addTestEmployee(pageA)
  logStep(`Tạo nhân viên "${TEST_TAG}" trên trình duyệt A`, true)

  console.log('\n3. Trình duyệt B (session riêng) — kiểm tra đồng bộ Supabase')
  await loginAdmin(pageB)
  await openSettingsEmployees(pageB)

  let synced = false
  const deadline = Date.now() + SYNC_WAIT_MS
  while (Date.now() < deadline) {
    if (await pageHasEmployee(pageB, TEST_TAG)) {
      synced = true
      break
    }
    await pageB.reload({ waitUntil: 'networkidle2' })
    await waitForAppReady(pageB)
    await openSettingsEmployees(pageB)
    await new Promise((r) => setTimeout(r, 3000))
  }

  logStep(
    'Admin trên trình duyệt B thấy nhân viên từ trình duyệt A (Supabase sync)',
    synced,
    synced
      ? ''
      : 'Không thấy nhân viên test sau 35s — kiểm tra VITE_SUPABASE_ANON_KEY trên Vercel (phải là key đầy đủ, không có "...") và redeploy.',
  )

  logStep(
    'Production có gọi API Supabase khi tải app',
    supabaseRequests > 0,
    supabaseRequests > 0 ? `${supabaseRequests} request(s)` : 'Không thấy request tới supabase.co — Supabase chưa được cấu hình trên build Production.',
  )

  console.log('\n4. Dọn dữ liệu test')
  await openSettingsEmployees(pageA)
  await deleteTestEmployee(pageA, TEST_TAG)
  logStep('Đã xoá (hoặc cố gắng xoá) nhân viên test', true)
} catch (error) {
  failed += 1
  console.error(`  ✗ Lỗi không mong đợi: ${error.message}`)
} finally {
  await browser.close()
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
