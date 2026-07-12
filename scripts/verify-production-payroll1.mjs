/**
 * Verify kỳ lương 1 policy + Production smoke (app_settings SSOT).
 * node scripts/verify-production-payroll1.mjs
 */
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'
const LOCK_MSG_SNIP = 'Tài khoản đang tạm khóa chức năng nhập hóa đơn do chưa hoàn thành dữ liệu kỳ lương 1'

let passed = 0
let failed = 0
const results = []

function logStep(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}`)
    if (detail) console.error(`    ${detail}`)
  }
}

function getIctParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]))
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour === '24' ? '0' : map.hour),
  }
}

function isAfterIctEndOfDay(lockDate, now = new Date()) {
  const ict = getIctParts(now)
  return ict.date > lockDate
}

function listDatesInclusive(fromDate, toDate) {
  const out = []
  const [fy, fm, fd] = fromDate.split('-').map(Number)
  const cursor = new Date(Date.UTC(fy, fm - 1, fd))
  const [ty, tm, td] = toDate.split('-').map(Number)
  const end = new Date(Date.UTC(ty, tm - 1, td))
  while (cursor <= end) {
    const y = cursor.getUTCFullYear()
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0')
    const d = String(cursor.getUTCDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

async function loadProd() {
  const html = await fetch(BASE_URL).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  const js = await fetch(`${BASE_URL}${jsMatch[0]}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  const hasFeature = js.includes('THÔNG BÁO HOÀN THIỆN DỮ LIỆU KỲ LƯƠNG 1')
    && js.includes('payroll1DayReviews')
    && js.includes(LOCK_MSG_SNIP)
  return { url, key, bundle: jsMatch[0], hasFeature }
}

console.log('\n=== Unit: ICT + lock policy ===\n')
const today = getIctParts().date
logStep('Ngày ICT hợp lệ', /^\d{4}-\d{2}-\d{2}$/.test(today))
logStep('listDatesInclusive 01–03/07', listDatesInclusive('2026-07-01', '2026-07-03').length === 3)
logStep('Trước hạn 15/07 chưa khóa', !isAfterIctEndOfDay('2026-07-15', new Date('2026-07-15T16:00:00+07:00')))
logStep('Sau 15/07 (từ 16/07) khóa', isAfterIctEndOfDay('2026-07-15', new Date('2026-07-16T00:00:00+07:00')))
logStep('Hôm nay chưa qua hạn khóa', !isAfterIctEndOfDay('2026-07-15', new Date()), `ICT today=${today}`)

console.log('\n=== Production smoke ===\n')
const { url, key, bundle, hasFeature } = await loadProd()
logStep(`Bundle có feature kỳ lương 1: ${bundle}`, hasFeature)

const sb = createClient(url, key)
const { error: settingsErr } = await sb.from('app_settings').select('payload').eq('id', 'singleton').maybeSingle()
logStep('app_settings đọc được (SSOT trạng thái)', !settingsErr, settingsErr?.message ?? '')

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

try {
  const page = await browser.newPage()
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 })
  const landingBtn = await page.$('button.landing__cta')
  if (landingBtn) await landingBtn.click()
  await page.waitForSelector('.login__form', { timeout: 15000 })
  await page.select('.login__form select', 'admin')
  await page.focus('input[type="password"]')
  await page.keyboard.type(ADMIN_PASSWORD, { delay: 15 })
  await page.evaluate(() => document.querySelector('.login__form')?.requestSubmit())
  await page.waitForSelector('.sidebar', { timeout: 30000 })

  const hasAdminNav = await page.evaluate(() =>
    [...document.querySelectorAll('.sidebar__nav button')].some((el) => el.textContent.includes('KL1')),
  )
  logStep('Admin thấy menu KL1 tổng hợp', hasAdminNav)

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.sidebar__nav button')].find((el) =>
      el.textContent.includes('KL1'),
    )
    btn?.click()
  })
  await page.waitForFunction(
    () => document.body.textContent.includes('Tổng hợp hoàn thiện dữ liệu kỳ lương 1'),
    { timeout: 20000 },
  )
  logStep('Mở trang tổng hợp Admin', true)

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.sidebar__nav button')].find((el) =>
      el.textContent.includes('Cài đặt'),
    )
    btn?.click()
  })
  await new Promise((r) => setTimeout(r, 800))
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.settings__tab')].find((el) =>
      el.textContent.includes('Hệ thống'),
    )
    tab?.click()
  })
  await new Promise((r) => setTimeout(r, 800))
  const hasSettings = await page.evaluate(() =>
    document.body.textContent.includes('Kỳ lương 1'),
  )
  logStep('Cài đặt có mục gia hạn kỳ lương 1', hasSettings)
} finally {
  await browser.close()
}

const summary = { passed, failed, results, bundle, todayIct: today }
writeFileSync('tmp-payroll1-verify.json', JSON.stringify(summary, null, 2))
console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
