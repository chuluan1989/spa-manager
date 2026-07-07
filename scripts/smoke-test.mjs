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
const { computeReportSummary, computeReportData } = await import('../src/utils/report.js')
const { computeSalaryReport, getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { verifyLogin, ADMIN_BRANCH } = await import('../src/constants/loginCredentials.js')
const { ROLES } = await import('../src/constants/auth.js')
const { saveCurrentUser, loadCurrentUser, clearCurrentUser } = await import('../src/utils/authStorage.js')
const {
  canAccessEmployeesPage,
  canAccessInvoicesPage,
  canAddInvoice,
  canDeleteInvoice,
  canEditInvoice,
  canViewEmployeeBankInfo,
  canViewEmployeeCccd,
  canViewEmployeeCurrentAddress,
  canViewEmployeeEmergencyContact,
  filterByUserScope,
} = await import('../src/constants/auth.js')
const { saveInvoice, updateInvoice, loadInvoices } = await import('../src/utils/invoiceStorage.js')
const {
  getEmployeeById,
  isEmployeeProfileComplete,
  updateEmployee,
  updateOwnEmployeeProfile,
} = await import('../src/utils/employeeStorage.js')
const { isValidCccd, isValidVietnamesePhone } = await import('../src/utils/validators.js')
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
  assert.equal(canAccessInvoicesPage(), true)
  assert.equal(canAddInvoice(), true)
  assert.equal(canDeleteInvoice(), false)
  assert.equal(
    canEditInvoice({ employeeId: 'vinh-long-linh' }),
    true,
    'employee sửa được hóa đơn do chính mình tạo',
  )
  assert.equal(
    canEditInvoice({ employeeId: 'other-employee' }),
    false,
    'employee không được sửa hóa đơn của nhân viên khác',
  )
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

test('invoice storage: employee create is forced to own branch/employee', () => {
  setSession({ role: ROLES.EMPLOYEE, branch: 'vinh-long', employeeId: 'vinh-long-linh' })
  localStorage.setItem('spa-manager-invoices', JSON.stringify([]))
  const result = saveInvoice({
    id: 'test-inv-employee',
    branchId: 'tra-vinh',
    branchName: 'Trà Vinh',
    employeeId: 'someone-else',
    employeeName: 'Someone Else',
    supportEmployeeId: 'support-x',
    supportEmployeeName: 'Support X',
    serviceIds: ['svc'],
    services: [{ id: 'svc', name: 'DV', price: 150000, commissionPercent: 10, commissionAmount: 15000 }],
    tips: 0,
    total: 150000,
    serviceTotal: 150000,
    commission: 15000,
    date: '2026-07-05',
    createdAt: new Date().toISOString(),
  })
  assert.equal(result.success, true)
  assert.equal(result.invoice.branchId, 'vinh-long')
  assert.equal(result.invoice.employeeId, 'vinh-long-linh')
  assert.equal(result.invoice.supportEmployeeId, '')
  clearCurrentUser()
})

test('invoice storage: employee cannot edit another employee\'s invoice', () => {
  setSession({ role: ROLES.BRANCH_MANAGER, branch: 'vinh-long' })
  localStorage.setItem('spa-manager-invoices', JSON.stringify([]))
  saveInvoice({
    id: 'inv-owned-by-other',
    branchId: 'vinh-long',
    branchName: 'Vĩnh Long',
    employeeId: 'other-employee',
    employeeName: 'Other',
    serviceIds: ['svc'],
    services: [{ id: 'svc', name: 'DV', price: 150000, commissionPercent: 10, commissionAmount: 15000 }],
    tips: 0,
    total: 150000,
    serviceTotal: 150000,
    commission: 15000,
    date: '2026-07-05',
    createdAt: new Date().toISOString(),
  })
  clearCurrentUser()

  setSession({ role: ROLES.EMPLOYEE, branch: 'vinh-long', employeeId: 'vinh-long-linh' })
  const result = updateInvoice('inv-owned-by-other', { customerName: 'Hack' })
  assert.equal(result.success, false)
  clearCurrentUser()
})

test('invoice storage: employee edit cannot reassign branch/employee via forged data', () => {
  setSession({ role: ROLES.EMPLOYEE, branch: 'vinh-long', employeeId: 'vinh-long-linh' })
  localStorage.setItem('spa-manager-invoices', JSON.stringify([]))
  const created = saveInvoice({
    id: 'inv-own',
    branchId: 'vinh-long',
    employeeId: 'vinh-long-linh',
    serviceIds: ['svc'],
    services: [{ id: 'svc', name: 'DV', price: 150000, commissionPercent: 10, commissionAmount: 15000 }],
    tips: 0,
    total: 150000,
    serviceTotal: 150000,
    commission: 15000,
    date: '2026-07-05',
    createdAt: new Date().toISOString(),
  })
  assert.equal(created.success, true)

  const result = updateInvoice('inv-own', {
    customerName: 'Khách mới',
    branchId: 'tra-vinh',
    employeeId: 'someone-else',
    supportEmployeeId: 'support-x',
  })
  assert.equal(result.success, true)
  assert.equal(result.invoice.customerName, 'Khách mới')
  assert.equal(result.invoice.branchId, 'vinh-long')
  assert.equal(result.invoice.employeeId, 'vinh-long-linh')
  assert.equal(result.invoice.supportEmployeeId, '')
  clearCurrentUser()
})

test('validators: cccd must be exactly 12 digits', () => {
  assert.equal(isValidCccd(''), true, 'CCCD trống vẫn hợp lệ (không bắt buộc)')
  assert.equal(isValidCccd('123456789012'), true)
  assert.equal(isValidCccd('12345'), false)
  assert.equal(isValidCccd('12345678901a'), false)
})

test('validators: phone format', () => {
  assert.equal(isValidVietnamesePhone('0901234567'), true)
  assert.equal(isValidVietnamesePhone('84901234567'), true)
  assert.equal(isValidVietnamesePhone('12345'), false)
  assert.equal(isValidVietnamesePhone(''), false)
})

test('employee profile: incomplete profile requires name, phone and cccd', () => {
  assert.equal(isEmployeeProfileComplete({ name: 'Linh', phone: '', cccd: '' }), false)
  assert.equal(
    isEmployeeProfileComplete({ name: 'Linh', phone: '0901234567', cccd: '' }),
    false,
    'Thiếu CCCD vẫn coi là chưa hoàn tất',
  )
  assert.equal(
    isEmployeeProfileComplete({ name: 'Linh', phone: '0901234567', cccd: '079123456789' }),
    true,
  )
  assert.equal(isEmployeeProfileComplete(null), false)
})

test('employee self profile: employee updates own profile successfully', () => {
  setSession({ role: ROLES.EMPLOYEE, branch: 'vinh-long', employeeId: 'vinh-long-linh' })
  const result = updateOwnEmployeeProfile('vinh-long-linh', {
    name: 'Linh',
    phone: '0901234567',
    cccd: '079123456789',
    bankName: 'Vietcombank',
    bankAccount: '0011002233',
    emergencyContactName: 'Chị gái',
    emergencyContactPhone: '0909876543',
  })
  assert.equal(result.success, true)
  assert.equal(result.employee.phone, '0901234567')
  assert.equal(result.employee.bankName, 'Vietcombank')
  assert.equal(getEmployeeById('vinh-long-linh').cccd, '079123456789')
  clearCurrentUser()
})

test('employee self profile: rejects missing name/phone and invalid cccd', () => {
  setSession({ role: ROLES.EMPLOYEE, branch: 'vinh-long', employeeId: 'vinh-long-linh' })
  const noPhone = updateOwnEmployeeProfile('vinh-long-linh', { name: 'Linh', phone: '' })
  assert.equal(noPhone.success, false)

  const badCccd = updateOwnEmployeeProfile('vinh-long-linh', {
    name: 'Linh',
    phone: '0901234567',
    cccd: '12345',
  })
  assert.equal(badCccd.success, false)

  const missingCccd = updateOwnEmployeeProfile('vinh-long-linh', {
    name: 'Linh',
    phone: '0901234567',
    cccd: '',
  })
  assert.equal(missingCccd.success, false, 'CCCD nay la truong bat buoc')
  clearCurrentUser()
})

test('employee profile permissions: manager cannot view sensitive info, admin sees all', () => {
  setSession({ role: ROLES.BRANCH_MANAGER, branch: 'vinh-long' })
  assert.equal(canViewEmployeeCccd(), false)
  assert.equal(canViewEmployeeCurrentAddress(), false)
  assert.equal(canViewEmployeeBankInfo(), false)
  assert.equal(canViewEmployeeEmergencyContact(), false)
  clearCurrentUser()

  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  assert.equal(canViewEmployeeCccd(), true)
  assert.equal(canViewEmployeeCurrentAddress(), true)
  assert.equal(canViewEmployeeBankInfo(), true)
  assert.equal(canViewEmployeeEmergencyContact(), true)
  clearCurrentUser()
})

test('employee self profile: cannot edit another employee\'s profile', () => {
  setSession({ role: ROLES.EMPLOYEE, branch: 'vinh-long', employeeId: 'vinh-long-linh' })
  const result = updateOwnEmployeeProfile('vinh-long-tho', { name: 'Hack', phone: '0901234567' })
  assert.equal(result.success, false)
  clearCurrentUser()
})

test('employee self profile: cannot change role-managed fields via forged payload', () => {
  setSession({ role: ROLES.EMPLOYEE, branch: 'vinh-long', employeeId: 'vinh-long-linh' })
  const before = getEmployeeById('vinh-long-linh')
  const result = updateOwnEmployeeProfile('vinh-long-linh', {
    name: 'Linh',
    phone: '0901234567',
    cccd: '079123456789',
    branchId: 'tra-vinh',
    position: 'Quản lý',
    status: 'resigned',
    startDate: '2020-01-01',
  })
  assert.equal(result.success, true)
  assert.equal(result.employee.branchId, before.branchId)
  assert.equal(result.employee.position, before.position)
  assert.equal(result.employee.status, before.status)
  assert.equal(result.employee.startDate, before.startDate)
  clearCurrentUser()
})

test('employee self profile: non-employee roles are denied', () => {
  setSession({ role: ROLES.BRANCH_MANAGER, branch: 'vinh-long' })
  const result = updateOwnEmployeeProfile('vinh-long-linh', { name: 'X', phone: '0901234567' })
  assert.equal(result.success, false)
  clearCurrentUser()

  // Admin/Quản lý vẫn sửa được toàn bộ hồ sơ qua updateEmployee như trước.
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  const adminResult = updateEmployee('vinh-long-linh', { position: 'KTV Body' })
  assert.equal(adminResult.success, true)
  assert.equal(adminResult.employee.position, 'KTV Body')
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

test('flat 20% commission: Vĩnh Long Body 60', () => {
  const fallback = [
    { id: 'body-60', name: 'Body 60', price: 189000, commissionPercent: 0 },
  ]
  const totals = calculateInvoiceTotals(['body-60'], 0, 'vinh-long', fallback, 'Vĩnh Long')
  assert.equal(totals.serviceCommission, 37800)
  assert.equal(totals.commission, 37800)
  assert.equal(totals.services[0].commissionPercent, 20)
})

test('flat 20% commission: Trà Vinh Body 90', () => {
  const fallback = [
    { id: 'body-90', name: 'Body 90', price: 249000, commissionPercent: 0 },
  ]
  const totals = calculateInvoiceTotals(['body-90'], 0, 'tra-vinh', fallback, 'Trà Vinh')
  assert.equal(totals.serviceCommission, 49800)
})

test('tips count 100% toward employee pay', () => {
  const fallback = [
    { id: 'body-60', name: 'Body 60', price: 189000, commissionPercent: 20, commissionAmount: 37800 },
  ]
  const totals = calculateInvoiceTotals(['body-60'], 50000, 'vinh-long', fallback, 'Vĩnh Long')
  assert.equal(totals.commission, 87800)
})

test('report profit subtracts commission and tips', () => {
  const invoices = [{
    id: '1',
    branchId: 'vinh-long',
    total: 239000,
    tips: 50000,
    services: [{ id: 'a', price: 189000, commissionAmount: 37800, commissionPercent: 20 }],
  }]
  const summary = computeReportSummary(invoices)
  const report = computeReportData(invoices, [], { fromDate: '', toDate: '', branchId: '', employeeId: '' })
  assert.equal(summary.commission, 37800)
  assert.equal(summary.tips, 50000)
  assert.equal(report.summary.profit, 239000 - 37800 - 50000)
})

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
