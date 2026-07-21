/**
 * Final Preview verification — Admin Dashboard realtime + listener leak soak.
 * Usage: node --env-file=.env.local scripts/verify-preview-final.mjs [preview-url]
 */
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'

const PREVIEW_URL = process.argv[2]
  ?? process.env.PREVIEW_URL
  ?? 'https://spa-manager-git-hotfix-admin-da-913df6-chuluantn-7418s-projects.vercel.app'
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SOAK_MS = Number(process.env.SOAK_MS ?? 10 * 60 * 1000)
const NAV_CYCLES = Number(process.env.NAV_CYCLES ?? 20)

const sbUrl = process.env.VITE_SUPABASE_URL
const sbKey = process.env.VITE_SUPABASE_ANON_KEY
assert(sbUrl && sbKey, 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY required')

const sb = createClient(sbUrl, sbKey)
const TAG = `hotfix-verify-${Date.now()}`
const testInvoiceIds = []

const log = {
  pass: (msg) => console.log(`  ✓ ${msg}`),
  fail: (msg, detail = '') => {
    console.error(`  ✗ ${msg}`)
    if (detail) console.error(`    ${detail}`)
  },
  info: (msg) => console.log(`  · ${msg}`),
}

let failed = 0
function check(name, ok, detail = '') {
  if (ok) log.pass(name)
  else {
    failed += 1
    log.fail(name, detail)
  }
  return ok
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function buildInvoice({ id, branchId, branchName, employeeId, employeeName, customerName, total }) {
  const now = new Date().toISOString()
  return {
    id,
    date: todayIso(),
    branch_id: branchId,
    branch_name: branchName,
    employee_id: employeeId,
    employee_name: employeeName,
    customer_name: customerName,
    customer_phone: '',
    service_ids: [],
    services: [{ id: 'svc-verify', name: 'Verify Service', price: total, duration: 60 }],
    tips: 0,
    payment_method: 'tien-mat',
    service_total: total,
    total,
    commission: 0,
    created_at: now,
    updated_at: now,
  }
}

async function cleanupTestInvoices() {
  for (const id of testInvoiceIds) {
    await sb.from('invoices').delete().eq('id', id)
  }
}

async function getListenerCount(page) {
  return page.evaluate(() => {
    const fn = globalThis.__spaGetInvoicesRealtimeListenerCount
    return typeof fn === 'function' ? fn() : -1
  })
}

async function clickSidebar(page, label) {
  await page.evaluate((text) => {
    const btn = [...document.querySelectorAll('.sidebar__link')].find((el) =>
      el.textContent.includes(text),
    )
    if (!btn) throw new Error(`Nav not found: ${text}`)
    btn.click()
  }, label)
}

async function waitForPage(page, predicate, timeout = 45000) {
  await page.waitForFunction(predicate, { timeout })
}

async function openAdminDashboard(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 120000 })
  if (page.url().includes('vercel.com/sso')) {
    throw new Error('Preview blocked by Vercel SSO — use LOCAL_PREVIEW_URL=http://localhost:4173')
  }
  await page.evaluate(() => {
    sessionStorage.setItem('spa-manager-current-user', JSON.stringify({ role: 'admin', branch: 'all' }))
  })
  await page.reload({ waitUntil: 'networkidle0', timeout: 120000 })
  await waitForPage(page, () =>
    document.body.textContent.includes('Business Copilot')
    && document.getElementById('root')?.innerHTML?.length > 500,
  )
}

async function assertDashboardListeners(page, label) {
  const count = await getListenerCount(page)
  check(`${label}: listeners.size=3 on Dashboard`, count === 3, `got ${count}`)
  return count
}

async function runInvoiceOps(round) {
  const id = `${TAG}-${round}`
  testInvoiceIds.push(id)

  const createSocTrang = buildInvoice({
    id,
    branchId: 'soc-trang',
    branchName: 'CN1',
    employeeId: 'emp-verify-a',
    employeeName: 'Verify A',
    customerName: `${TAG} CN1`,
    total: 100000 + round,
  })
  let { error } = await sb.from('invoices').insert(createSocTrang)
  if (error) throw new Error(`insert soc-trang: ${error.message}`)

  await new Promise((r) => setTimeout(r, 2500))

  const newTotal = 150000 + round
  ;({ error } = await sb.from('invoices').update({ total: newTotal, service_total: newTotal, updated_at: new Date().toISOString() }).eq('id', id))
  if (error) throw new Error(`update: ${error.message}`)

  await new Promise((r) => setTimeout(r, 2500))

  const id2 = `${TAG}-gl1-${round}`
  testInvoiceIds.push(id2)
  const createGiaLai = buildInvoice({
    id: id2,
    branchId: 'gia-lai-1',
    branchName: 'CN3',
    employeeId: 'emp-verify-b',
    employeeName: 'Verify B',
    customerName: `${TAG} GiaLai`,
    total: 200000 + round,
  })
  ;({ error } = await sb.from('invoices').insert(createGiaLai))
  if (error) throw new Error(`insert gia-lai-1: ${error.message}`)

  await new Promise((r) => setTimeout(r, 2500))

  ;({ error } = await sb.from('invoices').delete().eq('id', id))
  if (error) throw new Error(`delete: ${error.message}`)

  await new Promise((r) => setTimeout(r, 2500))
}

async function assertSectionsHealthy(page) {
  const state = await page.evaluate(() => ({
    copilot: document.body.textContent.includes('Business Copilot'),
    crm: document.body.textContent.includes('CRM'),
    workflow: document.body.textContent.includes('Cần xử lý hôm nay') || document.body.textContent.includes('Operation'),
    rootLen: document.getElementById('root')?.innerHTML?.length || 0,
    loading: document.body.textContent.includes('Đang tải...'),
  }))
  check('Dashboard sections: Copilot visible', state.copilot)
  check('Dashboard sections: CRM visible', state.crm)
  check('Dashboard sections: Workflow strip visible', state.workflow)
  check('Dashboard sections: root rendered', state.rootLen > 500, `rootLen=${state.rootLen}`)
  check('Dashboard sections: not stuck loading', !state.loading)
  return state
}

console.log(`\nPreview final verify — ${PREVIEW_URL}`)
console.log(`Soak ${SOAK_MS / 1000}s · Nav cycles ${NAV_CYCLES}\n`)

const pageErrors = []
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const page = await browser.newPage()
page.on('pageerror', (err) => pageErrors.push(err.message))

try {
  await openAdminDashboard(page, PREVIEW_URL)
  check('Admin Dashboard opens on Preview', true)

  const hookOk = await page.evaluate(() => typeof globalThis.__spaGetInvoicesRealtimeListenerCount === 'function')
  check('window.__spaGetInvoicesRealtimeListenerCount exposed', hookOk)

  let maxListeners = 0
  let minListeners = Infinity
  const listenerSamples = []

  const recordListeners = async (label) => {
    const n = await getListenerCount(page)
    listenerSamples.push({ label, n })
    maxListeners = Math.max(maxListeners, n)
    minListeners = Math.min(minListeners, n)
    return n
  }

  await assertDashboardListeners(page, 'initial')
  await assertSectionsHealthy(page)

  const soakStart = Date.now()
  const INVOICE_INTERVAL_MS = Math.max(30000, Math.floor(SOAK_MS / 10))
  let round = 0
  while (Date.now() - soakStart < SOAK_MS) {
    round += 1
    log.info(`Soak round ${round} — invoice CRUD via Supabase (${Math.round((Date.now() - soakStart) / 1000)}s elapsed)`)
    try {
      await runInvoiceOps(round)
    } catch (err) {
      check(`invoice CRUD round ${round}`, false, err.message)
    }
    if (pageErrors.length) {
      check(`no pageerror during soak round ${round}`, false, pageErrors.join(' | '))
      break
    }
    await assertSectionsHealthy(page)
    const n = await recordListeners(`soak-round-${round}`)
    check(`soak round ${round}: listeners.size stable (≤3)`, n <= 3 && n >= 0, `size=${n}`)

    const remaining = SOAK_MS - (Date.now() - soakStart)
    if (remaining <= 0) break
    await new Promise((r) => setTimeout(r, Math.min(INVOICE_INTERVAL_MS, remaining)))
  }

  log.info(`Navigation stress — ${NAV_CYCLES} cycles`)
  for (let i = 1; i <= NAV_CYCLES; i += 1) {
    await clickSidebar(page, 'Chấm công')
    await waitForPage(page, () => document.querySelector('h1')?.textContent?.includes('Chấm công') || document.body.textContent.includes('Chấm công'))
    await recordListeners(`cycle-${i}-attendance`)

    await clickSidebar(page, 'Tổng quan')
    await waitForPage(page, () => document.body.textContent.includes('Business Copilot'))
    await assertDashboardListeners(page, `cycle-${i}-dashboard-1`)

    await clickSidebar(page, 'Khách hàng')
    await waitForPage(page, () => document.body.textContent.includes('Khách hàng'))
    const crmListeners = await recordListeners(`cycle-${i}-crm`)
    check(`cycle ${i}: CRM page listeners ≤1`, crmListeners <= 1, `size=${crmListeners}`)

    await clickSidebar(page, 'Tổng quan')
    await waitForPage(page, () => document.body.textContent.includes('Business Copilot'))
    await assertDashboardListeners(page, `cycle-${i}-dashboard-2`)

    await clickSidebar(page, 'Báo cáo')
    await waitForPage(page, () => document.body.textContent.includes('Báo cáo'))
    const reportListeners = await recordListeners(`cycle-${i}-reports`)
    check(`cycle ${i}: Reports page listeners ≤1`, reportListeners <= 1, `size=${reportListeners}`)

    await clickSidebar(page, 'Tổng quan')
    await waitForPage(page, () => document.body.textContent.includes('Business Copilot'))
    await assertDashboardListeners(page, `cycle-${i}-dashboard-3`)

    if (pageErrors.length) break
  }

  const finalCount = await assertDashboardListeners(page, 'final')
  check('listeners.size never exceeded 3', maxListeners <= 3, `max=${maxListeners}`)
  check('final listeners.size equals 3', finalCount === 3, `got ${finalCount}`)
  check('no React pageerror throughout', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

  log.info(`listener samples: min=${minListeners} max=${maxListeners} final=${finalCount}`)
} catch (err) {
  failed += 1
  log.fail('unexpected', err.message)
} finally {
  await browser.close()
  await cleanupTestInvoices()
}

console.log(`\nResult: ${failed === 0 ? 'PASS' : `FAIL (${failed})`}\n`)
process.exit(failed > 0 ? 1 : 0)
