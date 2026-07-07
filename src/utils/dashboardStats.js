import {
  filterByUserBranch,
  filterByUserScope,
  getCurrentUserBranch,
  getCurrentUserName,
  isAdmin,
  isEmployee,
} from '../constants/auth'
import { getInvoiceServiceDetails } from './invoice'
import { getMonthStartDate, getTodayDate } from './invoiceStorage'
import { sumExpenseAmount } from './expenseStorage'
import {
  computeBranchReport,
  computeTopEmployeesByRevenue,
  computeTopServices,
} from './report'

function getInvoiceServiceCommission(invoice) {
  return getInvoiceServiceDetails(invoice)
    .reduce((sum, service) => sum + Number(service.commissionAmount ?? 0), 0)
}

function getInvoiceTips(invoice) {
  return Number.isFinite(invoice.tips) ? invoice.tips : 0
}

function getInvoiceTotal(invoice) {
  return Number.isFinite(invoice.total) ? invoice.total : 0
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

function scopeInvoices(invoices) {
  return filterByUserScope(invoices)
}

function scopeExpenses(expenses) {
  if (isEmployee()) return []
  return filterByUserBranch(expenses)
}

export function computeDashboardStats(invoices, expenses) {
  const scopedInvoices = scopeInvoices(invoices)
  const scopedExpenses = scopeExpenses(expenses)

  const today = getTodayDate()
  const monthStart = getMonthStartDate()

  const todayInvoices = scopedInvoices.filter((invoice) => invoice.date === today)
  const monthInvoices = filterByDateRange(scopedInvoices, monthStart, today)
  const monthExpenses = filterByDateRange(scopedExpenses, monthStart, today)

  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + getInvoiceTotal(inv), 0)
  const monthRevenue = monthInvoices.reduce((sum, inv) => sum + getInvoiceTotal(inv), 0)
  const monthExpenseTotal = sumExpenseAmount(monthExpenses)
  const monthServiceCommission = monthInvoices.reduce(
    (sum, inv) => sum + getInvoiceServiceCommission(inv),
    0,
  )
  const monthTips = monthInvoices.reduce((sum, inv) => sum + getInvoiceTips(inv), 0)
  const monthEmployeePay = monthInvoices.reduce((sum, inv) => sum + getEmployeePay(inv), 0)
  const monthProfit = monthRevenue - monthExpenseTotal - monthEmployeePay
  const topService = computeTopServices(monthInvoices)[0] ?? null
  const topEmployee = computeTopEmployeesByRevenue(monthInvoices)[0] ?? null
  const topBranch = computeBranchReport(monthInvoices)[0] ?? null

  return {
    todayRevenue,
    monthRevenue,
    monthExpenses: monthExpenseTotal,
    monthCommission: monthServiceCommission,
    monthTips,
    monthProfit,
    todayInvoiceCount: todayInvoices.length,
    monthInvoiceCount: monthInvoices.length,
    topService,
    topEmployee,
    topBranch,
    branchLabel: isAdmin()
      ? 'Tất cả chi nhánh'
      : isEmployee()
        ? getCurrentUserName()
        : getCurrentUserBranch(),
  }
}
