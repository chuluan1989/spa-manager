import {
  filterByUserBranch,
  filterByUserScope,
  getCurrentUserBranch,
  getCurrentUserName,
  isAdmin,
  isEmployee,
} from '../constants/auth'
import { getMonthStartDate, getTodayDate } from './invoiceStorage'
import { sumExpenseAmount } from './expenseStorage'

function getInvoiceTotal(invoice) {
  return Number.isFinite(invoice.total) ? invoice.total : 0
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
  const monthProfit = monthRevenue - monthExpenseTotal

  return {
    todayRevenue,
    monthRevenue,
    monthExpenses: monthExpenseTotal,
    monthProfit,
    todayInvoiceCount: todayInvoices.length,
    monthInvoiceCount: monthInvoices.length,
    branchLabel: isAdmin()
      ? 'Tất cả chi nhánh'
      : isEmployee()
        ? getCurrentUserName()
        : getCurrentUserBranch(),
  }
}
