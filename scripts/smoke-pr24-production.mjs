/**
 * Smoke test PR #24 trên Production.
 * Chạy: npx -y puppeteer@23 scripts/smoke-pr24-production.mjs
 */
import puppeteer from 'puppeteer-core'

const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'

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

async function login(page, { role, branch = '', employeeId = '', password = '' }) {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitReady(page)
  await page.select('.login__field select', role)
  if (branch) {
    await page.waitForFunction(
      () => document.querySelectorAll('.login__field select').length >= 2,
      { timeout: 10000 },
    )
    const selects = await page.$$('.login__field select')
    await selects[1].select(branch)
  }
  if (employeeId) {
    await page.waitForFunction(
      () => document.querySelectorAll('.login__field select').length >= 3,
      { timeout: 10000 },
    )
    const selects = await page.$$('.login__field select')
    await selects[2].select(employeeId)
  }
  await page.type('input[type="password"]', password, { delay: 10 })
  await page.click('button.login__submit')
  await page.waitForFunction(() => !document.querySelector('.login__form'), { timeout: 45000 })
}

async function logout(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Đăng xuất'))
    btn?.click()
  })
  await page.waitForFunction(() => document.querySelector('.login__form'), { timeout: 20000 })
  await waitReady(page)
}

async function navTo(page, label) {
  await page.evaluate((text) => {
    const btn = [...document.querySelectorAll('.sidebar__nav button, .sidebar__nav a')].find((el) =>
      el.textContent.includes(text),
    )
    btn?.click()
  }, label)
  await new Promise((r) => setTimeout(r, 1500))
}

console.log(`\n=== PR #24 Production Smoke Test — ${BASE} ===\n`)

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const page = await browser.newPage()

try {
  console.log('1. Build / site load')
  const res = await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  log('Production HTTP load', res?.ok())
  await waitReady(page)
  log('Login page render', (await page.content()).includes('Đăng nhập hệ thống'))

  console.log('\n2. Login Admin')
  await login(page, { role: 'admin', password: ADMIN_PASSWORD })
  const adminText = await page.evaluate(() => document.body.textContent)
  log(
    'Login Admin',
    adminText.includes('Hóa đơn') || adminText.includes('Dashboard') || adminText.includes('Quản trị'),
  )

  console.log('\n3. Dashboard')
  await navTo(page, 'Dashboard')
  log('Dashboard load', (await page.content()).length > 500)

  console.log('\n4. Payroll')
  await navTo(page, 'Lương')
  log('Payroll load', /Lương|lương/i.test(await page.content()))

  console.log('\n5. Attendance')
  await navTo(page, 'Chấm công')
  log('Attendance load', /Chấm công|chấm công/i.test(await page.content()))

  console.log('\n6. Đổi mật khẩu — form 3 trường')
  await navTo(page, 'Quản trị')
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.settings__tab, button')].find((el) =>
      /Tài khoản|Mật khẩu/i.test(el.textContent),
    )
    tab?.click()
  })
  await new Promise((r) => setTimeout(r, 1000))
  const pwdLabels = await page.evaluate(() =>
    [...document.querySelectorAll('label')]
      .map((l) => l.textContent.trim())
      .filter((t) => /Mật khẩu/i.test(t)),
  )
  log('Change password form (3 fields)', pwdLabels.length >= 3, pwdLabels.join(', '))

  await logout(page)

  console.log('\n7. Login Quản lý chi nhánh')
  await login(page, { role: 'branch_manager', branch: 'soc-trang', password: 'khoespasoctrang' })
  log('Login Quản lý', /Hóa đơn|Chấm công/i.test(await page.content()))

  console.log('\n8. Sửa chấm công — UI')
  await navTo(page, 'Chấm công')
  const hasEdit = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => /Sửa|Chi tiết|Thêm/.test(b.textContent)),
  )
  log('Attendance có nút Sửa/Chi tiết/Thêm', hasEdit)

  await logout(page)

  console.log('\n9. Login Nhân viên')
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitReady(page)
  await page.select('.login__field select', 'employee')
  await page.waitForFunction(
    () => document.querySelectorAll('.login__field select').length >= 2,
    { timeout: 10000 },
  )
  const empSelects = await page.$$('.login__field select')
  await empSelects[1].select('soc-trang')
  await page.waitForFunction(
    () => document.querySelectorAll('.login__field select').length >= 3,
    { timeout: 10000 },
  )
  const empSelects2 = await page.$$('.login__field select')
  const { employeeId, employeeName, branchPasswordName } = await page.evaluate((branchSel, empSel) => {
    const empOption = empSel.options[1]
    const branchOption = [...branchSel.options].find((o) => o.value === 'soc-trang')
    return {
      employeeId: empOption?.value ?? '',
      employeeName: empOption?.textContent?.trim() ?? '',
      branchPasswordName: branchOption?.textContent?.trim() ?? '',
    }
  }, empSelects2[1], empSelects2[2])

  if (!employeeId) {
    log('Login Nhân viên', false, 'Không có nhân viên active tại chi nhánh soc-trang')
  } else {
    const normalize = (text) =>
      String(text ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]/g, '')
    const defaultPwd = normalize(employeeName) + normalize(branchPasswordName)
    await empSelects2[2].select(employeeId)
    await page.type('input[type="password"]', defaultPwd, { delay: 10 })
    await page.click('button.login__submit')
    try {
      await page.waitForFunction(() => !document.querySelector('.login__form'), { timeout: 20000 })
      log('Login Nhân viên', true, `${employeeName} (mật khẩu mặc định)`)
    } catch {
      log(
        'Login Nhân viên',
        false,
        `${employeeName} — mật khẩu mặc đnh không khớp (có thể đã đổi mật khẩu, cần kiểm tra thủ công)`,
      )
    }
  }
} catch (error) {
  failed += 1
  console.error(`  ✗ Lỗi không mong đợi: ${error.message}`)
} finally {
  await browser.close()
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
