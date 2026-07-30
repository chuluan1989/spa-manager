/**
 * Smoke login — branch feature trên local preview (Production Supabase backend)
 *
 * Usage:
 *   npm run build
 *   npx vite preview --host 127.0.0.1 --port 4173 &
 *   ADMIN_PASSWORD=admin123 TRUC_LY_PASSWORD=truclysoctrang node scripts/smoke-feature-login.mjs
 *
 * Env:
 *   PREVIEW_URL (default http://127.0.0.1:4173)
 *   ADMIN_PASSWORD
 *   TRUC_LY_PASSWORD — mặc định thử trucly + Sóc Trăng
 *   CHERRY_PASSWORD — nếu không set, bỏ qua Cherry login (customPassword)
 */
import puppeteer from 'puppeteer-core'

const PREVIEW = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173'
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'
const TRUC_LY_PASSWORD = process.env.TRUC_LY_PASSWORD ?? 'truclysoctrang'
const CHERRY_PASSWORD = process.env.CHERRY_PASSWORD ?? ''

let passed = 0
let failed = 0
let skipped = 0

function log(name, status, detail = '') {
  if (status === 'pass') {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else if (status === 'skip') {
    skipped += 1
    console.log(`  ○ ${name} (skip${detail ? `: ${detail}` : ''})`)
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

const SESSION_KEY = 'spa-manager-current-user'

async function clearSession(page) {
  await page.evaluate((key) => {
    sessionStorage.removeItem(key)
    localStorage.removeItem('spa-manager-login-remember-role')
  }, SESSION_KEY)
}

async function loginEmployee(page, { username, password }) {
  await clearSession(page)
  await page.goto(PREVIEW, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitReady(page)
  await page.waitForSelector('form.login__form select', { timeout: 15000 })
  await page.select('form.login__form select', 'employee')
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 })
  await page.evaluate(() => {
    const user = document.querySelector('input[autocomplete="username"]')
    const pass = document.querySelector('input[type="password"]')
    if (user) user.value = ''
    if (pass) pass.value = ''
  })
  await page.type('input[autocomplete="username"]', username, { delay: 10 })
  await page.type('input[type="password"]', password, { delay: 10 })
  await page.click('button.login__submit')
  await new Promise((r) => setTimeout(r, 3500))
  const stillLogin = await page.evaluate(() => Boolean(document.querySelector('.login__form')))
  if (stillLogin) {
    const err = await page.evaluate(() => document.querySelector('.login__error')?.textContent?.trim() ?? '')
    return { ok: false, error: err || 'Still on login page' }
  }
  await waitReady(page)
  const session = await page.evaluate((key) => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || 'null')
    } catch {
      return null
    }
  }, SESSION_KEY)
  return { ok: true, session }
}

async function loginBranchManager(page, { username, password }) {
  await clearSession(page)
  await page.goto(PREVIEW, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitReady(page)
  await page.waitForSelector('form.login__form select', { timeout: 15000 })
  await page.select('form.login__form select', 'branch_manager')
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 })
  await page.type('input[autocomplete="username"]', username, { delay: 10 })
  await page.type('input[type="password"]', password, { delay: 10 })
  await page.click('button.login__submit')
  await new Promise((r) => setTimeout(r, 3500))
  const stillLogin = await page.evaluate(() => Boolean(document.querySelector('.login__form')))
  if (stillLogin) {
    const err = await page.evaluate(() => document.querySelector('.login__error')?.textContent?.trim() ?? '')
    return { ok: false, error: err || 'Still on login page' }
  }
  await waitReady(page)
  const session = await page.evaluate((key) => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || 'null')
    } catch {
      return null
    }
  }, SESSION_KEY)
  return { ok: true, session }
}

async function loginAdmin(page) {
  await clearSession(page)
  await page.goto(PREVIEW, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitReady(page)
  await page.waitForSelector('form.login__form select', { timeout: 15000 })
  await page.select('form.login__form select', 'admin')
  await page.type('input[type="password"]', ADMIN_PASSWORD, { delay: 10 })
  await page.click('button.login__submit')
  await page.waitForFunction(() => !document.querySelector('.login__form'), { timeout: 45000 })
  await waitReady(page)
  const text = await page.evaluate(() => document.body.textContent ?? '')
  return /Dashboard|Hóa đơn|Quản trị|Tổng quan/i.test(text)
}

async function assertNoBranchPickerOnLogin(page) {
  await clearSession(page)
  await page.goto(PREVIEW, { waitUntil: 'networkidle2', timeout: 60000 })
  await waitReady(page)
  await page.select('form.login__form select', 'employee')
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 })
  return page.evaluate(() => {
    const selects = [...document.querySelectorAll('.login__form select')]
    const branchSelect = selects.some((el) =>
      [...el.options].some((opt) => opt.textContent.includes('Chọn chi nhánh')),
    )
    return !branchSelect
  })
}

console.log(`\n=== Smoke Login — ${PREVIEW} ===\n`)

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const page = await browser.newPage()

try {
  const res = await page.goto(PREVIEW, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null)
  log('Preview HTTP load', res?.ok() ? 'pass' : 'fail', PREVIEW)

  log('Admin login', (await loginAdmin(page)) ? 'pass' : 'fail')

  log('NV login form — không chọn chi nhánh', (await assertNoBranchPickerOnLogin(page)) ? 'pass' : 'fail')

  const qlPassword = process.env.QL_PASSWORD ?? process.env.BAC_LIEU_QL_PASSWORD ?? ''
  if (qlPassword) {
    const ql = await loginBranchManager(page, { username: 'bac-lieu', password: qlPassword })
      .catch((e) => ({ ok: false, error: e.message }))
    log('QL chi nhánh login (bac-lieu)', ql.ok ? 'pass' : 'fail', ql.error || ql.session?.branch || '')
  } else {
    log('QL chi nhánh login', 'skip', 'QL_PASSWORD chưa set')
  }

  const trucLyPasswords = [
    process.env.TRUC_LY_PASSWORD,
    'truclysoctrang',
    'truclytramspa',
  ].filter(Boolean)
  const tried = new Set()
  let trucLy = { ok: false, error: 'No password tried' }
  for (const pw of trucLyPasswords) {
    if (tried.has(pw)) continue
    tried.add(pw)
    trucLy = await loginEmployee(page, {
      username: 'tram-spa-truc-ly',
      password: pw,
    }).catch((e) => ({ ok: false, error: e.message }))
    if (trucLy.ok && trucLy.session?.branch === 'soc-trang') break
  }
  const trucLyOk = trucLy.ok && trucLy.session?.branch === 'soc-trang'
  log('Trúc Ly login → soc-trang branch', trucLyOk ? 'pass' : 'fail', trucLy.error || trucLy.session?.branch || '')

  if (CHERRY_PASSWORD) {
    await page.goto(PREVIEW, { waitUntil: 'networkidle2' })
    await waitReady(page)
    const cherry = await loginEmployee(page, {
      username: 'tram-spa-cherry',
      password: CHERRY_PASSWORD,
    }).catch((e) => ({ ok: false, error: e.message }))
    const cherryOk = cherry.ok && cherry.session?.branch === 'bac-lieu'
    log('Cherry login → bac-lieu branch', cherryOk ? 'pass' : 'fail', cherry.error || cherry.session?.branch || '')
  } else {
    log('Cherry login → bac-lieu branch', 'skip', 'CHERRY_PASSWORD chưa set (customPassword=true)')
  }
} finally {
  await browser.close()
}

console.log(`\nPASS: ${passed} | FAIL: ${failed} | SKIP: ${skipped}\n`)
process.exit(failed > 0 ? 1 : 0)
