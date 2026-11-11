/**
 * Đối soát hiển thị tab Lương → Tổng quan với payrollRow hiện tại.
 * Không ghi database. Không đổi công thức.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { ATTENDANCE_STATUS } from '../src/constants/attendanceTypes.js'
import { OCT2026_KPI_TARGETS } from '../src/constants/kpiPolicy.js'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'
import { buildPayrollOverviewFigures } from '../src/components/salary/payrollOverviewFigures.js'
import { computeAttendanceLeaveBreakdown } from '../src/utils/attendancePenalties.js'
import { computeEmployeePayrollRow, computeNetSalary } from '../src/utils/payrollEngine.js'
import { extractCloseSalaryTotals } from '../src/utils/payrollCycleClose/closeSnapshotIntegrity.js'
import { CLOSE_CYCLE_STATUS } from '../src/utils/payrollCycleClose/closeCycleStatus.js'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const overviewSource = readFileSync(path.join(root, 'src/components/salary/PayrollOverview.jsx'), 'utf8')
const profileSource = readFileSync(path.join(root, 'src/components/salary/PayrollEmployeeProfile.jsx'), 'utf8')

assert.equal(overviewSource.includes('computeNetSalary'), false)
assert.equal(overviewSource.includes('sections.reduce'), false)
assert.equal(overviewSource.includes('Phạt ngày nghỉ'), false)
assert.equal(overviewSource.includes('Phạt chấm công'), true)
assert.equal(overviewSource.includes('Thu nhập & khấu trừ theo chi nhánh'), true)
assert.equal(profileSource.includes('PayrollLiveDashboard'), false)
assert.equal(profileSource.includes('<PayrollOverview'), true)

function expectSameNet(label, payrollRow) {
  const shown = buildPayrollOverviewFigures(payrollRow)
  assert.equal(shown.netSalary, payrollRow.netSalary, label)
  assert.equal(shown.totalIncome - shown.totalDeduction, payrollRow.netSalary, label)
  assert.equal(shown.reconciled, true, label)
  return shown
}

const parts = {
  baseSalary: 5_000_000,
  commission: 280_000,
  tips: 150_000,
  bonus: 100_000,
  kpi: 200_000,
  kpiPenalty: 300_000,
  reduction: 50_000,
  penalty: 70_000,
  advance: 500_000,
}
const netSalary = computeNetSalary(parts)
const synthetic = buildPayrollOverviewFigures({
  ...parts,
  attendancePenalty: 20_000,
  manualPenalty: 50_000,
  ticketRevenue: 9_000_000,
  leaveDays: 4,
  netSalary,
})
assert.equal(synthetic.totalIncome, 5_730_000)
assert.equal(synthetic.totalIncome === synthetic.totalIncome + synthetic.ticketRevenue, false)
assert.equal(synthetic.totalDeduction, 300_000 + 50_000 + 70_000 + 500_000)
assert.equal(synthetic.attendancePenalty, 20_000)
assert.equal(synthetic.manualPenalty, 50_000)
assert.equal(synthetic.reconciled, true)
assert.equal(synthetic.penaltyPartsMatch, true)
assert.equal(synthetic.netSalary, netSalary)

const employee = {
  id: 'e-multi',
  name: 'Lan',
  branchId: 'soc-trang',
  salaryRate: '5000000',
  position: 'KTV',
}
const invoices = [
  {
    id: 'inv-home',
    date: '2026-07-05',
    branchId: 'soc-trang',
    employeeId: 'e-multi',
    supportEmployeeId: '',
    customerName: 'Khách A',
    tips: 100000,
    services: [{ commissionAmount: 200000, price: 500000 }],
  },
  {
    id: 'inv-support',
    date: '2026-07-18',
    branchId: 'tram-spa',
    employeeId: 'e-multi',
    supportEmployeeId: '',
    customerName: 'Khách B',
    tips: 50000,
    services: [{ commissionAmount: 80000, price: 400000 }],
  },
]
const attendance = [
  { id: 'att-1', employeeId: 'e-multi', branchId: 'soc-trang', date: '2026-07-06', penaltyAmount: 20000, status: 'late_2h_unpermitted' },
  { id: 'att-2', employeeId: 'e-multi', branchId: 'tram-spa', date: '2026-07-20', penaltyAmount: 0, status: 'full_day_permitted' },
]
const adjustments = [
  { id: 'bonus-1', employeeId: 'e-multi', branchId: 'tram-spa', type: PAYROLL_ADJUSTMENT_TYPES.BONUS, amount: 100000, date: '2026-07-20', month: '2026-07' },
  { id: 'penalty-1', employeeId: 'e-multi', branchId: 'soc-trang', type: PAYROLL_ADJUSTMENT_TYPES.PENALTY, amount: 50000, date: '2026-07-08', month: '2026-07' },
  { id: 'advance-1', employeeId: 'e-multi', branchId: 'soc-trang', type: PAYROLL_ADJUSTMENT_TYPES.ADVANCE, amount: 500000, date: '2026-07-12', month: '2026-07' },
  { id: 'kpi-1', employeeId: 'e-multi', branchId: 'soc-trang', type: PAYROLL_ADJUSTMENT_TYPES.KPI, amount: 200000, date: '2026-07-28', month: '2026-07' },
  { id: 'reduce-1', employeeId: 'e-multi', branchId: 'soc-trang', type: PAYROLL_ADJUSTMENT_TYPES.REDUCTION, amount: 50000, date: '2026-07-21', month: '2026-07' },
]

const row = computeEmployeePayrollRow(employee, invoices, attendance, adjustments, {
  fromDate: '2026-07-01',
  toDate: '2026-07-31',
  month: '2026-07',
  cycle: 'full',
})
const figures = buildPayrollOverviewFigures(row)
assert.equal(figures.ticketRevenue, row.ticketRevenue)
assert.equal(figures.totalIncome, row.baseSalary + row.commission + row.tips + row.bonus + row.kpi)
assert.ok(figures.ticketRevenue > 0)
assert.notEqual(figures.totalIncome, row.baseSalary + row.commission + row.tips + row.bonus + row.kpi + row.ticketRevenue)
assert.equal(figures.attendancePenalty, row.attendancePenalty)
assert.equal(figures.attendancePenalty, 20000)
assert.equal(row.leaveDays, 1)
assert.notEqual(figures.attendancePenalty, 100000)
assert.equal(figures.manualPenalty, 50000)
assert.equal(figures.kpiPenalty, row.kpiPenalty)
assert.equal(figures.totalDeduction, row.kpiPenalty + row.reduction + row.penalty + row.advance)
assert.equal(figures.reconciled, true)
assert.equal(figures.netSalary, row.netSalary)
assert.equal(figures.totalIncome - figures.totalDeduction, row.netSalary)
assert.ok(Array.isArray(row.branchSections) && row.branchSections.length > 1)
const branchNetSum = row.branchSections.reduce((sum, section) => sum + section.netSalary, 0)
assert.notEqual(branchNetSum, row.netSalary)
assert.equal(row.branchSections.every((section) => section.baseSalary === 0), true)
assert.equal(row.branchSections.every((section) => section.kpiPenalty === 0), true)

const period = { fromDate: '2026-10-01', toDate: '2026-10-15', month: '2026-10', cycle: 'period1' }
const single = computeEmployeePayrollRow(
  { id: 'e-one', name: 'Mai', branchId: 'bac-lieu', salaryRate: '4000000' },
  [{
    id: 'one-inv',
    date: '2026-10-03',
    branchId: 'bac-lieu',
    employeeId: 'e-one',
    tips: 30000,
    services: [{ commissionAmount: 120000, price: 300000 }],
  }],
  [{ id: 'one-att', employeeId: 'e-one', branchId: 'bac-lieu', date: '2026-10-03', status: ATTENDANCE_STATUS.ON_TIME, penaltyAmount: 0 }],
  [],
  period,
)
assert.equal(single.branchSections, null)
expectSameNet('một chi nhánh', single)

const attendanceMix = [
  { id: 'late', employeeId: 'e-att', branchId: 'bac-lieu', date: '2026-10-05', status: ATTENDANCE_STATUS.LATE_2H_UNPERMITTED, penaltyAmount: 20000 },
  { id: 'early', employeeId: 'e-att', branchId: 'bac-lieu', date: '2026-10-06', status: ATTENDANCE_STATUS.EARLY_2H_UNPERMITTED, penaltyAmount: 20000 },
  { id: 'leave', employeeId: 'e-att', branchId: 'bac-lieu', date: '2026-10-07', status: ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED, penaltyAmount: 100000 },
]
const withAttendance = computeEmployeePayrollRow(
  { id: 'e-att', name: 'Hoa', branchId: 'bac-lieu', salaryRate: '3000000' },
  [],
  attendanceMix,
  [],
  period,
)
const attendanceShown = expectSameNet('phạt chấm công', withAttendance)
assert.equal(attendanceShown.attendancePenalty, 140000)
const attendanceParts = computeAttendanceLeaveBreakdown(attendanceMix, {})
assert.equal(attendanceParts.latePenalty, 20000)
assert.equal(attendanceParts.earlyPenalty, 20000)
assert.equal(attendanceParts.unpermittedPenalty, 100000)
assert.equal(
  attendanceParts.latePenalty + attendanceParts.earlyPenalty + attendanceParts.permittedPenalty
    + attendanceParts.unpermittedPenalty + attendanceParts.weekendPenalty + attendanceParts.otherPenalty,
  withAttendance.attendancePenalty,
)

const withAdvance = computeEmployeePayrollRow(
  { id: 'e-adv', name: 'Thu', branchId: 'tra-vinh', salaryRate: '2000000' },
  [],
  [],
  [{ id: 'adv', employeeId: 'e-adv', branchId: 'tra-vinh', type: PAYROLL_ADJUSTMENT_TYPES.ADVANCE, amount: 800000, date: '2026-10-08', month: '2026-10' }],
  period,
)
const advanceShown = expectSameNet('ứng lương', withAdvance)
assert.equal(advanceShown.advance, 800000)
assert.equal(withAdvance.netSalary, 2000000 - 800000)

const kpiServices = [
  ...Array.from({ length: 60 }, () => ({ serviceId: 'body-60' })),
  ...Array.from({ length: 4 }, () => ({ serviceId: 'chuyen-sau' })),
]
const withKpi = computeEmployeePayrollRow(
  { id: 'e-kpi', name: 'Lan KPI', branchId: 'soc-trang', salaryRate: '0' },
  [{
    id: 'kpi-inv',
    date: '2026-10-08',
    branchId: 'soc-trang',
    employeeId: 'e-kpi',
    tips: 0,
    services: kpiServices,
  }],
  [],
  [],
  {
    ...period,
    kpiPolicies: [{
      id: 'oct-soc-trang',
      branchId: 'soc-trang',
      effectiveFrom: '2026-10-01',
      addonTarget: OCT2026_KPI_TARGETS.addon,
      advancedTarget: OCT2026_KPI_TARGETS.advanced,
      comboTarget: OCT2026_KPI_TARGETS.combo,
      requestedTarget: OCT2026_KPI_TARGETS.requested,
      duration90Target: OCT2026_KPI_TARGETS.duration90,
    }],
  },
)
const kpiShown = expectSameNet('phạt KPI', withKpi)
assert.ok(kpiShown.kpiPenalty > 0)
assert.equal(kpiShown.kpiPenalty, withKpi.kpiPenalty)

const approvedLive = computeEmployeePayrollRow(
  { id: 'e-approved', name: 'Đã duyệt', branchId: 'vinh-long', salaryRate: '4500000' },
  [{
    id: 'ap-inv',
    date: '2026-10-04',
    branchId: 'vinh-long',
    employeeId: 'e-approved',
    tips: 40000,
    services: [{ commissionAmount: 90000, price: 250000 }],
  }],
  [{ id: 'ap-att', employeeId: 'e-approved', branchId: 'vinh-long', date: '2026-10-09', status: ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED, penaltyAmount: 100000 }],
  [{ id: 'ap-adv', employeeId: 'e-approved', branchId: 'vinh-long', type: PAYROLL_ADJUSTMENT_TYPES.ADVANCE, amount: 200000, date: '2026-10-10', month: '2026-10' }],
  period,
)
const approvedClose = {
  status: CLOSE_CYCLE_STATUS.APPROVED,
  snapshot: { salary: approvedLive },
}
const approvedTotals = extractCloseSalaryTotals(approvedClose)
const approvedShown = buildPayrollOverviewFigures({
  ...approvedLive,
  ...approvedTotals,
  netSalary: approvedTotals.netSalary,
})
assert.equal(approvedClose.status, 'approved')
assert.equal(approvedShown.netSalary, approvedLive.netSalary)
assert.equal(approvedShown.netSalary, approvedTotals.netSalary)
assert.equal(approvedShown.totalIncome - approvedShown.totalDeduction, approvedLive.netSalary)

const cases = {
  singleBranch: { name: single.employeeName, netSalary: single.netSalary },
  multiBranch: { name: row.employeeName, netSalary: row.netSalary, branchNetSum },
  attendancePenalty: {
    name: withAttendance.employeeName,
    netSalary: withAttendance.netSalary,
    attendancePenalty: withAttendance.attendancePenalty,
    latePenalty: attendanceParts.latePenalty,
    earlyPenalty: attendanceParts.earlyPenalty,
    leavePenalty: attendanceParts.unpermittedPenalty,
  },
  kpiPenalty: { name: withKpi.employeeName, netSalary: withKpi.netSalary, kpiPenalty: withKpi.kpiPenalty },
  advance: { name: withAdvance.employeeName, netSalary: withAdvance.netSalary, advance: withAdvance.advance },
  approved: { name: approvedLive.employeeName, netSalary: approvedShown.netSalary, status: approvedClose.status },
}

if (process.env.PREVIEW === '1') {
  const { writeFileSync } = await import('node:fs')
  const React = (await import('react')).default
  globalThis.React = React
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { default: PayrollOverview } = await import('../src/components/salary/PayrollOverview.jsx')
  const { computeAttendanceStats } = await import('../src/utils/payrollLiveHelpers.js')
  const { computeAttendanceLeaveBreakdown } = await import('../src/utils/attendancePenalties.js')
  const css = readFileSync(path.join(root, 'src/pages/Salary.css'), 'utf8')
  const overviewCss = css.slice(css.indexOf('.salary-overview {'))
  const attendanceStats = computeAttendanceStats(attendance, employee.id)
  const leaveBreakdown = computeAttendanceLeaveBreakdown(attendance, {})
  const markup = (props) => renderToStaticMarkup(React.createElement(PayrollOverview, {
    employee: { employeeName: row.employeeName },
    stats: { ...row, paidAmount: 1000000, remainingAmount: row.netSalary - 1000000 },
    attendanceStats,
    breakdown: leaveBreakdown,
    cycle: 'period2',
    month: '2026-07',
    fromDate: '2026-07-16',
    toDate: '2026-07-31',
    locks: [{ month: '2026-07', branchId: 'soc-trang', isLocked: true }],
    ...props,
  }))
  const page = (body, width) => `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; background: #f3f4f6; font-family: Inter, system-ui, sans-serif; }
    main { width: ${width}px; margin: 24px auto; }
    ${overviewCss}
  </style></head><body><main>${body}</main></body></html>`
  writeFileSync('/tmp/payroll-overview-desktop.html', page(markup({}), 1100))
  writeFileSync('/tmp/payroll-overview-open.html', page(markup({ defaultAttendanceOpen: true, defaultBranchOpen: true }), 1100))
  writeFileSync('/tmp/payroll-overview-mobile.html', page(markup({}), 390))
  console.log('WROTE /tmp/payroll-overview-*.html')
}

console.log(JSON.stringify({
  cases,
  employee: row.employeeName,
  branches: row.branchSections.map((section) => ({
    branch: section.branchName,
    ticketRevenue: section.ticketRevenue,
    commission: section.commission,
    tips: section.tips,
    netSalary: section.netSalary,
  })),
  branchNetSum,
  overview: {
    totalIncome: figures.totalIncome,
    totalDeduction: figures.totalDeduction,
    netSalary: figures.netSalary,
    attendancePenalty: figures.attendancePenalty,
    manualPenalty: figures.manualPenalty,
    kpiPenalty: figures.kpiPenalty,
    ticketRevenueExcludedFromIncome: figures.ticketRevenue,
    leaveDays: row.leaveDays,
  },
}, null, 2))
console.log('PASS payroll overview layout')
