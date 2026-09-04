/**
 * Một nguồn chi phí nhân sự cho Báo cáo / DrillDown / Ops:
 * - Nếu from/to khớp kỳ lương → cùng computePayrollReport (Salary UI), gồm rule attendance Kỳ 2 = cả tháng.
 * - Ngược lại → computePayrollCostByBranch theo khoảng ngày.
 */
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchAttendanceFiltered } from '../repositories/attendanceRepository'
import { fetchEmployeesFiltered } from '../repositories/employeesRepository'
import { fetchPayrollAdjustments } from '../repositories/payrollRepository'
import { fetchKpiBranchPolicies } from '../repositories/kpiPolicyRepository'
import { normalizeEmployee } from './employeeStorage'
import { computePayrollReport } from './payrollEngine'
import {
  aggregatePayrollCostFromReport,
  computePayrollCostByBranch,
} from './profitReport'
import { getPayPeriodRange, PAY_CYCLES } from './salaryReport'

function monthsInRange(fromDate, toDate) {
  const from = String(fromDate ?? '').slice(0, 7)
  const to = String(toDate ?? '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(from)) return []
  const months = [from]
  if (!/^\d{4}-\d{2}$/.test(to) || to === from) return months
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (y < ty || (y === ty && m < tm)) {
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
    months.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return months
}

/** Khớp đúng Kỳ 1 / Kỳ 2 / cả tháng. */
export function matchPayPeriod(fromDate, toDate) {
  const month = String(fromDate ?? '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  for (const cycle of [PAY_CYCLES.PERIOD_1, PAY_CYCLES.PERIOD_2, PAY_CYCLES.FULL]) {
    const range = getPayPeriodRange(month, cycle)
    if (range.fromDate === fromDate && range.toDate === toDate) {
      return { month, cycle }
    }
  }
  return null
}

export async function loadPayrollCostForFilters(filters, invoices = []) {
  if (!isSupabaseConfigured) {
    return { payrollByBranch: { total: 0, byBranch: new Map() }, employees: [], adjustments: [], attendance: [] }
  }

  const matched = matchPayPeriod(filters.fromDate, filters.toDate)
  // Cùng rule Salary UI: Kỳ 2 lấy attendance cả tháng
  const attendanceCycle = matched?.cycle === PAY_CYCLES.PERIOD_2
    ? PAY_CYCLES.FULL
    : (matched?.cycle ?? null)
  const attendanceRange = attendanceCycle
    ? getPayPeriodRange(matched.month, attendanceCycle)
    : { fromDate: filters.fromDate || '', toDate: filters.toDate || '' }

  const months = matched ? [matched.month] : monthsInRange(filters.fromDate, filters.toDate)
  const [attendanceRows, employeeRows, kpiPolicies, ...adjustmentBatches] = await Promise.all([
    fetchAttendanceFiltered({
      fromDate: attendanceRange.fromDate || '',
      toDate: attendanceRange.toDate || '',
      branchId: filters.branchId || '',
      employeeId: filters.employeeId || '',
    }).catch(() => []),
    fetchEmployeesFiltered({}).catch(() => []),
    fetchKpiBranchPolicies().catch(() => []),
    ...months.map((month) =>
      fetchPayrollAdjustments({ month, branchId: filters.branchId || '' }).catch(() => []),
    ),
  ])

  const employees = (employeeRows ?? []).map((row) => normalizeEmployee(row))
  const adjustments = adjustmentBatches.flat()

  let payrollByBranch
  if (matched) {
    const report = computePayrollReport({
      month: matched.month,
      cycle: matched.cycle,
      branchId: '',
      employeeId: '',
      employees,
      invoices: invoices ?? [],
      attendanceRecords: attendanceRows ?? [],
      adjustments,
      kpiPolicies: kpiPolicies ?? [],
    })
    payrollByBranch = aggregatePayrollCostFromReport(report, { branchId: filters.branchId || '' })
  } else {
    payrollByBranch = computePayrollCostByBranch({
      fromDate: filters.fromDate || '',
      toDate: filters.toDate || '',
      branchId: filters.branchId || '',
      employees,
      invoices: invoices ?? [],
      attendanceRecords: attendanceRows ?? [],
      adjustments,
      kpiPolicies: kpiPolicies ?? [],
    })
  }

  return {
    payrollByBranch,
    employees,
    adjustments,
    attendance: attendanceRows ?? [],
    matchedPeriod: matched,
  }
}
