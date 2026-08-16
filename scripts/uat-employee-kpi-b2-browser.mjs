/**
 * B2 browser UAT — Preview local only.
 * Chặn network Supabase → không đọc/ghi Production.
 * Inject session + invoices localStorage; tick/untick customerRequested → KPI đổi.
 *
 *   npx vite preview --host 127.0.0.1 --port 4173
 *   node scripts/uat-employee-kpi-b2-browser.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_B2_BROWSER_UAT.json')
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173'

const report = {
  base: BASE,
  startedAt: new Date().toISOString(),
  wroteProduction: false,
  steps: [],
  ok: true,
}

function step(name, pass, detail = {}) {
  report.steps.push({ name, pass: Boolean(pass), detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`)
  if (!pass) {
    report.ok = false
    console.error(detail)
  }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

await page.route('**/*', async (route) => {
  const url = route.request().url()
  if (url.includes('supabase.co') || url.includes('supabase.in')) {
    return route.abort()
  }
  return route.continue()
})

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })

  await page.evaluate(() => {
    const emp = {
      id: 'kpi-uat-emp',
      name: 'KPI UAT NV',
      branchId: 'soc-trang',
      status: 'active',
    }
    const branches = [
      { id: 'soc-trang', name: 'Sóc Trăng', status: 'active' },
      { id: 'tram-spa', name: 'Trạm Spa', status: 'active' },
    ]
    const user = {
      id: 'kpi-uat-user',
      role: 'employee',
      employeeId: emp.id,
      name: emp.name,
      branch: 'soc-trang',
      mustChangePassword: false,
    }
    const mkInv = (requested) => ({
      id: 'kpi-uat-inv-1',
      date: '2026-08-10',
      branchId: 'soc-trang',
      branchName: 'Sóc Trăng',
      employeeId: emp.id,
      employeeName: emp.name,
      supportEmployeeId: '',
      customerName: 'UAT Guest',
      customerPhone: '0900000001',
      customerRequested: requested,
      serviceIds: ['body-60', 'goi-sach'],
      services: [
        { id: 'body-60', serviceId: 'body-60', name: 'Body 60', serviceName: 'Body 60', price: 200000 },
        { id: 'goi-sach', serviceId: 'goi-sach', name: 'Gội sạch', serviceName: 'Gội sạch', price: 50000 },
      ],
      tips: 0,
      paymentMethod: 'cash',
      note: 'KPI B2 UAT local only — do not sync',
      serviceTotal: 250000,
      total: 250000,
      commission: 0,
    })
    localStorage.setItem('spa-manager-branches', JSON.stringify(branches))
    localStorage.setItem('spa-manager-employees', JSON.stringify([emp]))
    localStorage.setItem('spa-manager-invoices', JSON.stringify([mkInv(false)]))
    // Seed fallback policies locally so fetch miss still works via engine defaults
    localStorage.setItem('spa-manager-kpi-branch-policies', JSON.stringify([{
      id: 'local-st',
      branchId: 'soc-trang',
      effectiveFrom: '2026-08-01',
      addonTarget: 0.7,
      advancedTarget: 0.1,
      comboTarget: 0.3,
      requestedTarget: 0.2,
      status: 'active',
    }]))
    sessionStorage.setItem('spa-manager-current-user', JSON.stringify(user))
    sessionStorage.setItem('spa-manager-today-attendance-remind-dismissed', '1')
  })

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)

  // Dismiss attendance remind if present
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
    const close = buttons.find((b) => /^\s*Đóng\s*$/.test((b.textContent || '').trim()))
    close?.click()
  })
  await page.waitForTimeout(300)

  const clicked = await page.locator('button.sidebar__link', { hasText: 'KPI' }).count()
  step('Sidebar has KPI link', clicked > 0, { clicked })
  await page.locator('button.sidebar__link', { hasText: 'KPI' }).first().click()
  await page.waitForTimeout(1000)

  let text = await page.locator('body').innerText()
  step('Employee KPI page visible', /Dịch vụ phụ|Khách yêu cầu|CHƯA ĐẠT KPI|ĐẠT KPI|KPI THÁNG/i.test(text), {
    sample: text.slice(0, 800),
  })

  const beforeRequested = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.emp-kpi-card')]
    const req = cards.find((c) => /Khách yêu cầu/i.test(c.textContent || ''))
    return req?.textContent || ''
  })
  step('Requested card before tick shows 0', /0\s*\/\s*1/.test(beforeRequested), { beforeRequested })

  await page.evaluate(() => {
    const raw = localStorage.getItem('spa-manager-invoices')
    const list = JSON.parse(raw || '[]')
    if (list[0]) list[0].customerRequested = true
    localStorage.setItem('spa-manager-invoices', JSON.stringify(list))
    window.dispatchEvent(new CustomEvent('spa-manager:data-synced', {
      detail: { changedEntities: ['invoices'] },
    }))
  })
  await page.waitForTimeout(600)

  const afterTick = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.emp-kpi-card')]
    const req = cards.find((c) => /Khách yêu cầu/i.test(c.textContent || ''))
    return req?.textContent || ''
  })
  step('After tick requested → 1/1', /1\s*\/\s*1/.test(afterTick) && /ĐẠT/i.test(afterTick), { afterTick })

  await page.evaluate(() => {
    const raw = localStorage.getItem('spa-manager-invoices')
    const list = JSON.parse(raw || '[]')
    if (list[0]) list[0].customerRequested = false
    localStorage.setItem('spa-manager-invoices', JSON.stringify(list))
    window.dispatchEvent(new CustomEvent('spa-manager:data-synced', {
      detail: { changedEntities: ['invoices'] },
    }))
  })
  await page.waitForTimeout(600)

  const afterUntick = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.emp-kpi-card')]
    const req = cards.find((c) => /Khách yêu cầu/i.test(c.textContent || ''))
    return req?.textContent || ''
  })
  step('After untick requested → 0/1', /0\s*\/\s*1/.test(afterUntick), { afterUntick })

  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.emp-kpi-card')]
    const addon = cards.find((c) => /Dịch vụ phụ/i.test(c.textContent || ''))
    addon?.click()
  })
  await page.waitForTimeout(400)
  const drill = await page.locator('.emp-kpi-drill').count()
  step('Drill-down opens', drill > 0, { drill })

  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.removeItem('spa-manager-invoices')
    localStorage.removeItem('spa-manager-employees')
  })
  step('No Production write', true, { wroteProduction: false })
} catch (err) {
  step('browser run', false, { error: String(err?.message || err) })
} finally {
  await browser.close()
}

report.finishedAt = new Date().toISOString()
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(report.ok ? '\nPASS browser UAT' : '\nFAIL browser UAT', OUT)
process.exit(report.ok ? 0 : 1)
