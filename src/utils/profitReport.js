import { computeEmployeePayrollRow } from './payrollEngine'
import { employeeBelongsToBranch, isPayrollListEmployee, recordBelongsToBranch } from './branchEmployeeMatch'

/** Tổng doanh thu thực thu = giá vé sau KM + Tips. */
export function computeActualRevenue(ticketRevenue, tips) {
  return Number(ticketRevenue ?? 0) + Number(tips ?? 0)
}

/**
 * Lợi nhuận = (doanh thu tiền vé + tips) − (lương + chi phí cố định + chi phí phát sinh).
 * `expenses` = tổng chi phí cố định + phát sinh trong kỳ.
 */
export function computeProfitAmount(actualRevenue, totalSalary, expenses) {
  return actualRevenue - totalSalary - expenses
}

/** Tỷ suất lợi nhuận (%). Doanh thu = 0 → 0%. */
export function computeProfitMarginPercent(actualRevenue, profit) {
  const revenue = Number(actualRevenue ?? 0)
  if (revenue <= 0) return 0
  return Math.round((profit / revenue) * 10000) / 100
}

function filterAdjustmentsForRange(adjustments, { fromDate, toDate, branchId }) {
  return adjustments.filter((row) => {
    if (fromDate && row.date < fromDate) return false
    if (toDate && row.date > toDate) return false
    if (branchId && !recordBelongsToBranch(row, branchId)) return false
    return true
  })
}

function filterAttendanceForRange(attendanceRecords, { fromDate, toDate, branchId, employeeId }) {
  return attendanceRecords.filter((row) => {
    if (fromDate && row.date < fromDate) return false
    if (toDate && row.date > toDate) return false
    if (branchId && !recordBelongsToBranch(row, branchId)) return false
    if (employeeId && row.employeeId !== employeeId) return false
    return true
  })
}

function filterInvoicesForRange(invoices, { fromDate, toDate, branchId, employeeId }) {
  return invoices.filter((invoice) => {
    if (fromDate && invoice.date < fromDate) return false
    if (toDate && invoice.date > toDate) return false
    if (branchId && !recordBelongsToBranch(invoice, branchId)) return false
    if (employeeId) {
      const matchesPrimary = invoice.employeeId === employeeId
      const matchesSupport = invoice.supportEmployeeId === employeeId
      if (!matchesPrimary && !matchesSupport) return false
    }
    return true
  })
}

/**
 * Tổng lương nhân viên theo chi nhánh trong kỳ (net salary từ payroll engine).
 * Trả về Map<branchId, totalSalary> và tổng toàn hệ thống.
 */
export function computePayrollCostByBranch({
  fromDate = '',
  toDate = '',
  branchId = '',
  employees = [],
  invoices = [],
  attendanceRecords = [],
  adjustments = [],
}) {
  const scopedInvoices = filterInvoicesForRange(invoices, { fromDate, toDate, branchId })
  const scopedAttendance = filterAttendanceForRange(attendanceRecords, { fromDate, toDate, branchId })
  const scopedAdjustments = filterAdjustmentsForRange(adjustments, { fromDate, toDate, branchId })
  const scopedEmployees = employees.filter((employee) => {
    if (branchId && !employeeBelongsToBranch(employee, branchId)) return false
    return isPayrollListEmployee(employee, '')
  })

  const byBranch = new Map()
  let total = 0

  for (const employee of scopedEmployees) {
    const row = computeEmployeePayrollRow(
      employee,
      scopedInvoices,
      scopedAttendance,
      scopedAdjustments,
    )
    total += row.netSalary
    const key = employee.branchId || 'unknown'
    byBranch.set(key, (byBranch.get(key) ?? 0) + row.netSalary)
  }

  return { total, byBranch }
}

export function resolveTotalSalary({
  ticketRevenue = 0,
  tips = 0,
  commission = 0,
  payrollByBranch,
  branchId = '',
}) {
  if (payrollByBranch?.byBranch?.size) {
    if (branchId) return payrollByBranch.byBranch.get(branchId) ?? 0
    return payrollByBranch.total ?? 0
  }
  return commission + tips
}

export function enrichProfitMetrics(row, payrollByBranch = null) {
  const ticketRevenue = Number(row.ticketRevenue ?? row.revenue ?? 0)
  const tips = Number(row.tips ?? 0)
  const commission = Number(row.commission ?? 0)
  const fixedExpenses = Number(row.fixedExpenses ?? 0)
  const variableExpenses = Number(row.variableExpenses ?? row.expenses ?? 0)
  const expenses = Number(
    row.expenses != null
      ? row.expenses
      : fixedExpenses + variableExpenses,
  )
  const branchId = row.branchId ?? ''

  const actualRevenue = computeActualRevenue(ticketRevenue, tips)
  const totalSalary = resolveTotalSalary({
    ticketRevenue,
    tips,
    commission,
    payrollByBranch,
    branchId,
  })
  const profit = computeProfitAmount(actualRevenue, totalSalary, expenses)

  return {
    ...row,
    ticketRevenue,
    tips,
    commission,
    fixedExpenses,
    variableExpenses: row.variableExpenses != null ? variableExpenses : Math.max(0, expenses - fixedExpenses),
    expenses,
    actualRevenue,
    totalSalary,
    salary: totalSalary,
    profit,
    profitMargin: computeProfitMarginPercent(actualRevenue, profit),
  }
}
