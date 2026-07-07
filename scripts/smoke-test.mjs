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
    get length() {
      return store.size
    },
    key(index) {
      return [...store.keys()][index] ?? null
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
const { computeSalaryReport, computeAdminEmployeeReports, computeEmployeeDailyReports, getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { verifyLogin, ADMIN_BRANCH } = await import('../src/constants/loginCredentials.js')
const { getActiveBranches, syncMissingDefaultBranches, BRANCH_STATUS } = await import('../src/utils/branchStorage.js')
const { PRICE_GROUP_IDS } = await import('../src/constants/priceGroupIds.js')
const { ROLES } = await import('../src/constants/auth.js')
const { saveCurrentUser, loadCurrentUser, clearCurrentUser } = await import('../src/utils/authStorage.js')
const {
  canAccessEmployeesPage,
  canAccessInvoicesPage,
  canAddInvoice,
  canDeleteInvoice,
  canEditInvoice,
  canViewEmployeeAvatar,
  canViewEmployeeBankInfo,
  canViewEmployeeCccd,
  canViewEmployeeCurrentAddress,
  canViewEmployeeEmergencyContact,
  canViewEmployeeNote,
  canViewEmployeePersonalInfo,
  filterByUserScope,
} = await import('../src/constants/auth.js')
const { saveInvoice, updateInvoice, deleteInvoice, loadInvoices } = await import('../src/utils/invoiceStorage.js')
const {
  getEmployeeById,
  getEmployeeProfileStatus,
  isEmployeeProfileComplete,
  transferEmployee,
  updateEmployee,
  updateOwnEmployeeProfile,
} = await import('../src/utils/employeeStorage.js')
const { getEmployeeLifetimeStats } = await import('../src/utils/employeeStats.js')
const { redactEmployeeForViewer } = await import('../src/utils/employeeVisibility.js')
const { isValidCccd, isValidVietnamesePhone } = await import('../src/utils/validators.js')
const { ensureCredentialsHashed, verifyBranchPassword } = await import('../src/utils/credentialsStorage.js')
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

test('admin employee report: summary and daily breakdown', () => {
  const invoices = [
    {
      id: 'inv-1',
      date: '2026-07-05',
      branchId: 'soc-trang',
      branchName: 'Sóc Trăng',
      employeeId: 'emp-main',
      employeeName: 'Main',
      tips: 50000,
      services: [
        { id: 'svc-a', name: 'Massage', price: 200000, commissionPercent: 20, commissionAmount: 40000 },
      ],
      serviceTotal: 200000,
      total: 250000,
    },
    {
      id: 'inv-2',
      date: '2026-07-10',
      branchId: 'soc-trang',
      branchName: 'Sóc Trăng',
      employeeId: 'emp-main',
      employeeName: 'Main',
      tips: 30000,
      services: [
        { id: 'svc-a', name: 'Massage', price: 200000, commissionPercent: 20, commissionAmount: 40000 },
        { id: 'svc-b', name: 'Facial', price: 150000, commissionPercent: 10, commissionAmount: 15000 },
      ],
      serviceTotal: 350000,
      total: 380000,
    },
  ]

  const filters = {
    fromDate: '2026-07-01',
    toDate: '2026-07-15',
    branchId: '',
    employeeId: '',
    cycle: PAY_CYCLES.PERIOD_1,
  }

  const summary = computeAdminEmployeeReports(invoices, filters)
  assert.equal(summary.employees.length, 1)
  assert.equal(summary.employees[0].invoiceCount, 2)
  assert.equal(summary.employees[0].serviceCount, 3)
  assert.equal(summary.employees[0].serviceRevenue, 550000)
  assert.equal(summary.employees[0].tips, 80000)
  assert.equal(summary.employees[0].serviceCommission, 95000)
  assert.equal(summary.employees[0].totalSalary, 175000)
  assert.equal(summary.periodTotals.totalSalary, 175000)

  const daily = computeEmployeeDailyReports(invoices, 'emp-main', filters)
  assert.equal(daily.days.length, 2)
  assert.equal(daily.days[0].date, '2026-07-05')
  assert.equal(daily.days[0].invoiceCount, 1)
  assert.equal(daily.days[0].services[0].quantity, 1)
  assert.equal(daily.days[1].invoiceCount, 1)
  assert.equal(daily.days[1].services.length, 2)
  assert.equal(daily.periodTotals.totalSalary, 175000)
})

test('admin employee report: empty period', () => {
  const summary = computeAdminEmployeeReports([], {
    fromDate: '2026-07-01',
    toDate: '2026-07-15',
    branchId: '',
    employeeId: '',
    cycle: PAY_CYCLES.PERIOD_1,
  })
  assert.equal(summary.employees.length, 0)
  assert.equal(summary.periodTotals.totalSalary, 0)
})

test('invoice filters: date, branch, employee, service, payment, search', async () => {
  const {
    filterInvoices,
    computeInvoiceListTotals,
    paginateInvoices,
    sortInvoicesDesc,
  } = await import('../src/utils/invoiceFilters.js')

  const invoices = [
    {
      id: '1',
      date: '2026-07-05',
      branchId: 'soc-trang',
      employeeId: 'emp-1',
      customerName: 'An',
      customerPhone: '0901234567',
      paymentMethod: 'cash',
      serviceIds: ['svc-a'],
      services: [{ id: 'svc-a', name: 'Massage', price: 200000, commissionAmount: 40000 }],
      tips: 10000,
      total: 210000,
      commission: 50000,
      createdAt: '2026-07-05T10:00:00.000Z',
    },
    {
      id: '2',
      date: '2026-07-10',
      branchId: 'gia-lai-1',
      employeeId: 'emp-2',
      customerName: 'Binh',
      customerPhone: '0912345678',
      paymentMethod: 'transfer',
      serviceIds: ['svc-b'],
      services: [{ id: 'svc-b', name: 'Facial', price: 150000, commissionAmount: 15000 }],
      tips: 0,
      total: 150000,
      commission: 15000,
      createdAt: '2026-07-10T12:00:00.000Z',
    },
  ]

  const filtered = filterInvoices(invoices, {
    fromDate: '2026-07-01',
    toDate: '2026-07-08',
    branchId: 'soc-trang',
    employeeId: 'emp-1',
    serviceId: 'svc-a',
    paymentMethod: 'cash',
    search: '0901',
  })
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].id, '1')

  const sorted = sortInvoicesDesc(invoices)
  assert.equal(sorted[0].id, '2')

  const totals = computeInvoiceListTotals(filtered)
  assert.equal(totals.count, 1)
  assert.equal(totals.revenue, 210000)

  const page = paginateInvoices(sorted, 1, 1)
  assert.equal(page.items.length, 1)
  assert.equal(page.totalPages, 2)
})

test('login: admin credentials', async () => {
  await ensureCredentialsHashed()
  const result = await verifyLogin({ role: ROLES.ADMIN, branch: '', password: 'admin123' })
  assert.equal(result.ok, true)
  assert.equal(result.user.branch, ADMIN_BRANCH)
})

test('branches: Gia Lai 1 và Gia Lai 2 tồn tại với đúng nhóm bảng giá', () => {
  const active = getActiveBranches()
  const giaLai1 = active.find((b) => b.id === 'gia-lai-1')
  const giaLai2 = active.find((b) => b.id === 'gia-lai-2')

  assert.ok(giaLai1, 'Phải có chi nhánh Gia Lai 1')
  assert.equal(giaLai1.name, 'Gia Lai 1')
  assert.equal(giaLai1.status, BRANCH_STATUS.ACTIVE)
  assert.equal(giaLai1.priceGroupId, PRICE_GROUP_IDS.STANDARD, 'Gia Lai 1 phải dùng nhóm bảng giá Khoẻ Spa')

  assert.ok(giaLai2, 'Phải có chi nhánh Gia Lai 2')
  assert.equal(giaLai2.name, 'Gia Lai 2')
  assert.equal(giaLai2.status, BRANCH_STATUS.ACTIVE)
  assert.equal(giaLai2.priceGroupId, PRICE_GROUP_IDS.STANDARD, 'Gia Lai 2 phải dùng nhóm bảng giá Khoẻ Spa')
})

test('branches: mật khẩu mặc định đăng nhập Quản lý chi nhánh Gia Lai 1/2', async () => {
  await ensureCredentialsHashed()
  assert.equal(await verifyBranchPassword('gia-lai-1', 'khoespagialai1'), true)
  assert.equal(await verifyBranchPassword('gia-lai-2', 'khoespagialai2'), true)
  assert.equal(await verifyBranchPassword('gia-lai-1', 'saipass'), false)

  const login1 = await verifyLogin({ role: ROLES.BRANCH_MANAGER, branch: 'gia-lai-1', password: 'khoespagialai1' })
  assert.equal(login1.ok, true)
  assert.equal(login1.user.branch, 'gia-lai-1')

  const login2 = await verifyLogin({ role: ROLES.BRANCH_MANAGER, branch: 'gia-lai-2', password: 'khoespagialai2' })
  assert.equal(login2.ok, true)
  assert.equal(login2.user.branch, 'gia-lai-2')
})

test('branches: đồng bộ chi nhánh mặc định không làm mất chi nhánh cũ / dữ liệu tuỳ chỉnh', () => {
  // Giả lập người dùng cũ: localStorage chỉ có các chi nhánh cũ (chưa có Gia Lai),
  // và một chi nhánh đã có tuỳ chỉnh riêng (đổi tên, khoá...).
  const legacyBranches = [
    { id: 'vinh-long', name: 'Vĩnh Long (đã đổi tên)', status: BRANCH_STATUS.LOCKED, priceGroupId: PRICE_GROUP_IDS.STANDARD, supportEnabled: false },
    { id: 'tra-vinh', name: 'Trà Vinh', status: BRANCH_STATUS.ACTIVE, priceGroupId: PRICE_GROUP_IDS.STANDARD, supportEnabled: false },
  ]
  localStorage.setItem('spa-manager-branches', JSON.stringify(legacyBranches))

  const merged = syncMissingDefaultBranches()

  const vinhLong = merged.find((b) => b.id === 'vinh-long')
  assert.equal(vinhLong.name, 'Vĩnh Long (đã đổi tên)', 'Không được ghi đè dữ liệu chi nhánh cũ đã tuỳ chỉnh')
  assert.equal(vinhLong.status, BRANCH_STATUS.LOCKED, 'Không được đổi trạng thái chi nhánh cũ')

  assert.equal(merged.length, 8, 'Phải giữ 2 chi nhánh cũ + bổ sung đủ chi nhánh mặc định còn thiếu')
  assert.ok(merged.some((b) => b.id === 'gia-lai-1'), 'Phải tự bổ sung Gia Lai 1 cho người dùng cũ')
  assert.ok(merged.some((b) => b.id === 'gia-lai-2'), 'Phải tự bổ sung Gia Lai 2 cho người dùng cũ')
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
  assert.equal(canEditInvoice({ id: 'any-invoice' }), true, 'Admin luôn được sửa hóa đơn')
  localStorage.setItem(
    'spa-manager-permissions',
    JSON.stringify({ editInvoice: [], deleteInvoice: [] }),
  )
  assert.equal(canEditInvoice({ id: 'any-invoice' }), true, 'Admin không phụ thuộc ma trận phân quyền')
  assert.equal(canDeleteInvoice(), true, 'Admin luôn được xóa hóa đơn')

  setSession({ role: ROLES.BRANCH_MANAGER, branch: 'vinh-long' })
  assert.equal(canAccessInvoicesPage(), true)
  assert.equal(canAccessEmployeesPage(), true)
  assert.equal(canDeleteInvoice(), false)
  assert.equal(canEditInvoice({ id: 'any' }), false, 'QL chi nhánh chỉ xem, không sửa hóa đơn đã lưu')

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

test('invoice storage: admin sửa và xóa mọi hóa đơn', () => {
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  localStorage.setItem('spa-manager-invoices', JSON.stringify([]))
  saveInvoice({
    id: 'admin-inv-1',
    branchId: 'vinh-long',
    branchName: 'Vĩnh Long',
    employeeId: 'vinh-long-linh',
    employeeName: 'Linh',
    serviceIds: ['svc'],
    services: [{ id: 'svc', name: 'DV', price: 150000, commissionPercent: 10, commissionAmount: 15000 }],
    tips: 0,
    total: 150000,
    serviceTotal: 150000,
    commission: 15000,
    date: '2026-07-05',
    invoiceTime: '14:30',
    customerPhone: '0901111111',
    createdAt: new Date().toISOString(),
  })

  const updated = updateInvoice('admin-inv-1', {
    branchId: 'tra-vinh',
    branchName: 'Trà Vinh',
    employeeId: 'tra-vinh-mai-nhi',
    employeeName: 'Mai Nhi',
    customerName: 'Khách VIP',
    customerPhone: '0902222222',
    invoiceTime: '16:45',
    tips: 50000,
    total: 200000,
    serviceTotal: 150000,
    commission: 65000,
  })
  assert.equal(updated.success, true)
  assert.equal(updated.invoice.branchId, 'tra-vinh')
  assert.equal(updated.invoice.customerPhone, '0902222222')

  const deleted = deleteInvoice('admin-inv-1')
  assert.equal(deleted.success, true)
  assert.equal(loadInvoices().length, 0)
  clearCurrentUser()
})

test('invoice storage: quản lý chi nhánh không xóa hoặc sửa hóa đơn đã lưu', () => {
  setSession({ role: ROLES.BRANCH_MANAGER, branch: 'vinh-long' })
  localStorage.setItem('spa-manager-invoices', JSON.stringify([]))
  saveInvoice({
    id: 'manager-inv-1',
    branchId: 'vinh-long',
    branchName: 'Vĩnh Long',
    employeeId: 'vinh-long-linh',
    employeeName: 'Linh',
    serviceIds: ['svc'],
    services: [{ id: 'svc', name: 'DV', price: 150000, commissionPercent: 10, commissionAmount: 15000 }],
    tips: 0,
    total: 150000,
    serviceTotal: 150000,
    commission: 15000,
    date: '2026-07-05',
    createdAt: new Date().toISOString(),
  })

  assert.equal(updateInvoice('manager-inv-1', { customerName: 'Hack' }).success, false)
  assert.equal(deleteInvoice('manager-inv-1').success, false)
  assert.equal(loadInvoices().length, 1)
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

test('employee self profile: CCCD/avatar images persist as base64 through save + reload', () => {
  setSession({ role: ROLES.EMPLOYEE, branch: 'vinh-long', employeeId: 'vinh-long-linh' })
  const fakeBase64Front = 'data:image/jpeg;base64,frontimagedata=='
  const fakeBase64Back = 'data:image/jpeg;base64,backimagedata=='
  const fakeAvatar = 'data:image/jpeg;base64,avatarimagedata=='

  const result = updateOwnEmployeeProfile('vinh-long-linh', {
    name: 'Linh',
    phone: '0901234567',
    cccd: '079123456789',
    avatar: fakeAvatar,
    cccdFrontImage: fakeBase64Front,
    cccdBackImage: fakeBase64Back,
  })
  assert.equal(result.success, true)
  assert.equal(result.employee.avatar, fakeAvatar)
  assert.equal(result.employee.cccdFrontImage, fakeBase64Front)
  assert.equal(result.employee.cccdBackImage, fakeBase64Back)

  // Giả lập "refresh trang": đọc lại từ localStorage bằng một lần load mới.
  const reloaded = getEmployeeById('vinh-long-linh')
  assert.equal(reloaded.avatar, fakeAvatar, 'Ảnh đại diện phải còn sau khi tải lại')
  assert.equal(reloaded.cccdFrontImage, fakeBase64Front, 'Ảnh CCCD mặt trước phải còn sau khi tải lại')
  assert.equal(reloaded.cccdBackImage, fakeBase64Back, 'Ảnh CCCD mặt sau phải còn sau khi tải lại')
  clearCurrentUser()
})

test('employee self profile: storage quota errors are returned gracefully, not thrown', () => {
  setSession({ role: ROLES.EMPLOYEE, branch: 'vinh-long', employeeId: 'vinh-long-linh' })
  const originalSetItem = localStorage.setItem.bind(localStorage)
  localStorage.setItem = () => {
    const error = new Error('Quota exceeded')
    error.name = 'QuotaExceededError'
    throw error
  }

  let threw = false
  let result
  try {
    result = updateOwnEmployeeProfile('vinh-long-linh', {
      name: 'Linh',
      phone: '0901234567',
      cccd: '079123456789',
      avatar: 'data:image/jpeg;base64,huge==',
    })
  } catch {
    threw = true
  } finally {
    localStorage.setItem = originalSetItem
  }

  assert.equal(threw, false, 'Lỗi vượt hạn mức localStorage không được làm crash ứng dụng')
  assert.equal(result.success, false)
  assert.ok(result.error?.length > 0, 'Phải có thông báo lỗi rõ ràng cho người dùng')
  clearCurrentUser()
})

test('employee profile permissions: manager cannot view sensitive info, admin sees all', () => {
  setSession({ role: ROLES.BRANCH_MANAGER, branch: 'vinh-long' })
  assert.equal(canViewEmployeeCccd(), false)
  assert.equal(canViewEmployeeCurrentAddress(), false)
  assert.equal(canViewEmployeeBankInfo(), false)
  assert.equal(canViewEmployeeEmergencyContact(), false)
  assert.equal(canViewEmployeeNote(), false)
  assert.equal(canViewEmployeePersonalInfo(), false)
  assert.equal(canViewEmployeeAvatar(), false, 'Quản lý không được xem ảnh chân dung')
  clearCurrentUser()

  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  assert.equal(canViewEmployeeCccd(), true)
  assert.equal(canViewEmployeeCurrentAddress(), true)
  assert.equal(canViewEmployeeBankInfo(), true)
  assert.equal(canViewEmployeeEmergencyContact(), true)
  assert.equal(canViewEmployeeNote(), true)
  assert.equal(canViewEmployeePersonalInfo(), true)
  assert.equal(canViewEmployeeAvatar(), true)
  clearCurrentUser()
})

test('redactEmployeeForViewer: manager gets no sensitive fields, admin gets all', () => {
  const employee = {
    id: 'emp-x',
    name: 'Nguyễn Văn A',
    phone: '0901234567',
    email: 'a@example.com',
    gender: 'male',
    dateOfBirth: '1990-01-01',
    cccd: '079123456789',
    cccdIssueDate: '2020-01-01',
    cccdIssuePlace: 'CA Vĩnh Long',
    cccdAddress: 'Địa chỉ CCCD',
    cccdFrontImage: 'data:front',
    cccdBackImage: 'data:back',
    currentAddress: 'Địa chỉ hiện tại',
    bankName: 'Vietcombank',
    bankAccountHolder: 'Nguyen Van A',
    bankAccount: '00110022',
    emergencyContactName: 'Chị gái',
    emergencyContactPhone: '0909876543',
    note: 'Ghi chú nhạy cảm',
    avatar: 'data:avatar',
    position: 'Lễ tân',
    status: 'active',
  }

  setSession({ role: ROLES.BRANCH_MANAGER, branch: 'vinh-long' })
  const managerView = redactEmployeeForViewer(employee)
  for (const field of [
    'cccd', 'cccdIssueDate', 'cccdIssuePlace', 'cccdAddress', 'cccdFrontImage', 'cccdBackImage',
    'currentAddress', 'bankName', 'bankAccountHolder', 'bankAccount',
    'emergencyContactName', 'emergencyContactPhone', 'note', 'email', 'gender', 'dateOfBirth', 'avatar',
  ]) {
    assert.equal(field in managerView, false, `Quản lý không được nhận trường: ${field}`)
  }
  assert.equal(managerView.name, employee.name)
  assert.equal(managerView.phone, employee.phone)
  assert.equal(managerView.position, employee.position)
  clearCurrentUser()

  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  const adminView = redactEmployeeForViewer(employee)
  assert.equal(adminView.cccd, employee.cccd)
  assert.equal(adminView.bankAccount, employee.bankAccount)
  assert.equal(adminView.avatar, employee.avatar)
  clearCurrentUser()
})

test('redactEmployeeForViewer + updateEmployee: manager editing does not wipe hidden fields', () => {
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  updateEmployee('vinh-long-linh', {
    cccd: '079999999999',
    bankName: 'ACB',
    bankAccount: '123123123',
    currentAddress: 'Địa chỉ gốc',
  })
  clearCurrentUser()

  setSession({ role: ROLES.BRANCH_MANAGER, branch: 'vinh-long' })
  const redactedForm = redactEmployeeForViewer(getEmployeeById('vinh-long-linh'))
  const payload = { ...redactedForm, position: 'KTV Body cấp cao' }
  const result = updateEmployee('vinh-long-linh', payload)
  assert.equal(result.success, true)
  assert.equal(result.employee.position, 'KTV Body cấp cao')
  assert.equal(result.employee.cccd, '079999999999', 'CCCD không bị mất khi Quản lý sửa hồ sơ')
  assert.equal(result.employee.bankName, 'ACB')
  assert.equal(result.employee.bankAccount, '123123123')
  assert.equal(result.employee.currentAddress, 'Địa chỉ gốc')
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

test('getEmployeeProfileStatus: ưu tiên CCCD > ngân hàng > thiếu thông tin > đầy đủ', () => {
  const base = {
    name: 'Test',
    phone: '0901234567',
    email: 'a@b.com',
    dateOfBirth: '1990-01-01',
    gender: 'male',
    currentAddress: 'Đ/c hiện tại',
    position: 'KTV',
    startDate: '2024-01-01',
    emergencyContactName: 'X',
    emergencyContactPhone: '0909999999',
    cccdIssueDate: '2020-01-01',
    cccdIssuePlace: 'CA',
    cccdAddress: 'Đ/c CCCD',
    bankName: 'ACB',
    bankAccountHolder: 'Test',
  }

  assert.equal(getEmployeeProfileStatus({ ...base, cccd: '', bankAccount: '123' }).key, 'missing_cccd')
  assert.equal(getEmployeeProfileStatus({ ...base, cccd: '079123456789', bankAccount: '' }).key, 'missing_bank')
  assert.equal(
    getEmployeeProfileStatus({ ...base, cccd: '079123456789', bankAccount: '123', email: '' }).key,
    'incomplete',
  )
  assert.equal(
    getEmployeeProfileStatus({ ...base, cccd: '079123456789', bankAccount: '123' }).key,
    'complete',
  )
})

test('transferEmployee: ghi lịch sử chi nhánh, không mất dữ liệu hồ sơ cũ', () => {
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  const before = getEmployeeById('vinh-long-linh')
  assert.equal(before.branchHistory.length, 0)

  const result = transferEmployee('vinh-long-linh', 'tra-vinh')
  assert.equal(result.success, true)
  assert.equal(result.employee.branchId, 'tra-vinh')
  assert.equal(result.employee.branchHistory.length, 1)
  assert.equal(result.employee.branchHistory[0].branchId, 'vinh-long')
  assert.equal(result.employee.name, before.name, 'Không mất dữ liệu hồ sơ khi chuyển chi nhánh')
  assert.equal(result.employee.cccd, before.cccd)
  clearCurrentUser()
})

test('getEmployeeLifetimeStats: tổng hợp doanh thu/tour/tips/hoa hồng/lương trọn đời', () => {
  setSession({ role: ROLES.BRANCH_MANAGER, branch: 'vinh-long' })
  localStorage.setItem('spa-manager-invoices', JSON.stringify([]))
  saveInvoice({
    id: 'stats-inv-1',
    branchId: 'vinh-long',
    employeeId: 'vinh-long-linh',
    serviceIds: ['svc'],
    services: [{ id: 'svc', name: 'DV', price: 150000, commissionPercent: 10, commissionAmount: 15000 }],
    tips: 20000,
    total: 185000,
    serviceTotal: 150000,
    commission: 15000,
    date: '2026-07-01',
    createdAt: new Date().toISOString(),
  })
  saveInvoice({
    id: 'stats-inv-2',
    branchId: 'vinh-long',
    employeeId: 'vinh-long-linh',
    serviceIds: ['svc2'],
    services: [{ id: 'svc2', name: 'DV2', price: 100000, commissionPercent: 10, commissionAmount: 10000 }],
    tips: 0,
    total: 100000,
    serviceTotal: 100000,
    commission: 10000,
    date: '2026-07-02',
    createdAt: new Date().toISOString(),
  })
  clearCurrentUser()

  const stats = getEmployeeLifetimeStats('vinh-long-linh')
  assert.equal(stats.invoiceCount, 2)
  assert.equal(stats.serviceCount, 2)
  assert.equal(stats.revenue, 250000)
  assert.equal(stats.tips, 20000)
  assert.equal(stats.commission, 25000)
  assert.equal(stats.totalSalary, 45000)
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

async function testAsync(name, fn) {
  try {
    resetStorage()
    await fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✗ ${name}`)
    console.error(`    ${error.message}`)
  }
}

const { isSupabaseConfigured: supabaseConfigured, supabase: supabaseClientInstance } = await import(
  '../src/lib/supabaseClient.js'
)
const { camelToSnakeKey, snakeToCamelKey, objectToSnakeRow, rowToCamel } = await import(
  '../src/repositories/caseUtils.js'
)
const {
  pullAllFromSupabase,
  pushLocalToSupabase,
  autoMigrateIfNeeded,
  runInitialSync,
  startAutoSync,
  stopAutoSync,
  subscribeToDataSync,
} = await import('../src/utils/supabaseSync.js')

await testAsync('supabaseClient: không có biến môi trường -> fallback LocalStorage, không lỗi', async () => {
  assert.equal(supabaseConfigured, false, 'isSupabaseConfigured phải là false khi thiếu env')
  assert.equal(supabaseClientInstance, null, 'supabase client phải là null khi chưa cấu hình')
})

await testAsync('supabaseClient: normalizeSupabaseUrl thêm https và từ chối placeholder', async () => {
  const { normalizeSupabaseUrl, normalizeSupabaseAnonKey } = await import('../src/lib/supabaseClient.js')
  assert.equal(normalizeSupabaseUrl('abcd1234.supabase.co'), 'https://abcd1234.supabase.co')
  assert.equal(normalizeSupabaseUrl('https://abcd1234.supabase.co/'), 'https://abcd1234.supabase.co')
  assert.equal(normalizeSupabaseUrl('abcd1234567890'), 'https://abcd1234567890.supabase.co')
  assert.equal(normalizeSupabaseUrl('URL_THẬT_CỦA_SUPABASE'), '')
  assert.equal(normalizeSupabaseAnonKey('KEY_THẬT_BẮT_ĐẦU_BẰNG_sb_publishable'), '')
  assert.equal(normalizeSupabaseAnonKey('sb_publishable_...'), '')
  assert.equal(normalizeSupabaseAnonKey('x'.repeat(39)), '')
  assert.equal(normalizeSupabaseAnonKey('x'.repeat(40)), 'x'.repeat(40))
})

await testAsync('caseUtils: chuyển đổi camelCase <-> snake_case hai chiều', async () => {
  assert.equal(camelToSnakeKey('branchId'), 'branch_id')
  assert.equal(camelToSnakeKey('cccdFrontImage'), 'cccd_front_image')
  assert.equal(snakeToCamelKey('branch_id'), 'branchId')
  assert.equal(snakeToCamelKey('cccd_front_image'), 'cccdFrontImage')

  const original = { branchId: 'vinh-long', cccdFrontImage: 'data:...', name: 'Linh' }
  const row = objectToSnakeRow(original)
  assert.equal(row.branch_id, 'vinh-long')
  assert.equal(row.cccd_front_image, 'data:...')
  const roundTrip = rowToCamel(row)
  assert.deepEqual(roundTrip, original)
})

await testAsync(
  'supabaseSync: pull/push/migrate trả về not_configured khi chưa cấu hình, không throw lỗi',
  async () => {
    const pullResult = await pullAllFromSupabase()
    assert.equal(pullResult.success, false)
    assert.equal(pullResult.reason, 'not_configured')

    const pushResult = await pushLocalToSupabase()
    assert.equal(pushResult.success, false)
    assert.equal(pushResult.reason, 'not_configured')

    const migrateResult = await autoMigrateIfNeeded()
    assert.equal(migrateResult.success, false)
    assert.equal(migrateResult.reason, 'not_configured')
  },
)

await testAsync(
  'supabaseSync: startAutoSync/subscribeToDataSync an toàn khi chưa cấu hình (no-op)',
  async () => {
    const unsubscribe = subscribeToDataSync(() => {})
    assert.equal(typeof unsubscribe, 'function')
    unsubscribe()

    const stop = startAutoSync()
    assert.equal(typeof stop, 'function')
    stop()
    // Gọi lại nhiều lần không được lỗi (idempotent).
    stopAutoSync()
    stopAutoSync()
  },
)

await testAsync('supabaseSync: runInitialSync trả về not_configured khi chưa cấu hình', async () => {
  const result = await runInitialSync({ timeoutMs: 500 })
  assert.equal(result.success, false)
  assert.equal(result.reason, 'not_configured')
})

const {
  scopeLegacySnapshot,
  checkLegacyData,
} = await import('../src/utils/legacyCloudSync.js')
const {
  scanLocalStorageForLegacyData,
  buildInvoiceFingerprint,
} = await import('../src/utils/legacyStorageScanner.js')

await test('legacyCloudSync: scope theo vai trò admin / QL / NV', () => {
  const snapshot = {
    branches: [{ id: 'b1' }],
    services: [{ id: 's1' }],
    branchPricing: { 'vinh-long': { useCustom: true, overrides: {} } },
    employees: [
      { id: 'e1', branchId: 'vinh-long' },
      { id: 'e2', branchId: 'tra-vinh' },
    ],
    invoices: [
      { id: 'i1', branchId: 'vinh-long', employeeId: 'e1' },
      { id: 'i2', branchId: 'tra-vinh', employeeId: 'e2' },
    ],
    expenses: [
      { id: 'x1', branchId: 'vinh-long' },
      { id: 'x2', branchId: 'tra-vinh' },
    ],
  }

  const adminScope = scopeLegacySnapshot(snapshot, { role: 'admin', branch: 'all' })
  assert.equal(adminScope.invoices.length, 2)
  assert.equal(adminScope.includeAuth, true)

  const managerScope = scopeLegacySnapshot(snapshot, { role: 'branch_manager', branch: 'vinh-long' })
  assert.equal(managerScope.invoices.length, 1)
  assert.equal(managerScope.employees.length, 1)
  assert.equal(managerScope.includeAuth, false)

  const employeeScope = scopeLegacySnapshot(snapshot, {
    role: 'employee',
    branch: 'vinh-long',
    employeeId: 'e1',
  })
  assert.equal(employeeScope.invoices.length, 1)
  assert.equal(employeeScope.employees.length, 1)
})

await test('legacyStorageScanner: quét key tour cũ và tạo fingerprint hóa đơn', () => {
  localStorage.setItem(
    'old-spa-tours',
    JSON.stringify([
      {
        date: '2026-01-01',
        branch_id: 'vinh-long',
        employee_id: 'emp-a',
        service_total: 100000,
        tip: 5000,
        customer_name: 'Test',
        services: [{ id: 's1', name: 'Body', price: 100000 }],
      },
    ]),
  )
  const scan = scanLocalStorageForLegacyData()
  assert.ok(scan.counts.invoices >= 1, `Phải nhận diện tour là invoice, got ${scan.counts.invoices}`)
  const fp = buildInvoiceFingerprint({
    date: '2026-01-01',
    branchId: 'vinh-long',
    employeeId: 'emp-a',
    total: 100000,
    tips: 5000,
    customerName: 'Test',
    services: [{ id: 's1' }],
  })
  assert.ok(fp.startsWith('legacy-inv-'))
  localStorage.removeItem('old-spa-tours')
})

await test('legacyCloudSync: checkLegacyData trả về counts theo phạm vi admin', () => {
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  localStorage.setItem(
    'spa-manager-invoices',
    JSON.stringify([
      {
        id: 'inv-check-1',
        date: '2026-01-02',
        branchId: 'vinh-long',
        employeeId: 'e1',
        total: 150000,
        serviceTotal: 150000,
        services: [{ id: 's1', name: 'Body', price: 150000 }],
      },
    ]),
  )
  const check = checkLegacyData({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  assert.equal(check.hasLegacyData, true)
  assert.ok(check.scopedCounts.invoices >= 1)
  clearCurrentUser()
})

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
