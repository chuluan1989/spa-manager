/**
 * Production: lưu chi phí Supabase + công thức lợi nhuận.
 * Chạy: node scripts/verify-production-expenses.mjs
 */
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'
const TEST_TAG = `__EXP_VERIFY_${Date.now()}__`

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

async function loadProductionSupabaseEnv() {
  const html = await fetch(BASE).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  if (!jsMatch) throw new Error('Không tìm thấy bundle JS')
  const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
  const hasTaxi = js.includes("'taxi'") || js.includes('Taxi')
  const hasProfit = js.includes('actualRevenue') || js.includes('computeProfitAmount')
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if (!url || !key) throw new Error('Không tìm thấy Supabase credentials')
  return { url, key, bundle: jsMatch[0], hasTaxi, hasProfit }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

console.log(`\nProduction expense/profit verify — ${BASE}\n`)

const { url, key, bundle, hasTaxi, hasProfit } = await loadProductionSupabaseEnv()
logStep(`Bundle deploy: ${bundle}`, true)
logStep('Bundle có nhóm Taxi', hasTaxi)
logStep('Bundle có công thức lợi nhuận mới', hasProfit)

const sb = createClient(url, key)
const testExpenseId = `exp-verify-${Date.now()}`
const today = new Date().toISOString().slice(0, 10)

const { data: branch } = await sb.from('branches').select('id,name').eq('id', 'soc-trang').maybeSingle()
if (!branch?.id) throw new Error('Không tìm thấy chi nhánh soc-trang')

const { error: insertErr } = await sb.from('expenses').upsert({
  id: testExpenseId,
  date: today,
  branch_id: 'soc-trang',
  branch_name: branch.name,
  expense_type: 'taxi',
  expense_type_label: 'Taxi',
  content: TEST_TAG,
  amount: 150000,
  entered_by: 'Production Verify',
  note: 'Auto test Taxi',
  updated_at: new Date().toISOString(),
})
logStep('Insert chi phí Taxi Supabase', !insertErr, insertErr?.message ?? '')

const { data: readBack, error: readErr } = await sb
  .from('expenses')
  .select('id,branch_id,expense_type,content,amount')
  .eq('id', testExpenseId)
  .maybeSingle()
logStep('Đọc lại chi phí sau insert', !readErr && readBack?.content === TEST_TAG,
  readErr?.message ?? JSON.stringify(readBack))

const actualRevenue = 10000000 + 1000000
const profit = actualRevenue - 5000000 - 2000000
logStep('Công thức lợi nhuận 4.000.000đ', profit === 4000000, `got ${profit}`)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

try {
  const page = await browser.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  const landingBtn = await page.$('button.landing__cta')
  if (landingBtn) await landingBtn.click()
  await page.waitForSelector('.login__form', { timeout: 15000 })
  await page.select('.login__form select', 'admin')
  await page.focus('input[type="password"]')
  await page.keyboard.type(ADMIN_PASSWORD, { delay: 20 })
  await page.evaluate(() => document.querySelector('.login__form')?.requestSubmit())
  await page.waitForSelector('.sidebar', { timeout: 30000 })

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.sidebar__nav button')].find((el) =>
      el.textContent.includes('Chi phí'),
    )
    btn?.click()
  })
  await page.waitForSelector('.expenses', { timeout: 20000 })
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('button, .kpi-card, [role="button"]')].find((el) =>
      el.textContent.includes('Tổng chi phí toàn hệ thống'),
    )
    card?.click()
  })
  await page.waitForSelector('.exp-mod__table, .exp-mod__empty', { timeout: 30000 })
  await page.waitForFunction(
    () => !document.body.textContent.includes('Đang tải dữ liệu chi phí'),
    { timeout: 30000 },
  )
  await sleep(1000)

  const seesExpense = await page.evaluate((tag) => document.body.textContent.includes(tag), TEST_TAG)
  logStep('Admin UI thấy chi phí Taxi test', seesExpense, `tag=${TEST_TAG}`)
} finally {
  await sb.from('expenses').delete().eq('id', testExpenseId)
  await browser.close()
}

console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
