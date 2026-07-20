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
import {
  buildRevenueInsights,
  buildTopMovers,
  resolveKpiTone,
} from '../src/utils/managementReports/managementInsights.js'
import { attachPerDayMetrics } from '../src/utils/managementReports/perDayMetrics.js'
import {
  buildSelfEvolution,
  concludeEvolution,
  getLastThreeMonthWindows,
} from '../src/utils/managementReports/selfEvolution.js'
import {
  enrichRowsWithPerformance,
  resolvePerformanceGrade,
  attendanceDiligenceScore,
  percentileScore,
} from '../src/utils/managementReports/performanceScore.js'
import {
  buildBenchmarkTopBottom,
  sortBenchmarkRows,
  DEFAULT_BENCHMARK_SORT,
} from '../src/utils/managementReports/benchmarkSort.js'
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

// ——— V2 ———
{
  // Per-day: same revenue, fewer work days → higher revenue/day
  const high = attachPerDayMetrics({ revenue: 1_000_000, tips: 100_000, totalCustomerCount: 10, requestedCustomerCount: 2, workDays: 5 })
  const low = attachPerDayMetrics({ revenue: 1_000_000, tips: 100_000, totalCustomerCount: 10, requestedCustomerCount: 2, workDays: 10 })
  assert.ok(high.revenuePerWorkDay > low.revenuePerWorkDay)
  assert.equal(high.customersPerWorkDay, 2)
  assert.equal(low.tipsPerWorkDay, 10_000)
}

{
  // Zero work days / zero tips / zero customers
  const empty = attachPerDayMetrics({ revenue: 0, tips: 0, totalCustomerCount: 0, requestedCustomerCount: 0, workDays: 0 })
  assert.equal(empty.revenuePerWorkDay, null)
  assert.equal(empty.customersPerWorkDay, null)
}

{
  const windows = getLastThreeMonthWindows('2026-07-21', 3)
  assert.equal(windows.length, 3)
  assert.equal(windows[0].monthKey, '2026-05')
  assert.equal(windows[2].toDate, '2026-07-21')
}

{
  const months = [
    { revenuePerWorkDay: 100, revenue: 1000 },
    { revenuePerWorkDay: 120, revenue: 1200 },
    { revenuePerWorkDay: 150, revenue: 1500 },
  ]
  assert.equal(concludeEvolution(months).id, 'improving')
  assert.equal(concludeEvolution([
    { revenuePerWorkDay: 150 },
    { revenuePerWorkDay: 120 },
    { revenuePerWorkDay: 90 },
  ]).id, 'declining')
  assert.equal(concludeEvolution([
    { revenuePerWorkDay: 100 },
    { revenuePerWorkDay: 100 },
    { revenuePerWorkDay: 100 },
  ]).id, 'stable')
}

{
  const evolutionInvoices = [
    { id: 'm1', date: '2026-05-10', branchId: 'soc-trang', employeeId: 'e1', customerName: 'X', customerPhone: '0901', tips: 0, serviceTotal: 200000, total: 200000, services: [{ price: 200000 }] },
    { id: 'm2', date: '2026-06-10', branchId: 'soc-trang', employeeId: 'e1', customerName: 'Y', customerPhone: '0902', tips: 0, serviceTotal: 300000, total: 300000, services: [{ price: 300000 }] },
    { id: 'm3', date: '2026-07-10', branchId: 'soc-trang', employeeId: 'e1', customerName: 'Z', customerPhone: '0903', tips: 0, serviceTotal: 400000, total: 400000, services: [{ price: 400000 }] },
  ]
  const evo = buildSelfEvolution({
    invoices: evolutionInvoices,
    attendanceRecords: [
      { employeeId: 'e1', date: '2026-05-10', status: 'on_time' },
      { employeeId: 'e1', date: '2026-06-10', status: 'on_time' },
      { employeeId: 'e1', date: '2026-07-10', status: 'on_time' },
    ],
    toDate: '2026-07-21',
    entityType: 'employee',
    entityId: 'e1',
  })
  assert.equal(evo.months.length, 3)
  assert.equal(evo.conclusion.id, 'improving')
  assert.ok(evo.series.some((s) => s.key === 'revenuePerWorkDay'))
}

{
  assert.equal(resolvePerformanceGrade(96).label, 'Xuất sắc')
  assert.equal(resolvePerformanceGrade(88).label, 'Rất tốt')
  assert.equal(resolvePerformanceGrade(75).label, 'Tốt')
  assert.equal(resolvePerformanceGrade(55).label, 'Cần cải thiện')
  assert.equal(resolvePerformanceGrade(40).label, 'Cảnh báo')
  assert.ok(percentileScore(100, [10, 50, 100]) >= 80)
  assert.equal(attendanceDiligenceScore({ onTime: 8, late: 1, early: 0, permittedLeave: 0, unpermittedLeave: 0, workDays: 8, totalRecords: 9 }) > 70, true)
}

{
  // Prefer higher revenue/day when total revenue similar
  const peers = [
    { id: 'a', name: 'A', branchId: 'soc-trang', revenue: 1_000_000, revenuePerWorkDay: 200_000, requestedRate: 40, averageRevenuePerCustomer: 100_000, tipsPerWorkDay: 20_000, workDays: 5 },
    { id: 'b', name: 'B', branchId: 'soc-trang', revenue: 1_050_000, revenuePerWorkDay: 105_000, requestedRate: 20, averageRevenuePerCustomer: 80_000, tipsPerWorkDay: 10_000, workDays: 10 },
  ]
  const scored = enrichRowsWithPerformance(peers, {
    groupByBranch: true,
    getEvolution: () => ({ conclusion: { id: 'improving', label: 'Đang tiến bộ', tone: 'green' } }),
    getAttendanceStats: () => ({ onTime: 5, late: 0, early: 0, permittedLeave: 0, unpermittedLeave: 0, workDays: 5, totalRecords: 5 }),
  })
  const a = scored.find((r) => r.id === 'a')
  const b = scored.find((r) => r.id === 'b')
  assert.ok(a.performanceScore > b.performanceScore)
  assert.equal(a.performanceRankInBranch, 1)
  assert.ok(a.strongestMetric)
  assert.ok(a.weakestMetric)
}

{
  const board = buildBenchmarkTopBottom([
    { id: '1', name: 'High', revenuePerWorkDay: 300 },
    { id: '2', name: 'Mid', revenuePerWorkDay: 200 },
    { id: '3', name: 'Low', revenuePerWorkDay: 50 },
    { id: '4', name: 'None', revenuePerWorkDay: null },
  ], { metric: DEFAULT_BENCHMARK_SORT, limit: 2 })
  assert.equal(board.top[0].name, 'High')
  assert.equal(board.bottom[0].name, 'Low')
  const sorted = sortBenchmarkRows([
    { id: 'x', name: 'X', revenue: 900, revenuePerWorkDay: 90, workDays: 10 },
    { id: 'y', name: 'Y', revenue: 880, revenuePerWorkDay: 176, workDays: 5 },
  ], 'revenuePerWorkDay', 'desc')
  assert.equal(sorted[0].name, 'Y')
}

{
  // Heavy leave → fewer work days
  const leaveHeavy = buildEmployeeManagementRows({
    invoices: [invoices[0]],
    previousInvoices: [],
    attendanceRecords: [
      { employeeId: 'e1', date: '2026-07-10', status: 'on_time' },
      { employeeId: 'e1', date: '2026-07-11', status: 'full_day_permitted' },
      { employeeId: 'e1', date: '2026-07-12', status: 'full_day_permitted' },
    ],
    previousAttendanceRecords: [],
    fromDate: '2026-07-01',
    toDate: '2026-07-21',
    previousFromDate: '2026-06-01',
    previousToDate: '2026-06-21',
    scopeBranchId: 'soc-trang',
    employeeIds: new Set(['e1']),
  })
  assert.equal(leaveHeavy[0].workDays, 1)
  assert.ok(leaveHeavy[0].revenuePerWorkDay != null)
}

{
  // New hire / previous period empty
  const newbie = buildEmployeeManagementRows({
    invoices: [invoices[0]],
    previousInvoices: [],
    attendanceRecords: [{ employeeId: 'e1', date: '2026-07-10', status: 'on_time' }],
    previousAttendanceRecords: [],
    fromDate: '2026-07-01',
    toDate: '2026-07-21',
    previousFromDate: '2026-06-01',
    previousToDate: '2026-06-21',
    scopeBranchId: 'soc-trang',
    employeeIds: new Set(['e1']),
  })
  assert.equal(newbie[0].revenueTrend.direction, 'new')
  assert.ok(newbie[0].revenuePerWorkDayTrend)
}

{
  // Insights include work-day factors
  const insights = buildRevenueInsights({
    revenueTrend: { direction: 'down', percent: 15, label: '−15%' },
    customerTrend: { direction: 'down', percent: 10, label: '−10%' },
    workDaysTrend: { direction: 'down', percent: 20, label: '−20%' },
    tipsTrend: { direction: 'down', percent: 5, label: '−5%' },
  })
  assert.ok(insights.some((i) => i.text.includes('Ngày công giảm')))
  assert.ok(insights.some((i) => i.text.includes('Khách giảm')))
}

assert.ok(e1.revenuePerWorkDay != null)
assert.ok(e1.customersPerWorkDay != null)
assert.ok(st.workDays != null || st.workDays === 0)

console.log('PASS — verify:management-reports')
console.log('  ✓ MoM same-days + full-month compare')
console.log('  ✓ safe divide / trend labels')
console.log('  ✓ customerRequested metrics')
console.log('  ✓ support employee not credited ticket revenue')
console.log('  ✓ rule-based insights + KPI tones + top movers')
console.log('  ✓ V2 per-day KPIs (work-day normalization)')
console.log('  ✓ V2 self-evolution 3 months + conclusions')
console.log('  ✓ V2 performance score + grades + ranks')
console.log('  ✓ V2 benchmark TOP/BOTTOM + leave/new-hire edges')
