import { getTodayDate as getInvoiceTodayDate } from './invoiceStorage'
import {
  PAY_CYCLES,
  buildAdminEmployeeSummary,
  filterSalaryInvoices,
  getCurrentMonthValue,
  getPayPeriodRange,
} from './salaryReport'

export function computeEmployeePeriodStats(invoices, employeeId, { month, cycle = PAY_CYCLES.FULL, fromDate, toDate } = {}) {
  if (!employeeId) {
    return { invoiceCount: 0, serviceRevenue: 0, tips: 0, serviceCommission: 0, totalSalary: 0, serviceCount: 0 }
  }

  let rangeFrom = fromDate
  let rangeTo = toDate
  if (month && !fromDate && !toDate) {
    const range = getPayPeriodRange(month, cycle)
    rangeFrom = range.fromDate
    rangeTo = range.toDate
  }

  const filtered = filterSalaryInvoices(invoices, {
    fromDate: rangeFrom,
    toDate: rangeTo,
    employeeId,
  })

  const employeeInvoices = filtered.filter(
    (inv) => inv.employeeId === employeeId || inv.supportEmployeeId === employeeId,
  )

  return buildAdminEmployeeSummary(employeeInvoices, employeeId)
}

export function computeEmployeeTodayStats(invoices, employeeId) {
  const today = getInvoiceTodayDate()
  return computeEmployeePeriodStats(invoices, employeeId, { fromDate: today, toDate: today })
}

export function computeEmployeeListStats(invoices, employeeIds, month = getCurrentMonthValue()) {
  const map = new Map()
  for (const employeeId of employeeIds) {
    map.set(employeeId, computeEmployeePeriodStats(invoices, employeeId, { month, cycle: PAY_CYCLES.FULL }))
  }
  return map
}
