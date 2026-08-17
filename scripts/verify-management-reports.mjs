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
  buildEmployeeInvoiceList,
  buildEmployeeManagementRows,
  buildSystemManagementRow,
  EMPLOYEE_INVOICE_DRILL_MODES,
} from '../src/utils/managementReports/managementMetrics.js'
import {
  buildRevenueInsights,
  buildTopMovers,
  resolveKpiTone,
} from '../src/utils/managementReports/managementInsights.js'
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

const julyCurrent = invoices.filter((i) => i.date >= '2026-07-01' && i.date <= '2026-07-21')
const junePrevious = invoices.filter((i) => i.date.startsWith('2026-06'))

{
  const julyRows = buildBranchManagementRows({
    invoices: julyCurrent,
    previousInvoices: junePrevious,
    expenses: [],
    previousExpenses: [],
    fixedCosts: [],
    fromDate: '2026-07-01',
    toDate: '2026-07-21',
    previousFromDate: '2026-06-01',
    previousToDate: '2026-06-21',
    scopeBranchId: 'soc-trang',
  })
  const julySt = julyRows.find((r) => r.branchId === 'soc-trang')
  assert.equal(julySt.invoiceCount, 2)
  assert.equal(julySt.revenue, 800000)
  assert.equal(julySt.tips, 50000)
  assert.equal(julySt.ticketRevenuePerInvoice, 400000)
  assert.equal(julySt.tipsPerInvoice, 25000)
  assert.equal(julySt.averageTicket, julySt.ticketRevenuePerInvoice)
}

const empRows = buildEmployeeManagementRows({
  invoices: julyCurrent,
  previousInvoices: junePrevious,
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
assert.equal(e1.mainTourCount, 2)
assert.equal(e1.supportTourCount, 0)
assert.equal(e1.totalTourCount, 2)
assert.equal(e1.customerRequestedTourCount, 1)
assert.equal(e1.customerRequestedTourRate, 50)
assert.ok(Number.isFinite(e1.totalSalary))

const e2 = empRows.find((r) => r.employeeId === 'e2')
assert.ok(e2, 'support employee must appear in rows')
assert.equal(e2.revenue, 0)
assert.equal(e2.mainTourCount, 0)
assert.equal(e2.supportTourCount, 1)
assert.equal(e2.totalTourCount, 1)
assert.equal(e2.tips, 0)

assert.equal(buildEmployeeInvoiceList(julyCurrent, 'e1', EMPLOYEE_INVOICE_DRILL_MODES.PRIMARY).length, 2)
assert.equal(buildEmployeeInvoiceList(julyCurrent, 'e2', EMPLOYEE_INVOICE_DRILL_MODES.SUPPORT).length, 1)
assert.equal(buildEmployeeInvoiceList(julyCurrent, 'e1', EMPLOYEE_INVOICE_DRILL_MODES.REQUESTED).length, 1)
assert.equal(buildEmployeeInvoiceList(julyCurrent, 'e1', EMPLOYEE_INVOICE_DRILL_MODES.REQUESTED)[0].id, 'a1')

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

{
  const sample = {
    revenueTrend: { direction: 'up', percent: 20, label: '+20%' },
    customerTrend: { direction: 'up', percent: 10, label: '+10%' },
    averageTicketTrend: { direction: 'flat', percent: 0, label: '0%' },
    tipsTrend: { direction: 'down', percent: 8, label: '−8%' },
    requestedRateTrend: { direction: 'up', percent: 5, label: '+5%' },
  }
  const insights = buildRevenueInsights(sample)
  assert.ok(insights.some((i) => i.text.includes('Khách tăng')))
  assert.ok(insights.some((i) => i.text.includes('Tips giảm')))
  assert.equal(resolveKpiTone(sample.revenueTrend), 'green')
  assert.equal(resolveKpiTone({ direction: 'down', percent: 20, label: '−20%' }), 'red')
  assert.equal(resolveKpiTone({ direction: 'flat', percent: 0, label: '0%' }), 'yellow')
}

{
  const movers = buildTopMovers([
    { id: '1', name: 'A', revenueTrend: { direction: 'up', percent: 40, label: '+40%' }, requestedRateTrend: { direction: 'down', percent: 10, label: '−10%' } },
    { id: '2', name: 'B', revenueTrend: { direction: 'down', percent: 30, label: '−30%' }, requestedRateTrend: { direction: 'up', percent: 12, label: '+12%' } },
  ], { metric: 'revenue', limit: 5 })
  assert.equal(movers.gainers[0].name, 'A')
  assert.equal(movers.losers[0].name, 'B')
}

{
  const twoBranchInvoices = [
    {
      id: 'st1',
      date: '2026-07-10',
      branchId: 'soc-trang',
      employeeId: 'e1',
      employeeName: 'A',
      customerName: 'Khách ST',
      customerPhone: '0901111001',
      tips: 100000,
      serviceTotal: 500000,
      total: 600000,
      services: [{ id: 's1', name: 'Body', price: 500000 }],
    },
    {
      id: 'st2',
      date: '2026-07-11',
      branchId: 'soc-trang',
      employeeId: 'e1',
      employeeName: 'A',
      customerName: 'Khách ST 2',
      customerPhone: '0901111004',
      tips: 100000,
      serviceTotal: 500000,
      total: 600000,
      services: [{ id: 's1', name: 'Body', price: 500000 }],
    },
    {
      id: 'bl1',
      date: '2026-07-10',
      branchId: 'bac-lieu',
      employeeId: 'e3',
      employeeName: 'C',
      customerName: 'Khách BL',
      customerPhone: '0901111003',
      tips: 20000,
      serviceTotal: 300000,
      total: 320000,
      services: [{ id: 's1', name: 'Body', price: 300000 }],
    },
  ]
  const rows = buildBranchManagementRows({
    invoices: twoBranchInvoices,
    previousInvoices: [],
    expenses: [],
    previousExpenses: [],
    fixedCosts: [],
    fromDate: '2026-07-01',
    toDate: '2026-07-21',
    previousFromDate: '2026-06-01',
    previousToDate: '2026-06-21',
  })
  const system = buildSystemManagementRow({
    invoices: twoBranchInvoices,
    previousInvoices: [],
    fromDate: '2026-07-01',
    toDate: '2026-07-21',
    previousFromDate: '2026-06-01',
    previousToDate: '2026-06-21',
  })
  const stRow = rows.find((r) => r.branchId === 'soc-trang')
  const blRow = rows.find((r) => r.branchId === 'bac-lieu')
  assert.ok(stRow && blRow)
  assert.equal(stRow.ticketRevenuePerInvoice, 500000)
  assert.equal(stRow.tipsPerInvoice, 100000)
  assert.equal(blRow.ticketRevenuePerInvoice, 300000)
  assert.equal(blRow.tipsPerInvoice, 20000)
  assert.equal(system.invoiceCount, 3)
  assert.equal(system.revenue, 1300000)
  assert.equal(system.tips, 220000)
  assert.equal(system.ticketRevenuePerInvoice, 1300000 / 3)
  assert.equal(system.tipsPerInvoice, 220000 / 3)
  const avgOfAveragesTicket = (stRow.ticketRevenuePerInvoice + blRow.ticketRevenuePerInvoice) / 2
  assert.notEqual(system.ticketRevenuePerInvoice, avgOfAveragesTicket)
}

console.log('PASS — verify:management-reports')
console.log('  ✓ MoM same-days + full-month compare')
console.log('  ✓ safe divide / trend labels')
console.log('  ✓ customerRequested metrics')
console.log('  ✓ support employee not credited ticket revenue')
console.log('  ✓ main/support/total tour split + drill list')
console.log('  ✓ rule-based insights + KPI tones + top movers')
console.log('  ✓ Tiền vé/HĐ + Tips/HĐ theo số hóa đơn; Tổng hệ thống không trung bình CN')
