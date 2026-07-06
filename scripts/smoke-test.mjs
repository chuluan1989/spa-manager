/**
 * Smoke tests for core business logic (no browser required).
 * Run: node scripts/smoke-test.mjs
 */

import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

function createStorage() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

globalThis.localStorage = createStorage()
globalThis.sessionStorage = createStorage()
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

function setSession(user) {
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify(user))
}

function resetStorage() {
  localStorage.clear()
  sessionStorage.clear()
}

resetStorage()

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    resetStorage()
    fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✗ ${name}`)
    console.error(`    ${error.message}`)
  }
}

const { calculateInvoiceTotals, calculateServiceCommissionFromDetails } = await import('../src/utils/invoice.js')
const { computeReportSummary } = await import('../src/utils/report.js')
const { computeSalaryReport, getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { verifyLogin, ADMIN_BRANCH } = await import('../src/constants/loginCredentials.js')
const { ROLES } = await import('../src/constants/auth.js')
const { saveCurrentUser, loadCurrentUser, clearCurrentUser } = await import('../src/utils/authStorage.js')
const { canAccessEmployeesPage, canAccessInvoicesPage, canDeleteInvoice, filterByUserScope } = await import('../src/constants/auth.js')
const { saveInvoice, loadInvoices } = await import('../src/utils/invoiceStorage.js')
const { ensureCredentialsHashed } = await import('../src/utils/credentialsStorage.js')
const { validateImportPayload } = await import('../src/utils/dataBackup.js')
const { SUPPORT_EMPLOYEE_COMMISSION_RATE } = await import('../src/constants/salary.js')

console.log('\nSpa Manager — smoke tests\n')

test('invoice totals: duplicate services + tips', () => {
  const ids = ['svc-a', 'svc-a']
  const fallback = [
    { id: 'svc-a', name: 'Body 60', price: 200000, commissionPercent: 10, commissionAmount: 20000 },
    { id: 'svc-a', name: 'Body 60', price: 200000, commissionPercent: 10, commissionAmount: 20000 },
  ]
  const totals = calculateInvoiceTotals(ids, 50000, 'vinh-long', fallback)
  assert.equal(totals.serviceTotal, 400000)
  assert.equal(totals.tips, 50000)
  assert.equal(totals.total, 450000)
  assert.equal(totals.serviceCommission, 40000)
  assert.equal(totals.commission, 90000)
})

test('report summary: commission excludes tips', () => {
  const invoices = [{
    id: '1',
    total: 450000,
    tips: 50000,
    commission: 90000,
    services: [
      { id: 'svc-a', price: 400000, commissionAmount: 40000, commissionPercent: 10 },
    ],
  }]
  const summary = computeReportSummary(invoices)
  assert.equal(summary.tips, 50000)
  assert.equal(summary.commission, 40000)
})

test('salary: support employee gets 50% commission, no tips', () => {
  const invoice = {
    id: 'inv-1',
    date: '2026-07-05',
    branchId: 'soc-trang',
    branchName: 'Sóc Trăng',
    employeeId: 'emp-main',
    employeeName: 'Main',
    supportEmployeeId: 'emp-support',
    supportEmployeeName: 'Support',
    tips: 100000,
    services: [
      { id: 'svc-a', name: 'DV', price: 300000, commissionPercent: 20, commissionAmount: 60000 },
    ],
    serviceTotal: 300000,
    total: 400000,
  }

  const report = computeSalaryReport([invoice], {
    month: '2026-07',
    cycle: PAY_CYCLES.PERIOD_1,
    branchId: '',
    employeeId: '',
  })

  const main = report.employees.find((e) => e.employeeId === 'emp-main')
  const support = report.employees.find((e) => e.employeeId === 'emp-support')
  assert.ok(main)
  assert.ok(support)
  assert.equal(main.summary.serviceCommission, 60000)
  assert.equal(main.summary.tips, 100000)
  assert.equal(main.summary.totalSalary, 160000)
  assert.equal(support.summary.serviceCommission, Math.round(60000 * SUPPORT_EMPLOYEE_COMMISSION_RATE))
  assert.equal(support.summary.tips, 0)
})

test('pay period ranges', () => {
  const p1 = getPayPeriodRange('2026-07', PAY_CYCLES.PERIOD_1)
  assert.equal(p1.fromDate, '2026-07-01')
  assert.equal(p1.toDate, '2026-07-15')
  const p2 = getPayPeriodRange('2026-07', PAY_CYCLES.PERIOD_2)
  assert.equal(p2.fromDate, '2026-07-16')
  assert.equal(p2.toDate, '2026-07-31')
})

test('login: admin credentials', async () => {
  await ensureCredentialsHashed()
  const result = await verifyLogin({ role: ROLES.ADMIN, branch: '', password: 'admin123' })
  assert.equal(result.ok, true)
  assert.equal(result.user.branch, ADMIN_BRANCH)
})

test('session: reject forged localStorage admin', () => {
  localStorage.setItem('spa-manager-current-user', JSON.stringify({ role: ROLES.ADMIN, branch: ADMIN_BRANCH }))
  assert.equal(loadCurrentUser(), null)
})

test('session: valid admin in sessionStorage', () => {
  saveCurrentUser({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  const user = loadCurrentUser()
  assert.equal(user.role, ROLES.ADMIN)
  clearCurrentUser()
})

test('permissions: role access matrix', () => {
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  assert.equal(canAccessInvoicesPage(), true)
  assert.equal(canAccessEmployeesPage(), false)
  assert.equal(canDeleteInvoice(), true)

  setSession({ role: ROLES.BRANCH_MANAGER, branch: 'vinh-long' })
  assert.equal(canAccessInvoicesPage(), true)
  assert.equal(canAccessEmployeesPage(), true)
  assert.equal(canDeleteInvoice(), false)

  setSession({ role: ROLES.EMPLOYEE, branch: 'vinh-long', employeeId: 'vinh-long-linh' })
  assert.equal(canAccessInvoicesPage(), false)
  assert.equal(filterByUserScope([{ branchId: 'vinh-long', employeeId: 'vinh-long-linh' }]).length, 1)
  assert.equal(filterByUserScope([{ branchId: 'vinh-long', employeeId: 'other' }]).length, 0)
  clearCurrentUser()
})

test('invoice storage: save requires permission', () => {
  clearCurrentUser()
  const result = saveInvoice({
    id: 'test-inv',
    branchId: 'vinh-long',
    employeeId: 'x',
    serviceIds: [],
    services: [{ id: 'a', name: 'A', price: 100000, commissionPercent: 10, commissionAmount: 10000 }],
    tips: 0,
    total: 100000,
    serviceTotal: 100000,
    commission: 10000,
    date: '2026-07-05',
  })
  assert.equal(result.success, false)
})

test('invoice storage: branch manager can save scoped invoice', () => {
  setSession({ role: ROLES.BRANCH_MANAGER, branch: 'vinh-long' })
  localStorage.setItem('spa-manager-invoices', JSON.stringify([]))
  const result = saveInvoice({
    id: 'test-inv-2',
    branchId: 'vinh-long',
    employeeId: 'vinh-long-linh',
    serviceIds: ['svc'],
    services: [{ id: 'svc', name: 'DV', price: 150000, commissionPercent: 10, commissionAmount: 15000 }],
    tips: 20000,
    total: 170000,
    serviceTotal: 150000,
    commission: 35000,
    date: '2026-07-05',
    createdAt: new Date().toISOString(),
  })
  assert.equal(result.success, true)
  assert.equal(loadInvoices().length, 1)
  clearCurrentUser()
})

test('import validation rejects invalid payload', () => {
  assert.equal(validateImportPayload(null).ok, false)
  assert.equal(validateImportPayload({ invoices: [] }).ok, false)
  assert.equal(validateImportPayload({ invoices: [], expenses: [] }).ok, true)
})

test('service commission helper consistency', () => {
  const services = [
    { commissionAmount: 20000 },
    { commissionAmount: 30000 },
  ]
  assert.equal(calculateServiceCommissionFromDetails(services), 50000)
})

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
