import { computeEmployeePayrollRow, computeEmployeePayrollBranchSections, computePayrollReport } from './payrollEngine'
import { collectEmployeeIdsWithRecordBranchActivity } from './employeeBranchTimeline'
import { isPayrollListEmployee, recordBelongsToBranch } from './branchEmployeeMatch'

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
  const monthFrom = fromDate ? String(fromDate).slice(0, 7) : ''
  const monthTo = toDate ? String(toDate).slice(0, 7) : ''
  return adjustments.filter((row) => {
    if (row.month) {
      if (monthFrom && row.month < monthFrom) return false
      if (monthTo && row.month > monthTo) return false
    }
    if (fromDate && row.date && row.date < fromDate) return false
    if (toDate && row.date && row.date > toDate) return false
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

/** Σ net từ cùng report.rows — nguồn duy nhất với Live Payroll / Salary UI. */
export function aggregatePayrollCostFromReport(report, { branchId = '' } = {}) {
  const byBranch = new Map()
  let total = 0
  for (const row of report?.rows ?? []) {
    const key = row.branchId || 'unknown'
    if (branchId && key !== branchId) continue
    const net = Number(row.netSalary ?? 0)
    total += net
    byBranch.set(key, (byBranch.get(key) ?? 0) + net)
  }
  return { total, byBranch }
}

/**
 * Tổng lương nhân viên theo chi nhánh trong kỳ (net salary từ payroll engine).
 * Nếu có month+cycle → ủy quyền computePayrollReport (cùng Salary UI).
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
  month = '',
  cycle = '',
  kpiPolicies = [],
}) {
  if (month && cycle) {
    const report = computePayrollReport({
      month,
      cycle,
      branchId: '',
      employeeId: '',
      employees,
      invoices,
      attendanceRecords,
      adjustments,
      kpiPolicies,
    })
    return aggregatePayrollCostFromReport(report, { branchId })
  }

  const scopedInvoices = filterInvoicesForRange(invoices, { fromDate, toDate, branchId })
  const scopedAttendance = filterAttendanceForRange(attendanceRecords, { fromDate, toDate, branchId })
  const scopedAdjustments = filterAdjustmentsForRange(adjustments, { fromDate, toDate, branchId })

  const activityIds = branchId
    ? collectEmployeeIdsWithRecordBranchActivity(branchId, [
        ...scopedInvoices,
        ...scopedAttendance,
        ...scopedAdjustments,
      ])
    : null

  const scopedEmployees = employees.filter((employee) => {
    if (activityIds && !activityIds.has(employee.id)) return false
    return isPayrollListEmployee(employee, '')
  })

  const byBranch = new Map()
  let total = 0

  for (const employee of scopedEmployees) {
    if (branchId) {
      const row = computeEmployeePayrollRow(
        employee,
        scopedInvoices,
        scopedAttendance,
        scopedAdjustments,
        { kpiPolicies, fromDate, toDate },
      )
      total += row.netSalary
      byBranch.set(branchId, (byBranch.get(branchId) ?? 0) + row.netSalary)
      continue
    }

    const empInvoices = filterInvoicesForRange(invoices, { fromDate, toDate, employeeId: employee.id })
    const empAttendance = filterAttendanceForRange(attendanceRecords, { fromDate, toDate, employeeId: employee.id })
    const empAdjustments = filterAdjustmentsForRange(adjustments, { fromDate, toDate, employeeId: employee.id })
    const sections = computeEmployeePayrollBranchSections(
      employee,
      empInvoices,
      empAttendance,
      empAdjustments,
    )

    if (sections?.length) {
      for (const section of sections) {
        total += section.netSalary ?? 0
        const key = section.branchId || 'unknown'
        byBranch.set(key, (byBranch.get(key) ?? 0) + (section.netSalary ?? 0))
      }
      continue
    }

    const row = computeEmployeePayrollRow(
      employee,
      empInvoices,
      empAttendance,
      empAdjustments,
      { kpiPolicies, fromDate, toDate },
    )
    total += row.netSalary
    const key = row.branchId || employee.branchId || 'unknown'
    byBranch.set(key, (byBranch.get(key) ?? 0) + row.netSalary)
  }

  return { total, byBranch }
}

/**
 * Chi phí nhân sự = Σ netSalary từ payroll engine.
 * Không fallback commission+tips (đó không phải bảng lương chính thức).
 */
export function resolveTotalSalary({
  payrollByBranch,
  branchId = '',
}) {
  if (!payrollByBranch) return 0
  if (branchId) return payrollByBranch.byBranch?.get(branchId) ?? 0
  return Number(payrollByBranch.total ?? 0)
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
  const totalSalary = resolveTotalSalary({ payrollByBranch, branchId })
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
