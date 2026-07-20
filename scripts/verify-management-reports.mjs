/**
 * Verify Management Reports V1 period compare + metrics.
 * Run: npm run verify:management-reports
 */

import './_polyfill-storage.mjs'
import assert from 'node:assert/strict'
import {
  getManagementComparePeriod,
  computeSafeTrend,
  safeRatePercent,
  safeDivide,
  countInclusiveDays,
} from '../src/utils/managementReports/periodCompare.js'
import {
  buildBranchManagementRows,
  buildEmployeeManagementRows,
} from '../src/utils/managementReports/managementMetrics.js'
import '../src/constants/branches.js'

// 1. Open current month MTD (today=21) → same days previous month
{
  const cmp = getManagementComparePeriod('2026-07-01', '2026-07-21', '2026-07-21')
  assert.equal(cmp.mode, 'mtd-same-days')
  assert.equal(cmp.fromDate, '2026-06-01')
  assert.equal(cmp.toDate, '2026-06-21')
}

// 2. Full finished month → full previous month
{
  const cmp = getManagementComparePeriod('2026-06-01', '2026-06-30', '2026-07-21')
  assert.equal(cmp.mode, 'full-month')
  assert.equal(cmp.fromDate, '2026-05-01')
  assert.equal(cmp.toDate, '2026-05-31')
}

// 3. Safe math
assert.equal(safeDivide(100, 0), null)
assert.equal(safeRatePercent(1, 0), null)
assert.equal(safeRatePercent(1, 4), 25)
assert.equal(countInclusiveDays('2026-07-01', '2026-07-21'), 21)

{
  const zero = computeSafeTrend(0, 0)
  assert.equal(zero.direction, 'none')
  const neu = computeSafeTrend(100, 0)
  assert.equal(neu.direction, 'new')
  assert.equal(neu.percent, null)
  const down = computeSafeTrend(80, 100)
  assert.equal(down.direction, 'down')
  assert.equal(down.percent, 20)
}

const invoices = [
  {
    id: 'a1',
    date: '2026-07-10',
    branchId: 'soc-trang',
    branchName: 'Sóc Trăng',
    employeeId: 'e1',
    employeeName: 'A',
    customerName: 'Khách 1',
    customerPhone: '0901111001',
    customerRequested: true,
    tips: 50000,
    serviceTotal: 500000,
    total: 550000,
    services: [{ id: 's1', name: 'Body', price: 500000 }],
  },
  {
    id: 'a2',
    date: '2026-07-11',
    branchId: 'soc-trang',
    employeeId: 'e1',
    employeeName: 'A',
    customerName: 'Khách 2',
    customerPhone: '0901111002',
    customerRequested: false,
    tips: 0,
    serviceTotal: 300000,
    total: 300000,
    supportEmployeeId: 'e2',
    supportEmployeeName: 'B',
    services: [{ id: 's1', name: 'Body', price: 300000 }],
  },
  {
    id: 'b1',
    date: '2026-06-10',
    branchId: 'soc-trang',
    employeeId: 'e1',
    employeeName: 'A',
    customerName: 'Khách 1',
    customerPhone: '0901111001',
    customerRequested: true,
    tips: 20000,
    serviceTotal: 400000,
    total: 420000,
    services: [{ id: 's1', name: 'Body', price: 400000 }],
  },
]

const branchRows = buildBranchManagementRows({
  invoices,
  previousInvoices: invoices.filter((i) => i.date.startsWith('2026-06')),
  expenses: [],
  previousExpenses: [],
  fixedCosts: [],
  fromDate: '2026-07-01',
  toDate: '2026-07-21',
  previousFromDate: '2026-06-01',
  previousToDate: '2026-06-21',
  scopeBranchId: 'soc-trang',
})
assert.ok(branchRows.length >= 1)
const st = branchRows.find((r) => r.branchId === 'soc-trang')
assert.ok(st)
assert.equal(st.totalCustomerCount, 2)
assert.equal(st.requestedCustomerCount, 1)
assert.equal(st.requestedRate, 50)
assert.ok(st.averageRevenuePerCustomer != null)
assert.ok(Number.isFinite(st.averageRevenuePerDay))

const empRows = buildEmployeeManagementRows({
  invoices,
  previousInvoices: invoices.filter((i) => i.date.startsWith('2026-06')),
  attendanceRecords: [
    { employeeId: 'e1', date: '2026-07-10', status: 'on_time' },
    { employeeId: 'e1', date: '2026-07-11', status: 'on_time' },
  ],
  previousAttendanceRecords: [],
  fromDate: '2026-07-01',
  toDate: '2026-07-21',
  previousFromDate: '2026-06-01',
  previousToDate: '2026-06-21',
  scopeBranchId: 'soc-trang',
  employeeIds: new Set(['e1', 'e2']),
})

const e1 = empRows.find((r) => r.employeeId === 'e1')
assert.ok(e1)
assert.equal(e1.requestedCustomerCount, 1)
assert.equal(e1.workDays, 2)
assert.ok(e1.revenueRankInBranch >= 1)

const e2 = empRows.find((r) => r.employeeId === 'e2')
if (e2) {
  assert.equal(e2.revenue, 0)
}

{
  const rows = buildEmployeeManagementRows({
    invoices: [invoices[0]],
    previousInvoices: [],
    attendanceRecords: [],
    previousAttendanceRecords: [],
    fromDate: '2026-07-01',
    toDate: '2026-07-21',
    previousFromDate: '2026-06-01',
    previousToDate: '2026-06-21',
    scopeBranchId: '',
    employeeIds: new Set(['e1']),
  })
  assert.equal(rows[0].revenueTrend.direction, 'new')
}

console.log('PASS — verify:management-reports')
console.log('  ✓ MoM same-days + full-month compare')
console.log('  ✓ safe divide / trend labels')
console.log('  ✓ customerRequested metrics')
console.log('  ✓ support employee not credited ticket revenue')
