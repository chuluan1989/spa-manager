/**
 * Verify kỳ lương 1 policy + Production smoke (app_settings SSOT).
 * node scripts/verify-production-payroll1.mjs
 */
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import {
  isAfterIctEndOfDay,
  getIctTodayDate,
  listDatesInclusive,
} from '../src/utils/ictTime.js'
import {
  summarizeEmployeePayroll1Status,
  isPayroll1DeadlinePassed,
  PAYROLL1_INVOICE_LOCK_MESSAGE,
} from '../src/utils/payroll1Policy.js'

const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'

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

async function loadProd() {
  const html = await fetch(BASE_URL).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  const js = await fetch(`${BASE_URL}${jsMatch[0]}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  const hasFeature = js.includes('THÔNG BÁO HOÀN THIỆN DỮ LIỆU KỲ LƯƠNG 1')
    && js.includes('payroll1DayReviews')
    && js.includes(PAYROLL1_INVOICE_LOCK_MESSAGE.slice(0, 40))
  return { url, key, bundle: jsMatch[0], hasFeature, js }
}

console.log('\n=== Unit: ICT + lock policy ===\n')
logStep('Ngày ICT hợp lệ', /^\d{4}-\d{2}-\d{2}$/.test(getIctTodayDate()))
logStep('listDatesInclusive 01–03/07', listDatesInclusive('2026-07-01', '2026-07-03').length === 3)
logStep('Trước hạn 15/07 chưa khóa', !isAfterIctEndOfDay('2026-07-15', new Date('2026-07-15T16:00:00+07:00')))
logStep('Sau 15/07 00:00 ngày 16 khóa', isAfterIctEndOfDay('2026-07-15', new Date('2026-07-16T00:00:00+07:00')))

const incomplete = summarizeEmployeePayroll1Status({
  employee: { id: 'e1', branchId: 'b1', name: 'A', phone: '090', cccd: '1' },
  attendanceRecords: [],
  invoices: [],
  dayReviews: [],
  override: null,
  now: new Date('2026-07-12T10:00:00+07:00'),
})
logStep('Trước hạn: thiếu dữ liệu vẫn chưa khóa HĐ', !incomplete.invoiceCreateLocked && !incomplete.dataComplete)

const incompleteAfter = summarizeEmployeePayroll1Status({
  employee: { id: 'e1', branchId: 'b1', name: 'A', phone: '090', cccd: '1' },
  attendanceRecords: [],
  invoices: [],
  dayReviews: [],
  override: null,
  now: new Date('2026-07-16T00:30:00+07:00'),
})
logStep('Sau hạn: thiếu dữ liệu bị khóa HĐ', incompleteAfter.invoiceCreateLocked)

const unlocked = summarizeEmployeePayroll1Status({
  employee: { id: 'e1', branchId: 'b1', name: 'A', phone: '090', cccd: '1' },
  attendanceRecords: [],
  invoices: [],
  dayReviews: [],
  override: { manualUnlock: true },
  now: new Date('2026-07-16T00:30:00+07:00'),
})
logStep('Sau hạn: manual unlock mở khóa', !unlocked.invoiceCreateLocked)

const noTourOk = summarizeEmployeePayroll1Status({
  employee: { id: 'e1', branchId: 'b1', name: 'A', phone: '09', cccd: '1' },
  attendanceRecords: listDatesInclusive('2026-07-01', '2026-07-03').map((date) => ({ date, status: 'on_time' })),
  invoices: [],
  dayReviews: listDatesInclusive('2026-07-01', '2026-07-03').map((dayDate) => ({
    dayDate,
    reviewStatus: 'no_tour',
    employeeId: 'e1',
  })),
  override: null,
  now: new Date('2026-07-03T12:00:00+07:00'),
})
logStep('Ngày không tour (no_tour) = đã kiểm tra HĐ', noTourOk.invoiceReviewComplete && noTourOk.attendanceComplete)

console.log('\n=== Production smoke ===\n')
const { url, key, bundle, hasFeature } = await loadProd()
logStep(`Bundle có feature kỳ lương 1: ${bundle}`, hasFeature)

const sb = createClient(url, key)
const { data: settingsRow, error: settingsErr } = await sb.from('app_settings').select('payload').eq('id', 'singleton').maybeSingle()
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

  const today = getIctTodayDate()
  logStep(`Hôm nay ICT ${today}: trước/sau hạn`, true,
    isPayroll1DeadlinePassed() ? 'ĐÃ qua hạn khóa' : 'Chưa qua hạn — NV thiếu dữ liệu vẫn tạo HĐ được')
} finally {
  await browser.close()
}

const summary = { passed, failed, results, bundle }
writeFileSync('tmp-payroll1-verify.json', JSON.stringify(summary, null, 2))
console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
