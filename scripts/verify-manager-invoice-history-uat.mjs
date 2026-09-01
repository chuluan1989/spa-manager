/**
 * UAT — Quản lý chi nhánh xem hóa đơn lịch sử (không sửa payroll/KPI/commission).
 * Run: npx vite-node scripts/verify-manager-invoice-history-uat.mjs
 */
import assert from 'node:assert/strict'
import './_polyfill-storage.mjs'

const LY_LY = {
  id: 'soc-trang-ly-ly',
  name: 'Ly Ly',
  branchId: 'soc-trang',
  status: 'active',
}
const KIM_QUYEN = {
  id: 'soc-trang-kim-quyen',
  name: 'Kim Quyên',
  branchId: 'soc-trang',
  status: 'active',
}
const THANH_THU = {
  id: 'bac-lieu-thanh-thu',
  name: 'Thanh Thư',
  branchId: 'bac-lieu',
  status: 'active',
}

globalThis.localStorage.setItem(
  'spa-manager-employees',
  JSON.stringify([LY_LY, KIM_QUYEN, THANH_THU]),
)
globalThis.sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'branch_manager',
  branch: 'soc-trang',
}))

const { filterByUserScope, canEditInvoice, canDeleteInvoice } = await import('../src/constants/auth.js')
const { filterInvoices } = await import('../src/utils/invoiceFilters.js')
const {
  buildInvoicePageFetchScope,
  filterInvoicesForManagerHistory,
  invoiceBelongsToManagerHomeBranch,
} = await import('../src/utils/invoiceManagerHistoryScope.js')
const { getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { seedApprovedCloseCache } = await import('../src/utils/payrollCycleClose/approvedCloseLock.js')
const { CLOSE_CYCLE_STATUS } = await import('../src/utils/payrollCycleClose/closeCycleStatus.js')
const { getActiveEmployeesByBranch } = await import('../src/utils/employeeStorage.js')

function inv(partial) {
  return {
    tips: 0,
    serviceTotal: 150_000,
    services: [{
      id: 's1',
      name: 'Cổ Vai Gáy',
      price: 150_000,
      originalPrice: 150_000,
      commissionPercent: 20,
    }],
    serviceIds: ['s1'],
    paymentMethod: 'cash',
    ...partial,
  }
}

const invoices = [
  inv({
    id: 'p1-st-kim',
    date: '2026-08-05',
    branchId: 'soc-trang',
    branchName: 'Sóc Trăng Khoẻ Spa',
    homeBranchId: 'soc-trang',
    employeeId: KIM_QUYEN.id,
    employeeName: KIM_QUYEN.name,
  }),
  inv({
    id: 'p1-ly-tram',
    date: '2026-08-10',
    branchId: 'tram-spa',
    branchName: 'Trạm Spa',
    homeBranchId: 'soc-trang',
    employeeId: LY_LY.id,
    employeeName: LY_LY.name,
    tips: 200_000,
  }),
  inv({
    id: 'p2-ly-st',
    date: '2026-08-20',
    branchId: 'soc-trang',
    branchName: 'Sóc Trăng Khoẻ Spa',
    homeBranchId: 'soc-trang',
    employeeId: LY_LY.id,
    employeeName: LY_LY.name,
  }),
  inv({
    id: 'p2-ly-tram',
    date: '2026-08-25',
    branchId: 'tram-spa',
    branchName: 'Trạm Spa',
    homeBranchId: '',
    employeeId: LY_LY.id,
    employeeName: LY_LY.name,
  }),
  inv({
    id: 'p1-other',
    date: '2026-08-08',
    branchId: 'bac-lieu',
    branchName: 'Bạc Liêu Khoẻ Spa',
    homeBranchId: 'bac-lieu',
    employeeId: THANH_THU.id,
    employeeName: THANH_THU.name,
  }),
  inv({
    id: 'sep-ly',
    date: '2026-09-01',
    branchId: 'soc-trang',
    branchName: 'Sóc Trăng Khoẻ Spa',
    homeBranchId: 'soc-trang',
    employeeId: LY_LY.id,
    employeeName: LY_LY.name,
  }),
  inv({
    id: 'p1-support-st',
    date: '2026-08-12',
    branchId: 'tram-spa',
    branchName: 'Trạm Spa',
    homeBranchId: 'tram-spa',
    employeeId: 'tram-spa-nhu-ha',
    employeeName: 'Như Hà',
    supportEmployeeId: LY_LY.id,
    supportEmployeeName: LY_LY.name,
  }),
]

const ids = (rows) => rows.map((row) => row.id).sort()

console.log('\n=== UAT — Manager invoice history view (QL Sóc Trăng) ===\n')

{
  const servingOnly = filterByUserScope(invoices)
  assert.ok(!servingOnly.some((row) => row.id === 'p1-ly-tram'))
  console.log('  [PASS] baseline: serving-scope ẩn HĐ Ly Ly tại Trạm Spa')
}

{
  assert.equal(invoiceBelongsToManagerHomeBranch(invoices[1], 'soc-trang'), true)
  assert.equal(invoiceBelongsToManagerHomeBranch(invoices[4], 'soc-trang'), false)
  const visible = filterInvoicesForManagerHistory(invoices, 'soc-trang')
  assert.deepEqual(ids(visible), [
    'p1-ly-tram',
    'p1-st-kim',
    'p1-support-st',
    'p2-ly-st',
    'p2-ly-tram',
    'sep-ly',
  ])
  assert.ok(!visible.some((row) => row.employeeId === THANH_THU.id))
  console.log('  [PASS] QL ST thấy HĐ NV chi nhánh mình (kể cả phục vụ Trạm + hỗ trợ); ẩn NV CN khác')
}

{
  const p1 = getPayPeriodRange('2026-08', PAY_CYCLES.PERIOD_1)
  const p2 = getPayPeriodRange('2026-08', PAY_CYCLES.PERIOD_2)
  assert.deepEqual(p1, { fromDate: '2026-08-01', toDate: '2026-08-15' })
  assert.deepEqual(p2, { fromDate: '2026-08-16', toDate: '2026-08-31' })

  const visible = filterInvoicesForManagerHistory(invoices, 'soc-trang')
  const augP1 = filterInvoices(visible, p1)
  const augP2 = filterInvoices(visible, p2)
  assert.deepEqual(ids(augP1), ['p1-ly-tram', 'p1-st-kim', 'p1-support-st'])
  assert.deepEqual(ids(augP2), ['p2-ly-st', 'p2-ly-tram'])
  console.log('  [PASS] xem 01–15/08 và 16–31/08 đầy đủ HĐ ST (kể cả Ly Ly tại Trạm)')
}

{
  const visible = filterInvoicesForManagerHistory(invoices, 'soc-trang')
  const lyAug = filterInvoices(visible, {
    fromDate: '2026-08-01',
    toDate: '2026-08-31',
    employeeId: LY_LY.id,
  })
  assert.deepEqual(ids(lyAug), ['p1-ly-tram', 'p1-support-st', 'p2-ly-st', 'p2-ly-tram'])
  assert.ok(lyAug.every((row) => (
    row.employeeId === LY_LY.id || row.supportEmployeeId === LY_LY.id
  )))
  console.log('  [PASS] lọc Ly Ly tháng 8 (gồm HĐ hỗ trợ + phục vụ CN khác)')
}

{
  const employees = getActiveEmployeesByBranch('soc-trang')
  assert.ok(employees.some((row) => row.id === LY_LY.id))
  assert.ok(!employees.some((row) => row.id === THANH_THU.id))
  console.log('  [PASS] dropdown NV chỉ nhân viên chi nhánh mình')
}

{
  const managerScope = buildInvoicePageFetchScope({
    fromDate: '2026-08-01',
    toDate: '2026-08-15',
    branchId: 'soc-trang',
    isBranchManagerUser: true,
  })
  assert.equal(managerScope.branchId, '')
  assert.equal(managerScope.fromDate, '2026-08-01')
  assert.equal(managerScope.toDate, '2026-08-15')

  const lyScope = buildInvoicePageFetchScope({
    fromDate: '2026-08-01',
    toDate: '2026-08-31',
    branchId: 'soc-trang',
    employeeId: LY_LY.id,
    isBranchManagerUser: true,
  })
  assert.equal(lyScope.branchId, '')
  assert.equal(lyScope.employeeId, LY_LY.id)

  const adminScope = buildInvoicePageFetchScope({
    fromDate: '2026-09-01',
    toDate: '2026-09-01',
    branchId: 'soc-trang',
  })
  assert.equal(adminScope.branchId, 'soc-trang')
  console.log('  [PASS] fetch đúng date range; QL không gửi branch_id phục vụ')
}

{
  seedApprovedCloseCache([
    {
      employeeId: LY_LY.id,
      status: CLOSE_CYCLE_STATUS.APPROVED,
      fromDate: '2026-08-01',
      toDate: '2026-08-15',
      billingMonth: '2026-08',
      cycle: 'period1',
    },
    {
      employeeId: KIM_QUYEN.id,
      status: CLOSE_CYCLE_STATUS.APPROVED,
      fromDate: '2026-08-01',
      toDate: '2026-08-15',
      billingMonth: '2026-08',
      cycle: 'period1',
    },
  ])
  const closedCross = invoices.find((row) => row.id === 'p1-ly-tram')
  const closedHome = invoices.find((row) => row.id === 'p1-st-kim')
  const openSep = invoices.find((row) => row.id === 'sep-ly')
  assert.equal(canEditInvoice(closedCross), false)
  assert.equal(canEditInvoice(closedHome), false)
  assert.equal(canDeleteInvoice(closedCross), false)
  assert.equal(canDeleteInvoice(openSep), false)
  console.log('  [PASS] chỉ mở quyền XEM — không sửa/xóa HĐ kỳ đã chốt (và không mở xóa)')
}

console.log('\nPASS — manager invoice history view\n')
