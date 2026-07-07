import { getActiveEmployeesByBranch, getAllActiveEmployees } from './employeeStorage'
import { getInvoicePayment, getInvoiceServiceDetails, getInvoiceTips } from './invoice'
import { getMonthStartDate, getTodayDate } from './invoiceStorage'
import { sumExpenseAmount } from './expenseStorage'
import { computeBranchReport } from './report'

export const ADMIN_DASHBOARD_BRANCHES = [
  { id: 'vinh-long', displayName: 'Khoẻ Spa Vĩnh Long' },
  { id: 'tra-vinh', displayName: 'Khoẻ Spa Trà Vinh' },
  { id: 'soc-trang', displayName: 'Khoẻ Spa Sóc Trăng' },
  { id: 'bac-lieu', displayName: 'Khoẻ Spa Bạc Liêu' },
  { id: 'gia-lai-1', displayName: 'Gia Lai 1' },
  { id: 'gia-lai-2', displayName: 'Gia Lai 2' },
]

function getInvoiceServiceCommission(invoice) {
  return getInvoiceServiceDetails(invoice)
    .reduce((sum, service) => sum + Number(service.commissionAmount ?? 0), 0)
}

function getEmployeePay(invoice) {
  return getInvoiceServiceCommission(invoice) + getInvoiceTips(invoice)
}

function filterByDateRange(invoices, fromDate, toDate) {
  return invoices.filter((invoice) => {
    if (fromDate && invoice.date < fromDate) return false
    if (toDate && invoice.date > toDate) return false
    return true
  })
}

function countUniqueCustomers(invoices) {
  const customers = new Set()
  for (const invoice of invoices) {
    const name = (invoice.customerName ?? '').trim().toLowerCase()
    const phone = (invoice.customerPhone ?? '').replace(/\D/g, '')
    if (phone) customers.add(`phone:${phone}`)
    else if (name) customers.add(`name:${name}`)
  }
  return customers.size
}

function countActiveEmployeesToday(invoices, branchId = '') {
  const employeeIds = new Set()
  for (const invoice of invoices) {
    if (branchId && invoice.branchId !== branchId) continue
    if (invoice.employeeId) employeeIds.add(invoice.employeeId)
    if (invoice.supportEmployeeId) employeeIds.add(invoice.supportEmployeeId)
  }
  return employeeIds.size
}

function computeBranchCardStats(branchId, displayName, todayInvoices, monthInvoices, monthExpenses) {
  const branchToday = todayInvoices.filter((invoice) => invoice.branchId === branchId)
  const branchMonth = monthInvoices.filter((invoice) => invoice.branchId === branchId)
  const branchMonthExpenses = monthExpenses.filter((expense) => expense.branchId === branchId)

  const todayRevenue = branchToday.reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
  const monthRevenue = branchMonth.reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
  const monthTips = branchMonth.reduce((sum, inv) => sum + getInvoiceTips(inv), 0)
  const monthCommission = branchMonth.reduce((sum, inv) => sum + getInvoiceServiceCommission(inv), 0)
  const monthEmployeePay = branchMonth.reduce((sum, inv) => sum + getEmployeePay(inv), 0)
  const monthExpenseTotal = sumExpenseAmount(branchMonthExpenses)
  const profit = monthRevenue - monthExpenseTotal - monthEmployeePay

  return {
    branchId,
    displayName,
    todayRevenue,
    monthRevenue,
    invoiceCount: branchMonth.length,
    activeEmployeesToday: countActiveEmployeesToday(branchToday, branchId),
    activeEmployeesMonth: countActiveEmployeesToday(branchMonth, branchId),
    tips: monthTips,
    commission: monthCommission,
    profit,
  }
}

export function computeAdminDashboardStats(invoices, expenses) {
  const today = getTodayDate()
  const monthStart = getMonthStartDate()

  const todayInvoices = invoices.filter((invoice) => invoice.date === today)
  const monthInvoices = filterByDateRange(invoices, monthStart, today)
  const monthExpenses = filterByDateRange(expenses, monthStart, today)

  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
  const monthRevenue = monthInvoices.reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
  const monthTips = monthInvoices.reduce((sum, inv) => sum + getInvoiceTips(inv), 0)
  const monthCommission = monthInvoices.reduce((sum, inv) => sum + getInvoiceServiceCommission(inv), 0)
  const monthSalaryDue = monthInvoices.reduce((sum, inv) => sum + getEmployeePay(inv), 0)
  const monthExpenseTotal = sumExpenseAmount(monthExpenses)
  const monthProfit = monthRevenue - monthExpenseTotal - monthSalaryDue

  const activeEmployees = getAllActiveEmployees()
  const employeesWorkingToday = countActiveEmployeesToday(todayInvoices)
  const todayCustomers = countUniqueCustomers(todayInvoices)

  const branchCards = ADMIN_DASHBOARD_BRANCHES.map((branch) => (
    computeBranchCardStats(
      branch.id,
      branch.displayName,
      todayInvoices,
      monthInvoices,
      monthExpenses,
    )
  ))

  const topBranch = computeBranchReport(monthInvoices)[0] ?? null

  return {
    todayRevenue,
    monthRevenue,
    todayInvoiceCount: todayInvoices.length,
    monthInvoiceCount: monthInvoices.length,
    monthTips,
    monthCommission,
    monthSalaryDue,
    monthProfit,
    monthExpenses: monthExpenseTotal,
    totalActiveEmployees: activeEmployees.length,
    employeesWorkingToday,
    todayCustomers,
    branchCards,
    topBranch,
  }
}

export function getBranchEmployeeCount(branchId) {
  return getActiveEmployeesByBranch(branchId).length
}
