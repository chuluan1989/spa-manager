import { formatCurrency } from '../invoice'
import {
  buildBranchDrillRows,
  buildDrillDownSummary,
} from '../drillDownReport'
import {
  computeTopEmployeesByRevenue,
  computeTopServices,
} from '../report'
import { computeTrend, filterInvoicesByDate, getPreviousPeriod } from './copilotTrends'

/**
 * Compact performance strip for Copilot Tầng 2.
 */
export function buildCopilotPerformance({
  today,
  invoices = [],
  expenses = [],
  fixedCosts = [],
  scopeBranchId = '',
}) {
  const yesterday = getPreviousPeriod(today, today).fromDate
  const monthStart = `${today.slice(0, 7)}-01`

  const filtersToday = { fromDate: today, toDate: today, branchId: scopeBranchId || '' }
  const filtersYday = { fromDate: yesterday, toDate: yesterday, branchId: scopeBranchId || '' }
  const filtersMonth = { fromDate: monthStart, toDate: today, branchId: scopeBranchId || '' }

  const todayInvoices = filterInvoicesByDate(invoices, today, today)
  const ydayInvoices = filterInvoicesByDate(invoices, yesterday, yesterday)
  const monthInvoices = filterInvoicesByDate(invoices, monthStart, today)

  const scopedToday = scopeBranchId
    ? todayInvoices.filter((i) => i.branchId === scopeBranchId)
    : todayInvoices
  const scopedYday = scopeBranchId
    ? ydayInvoices.filter((i) => i.branchId === scopeBranchId)
    : ydayInvoices
  const scopedMonth = scopeBranchId
    ? monthInvoices.filter((i) => i.branchId === scopeBranchId)
    : monthInvoices

  const monthExpenses = (expenses ?? []).filter((e) => {
    const d = e?.date ?? ''
    return d >= monthStart && d <= today && (!scopeBranchId || e.branchId === scopeBranchId)
  })

  const summaryToday = buildDrillDownSummary(scopedToday, [], filtersToday, null, [])
  const summaryYday = buildDrillDownSummary(scopedYday, [], filtersYday, null, [])
  const summaryMonth = buildDrillDownSummary(scopedMonth, monthExpenses, filtersMonth, null, fixedCosts)

  const revenueTrend = computeTrend(summaryToday.ticketRevenue, summaryYday.ticketRevenue)
  const prevMonthPeriod = getPreviousPeriod(monthStart, today)
  const prevMonthInvoices = filterInvoicesByDate(
    invoices,
    prevMonthPeriod.fromDate,
    prevMonthPeriod.toDate,
  )
  const prevMonthScoped = scopeBranchId
    ? prevMonthInvoices.filter((i) => i.branchId === scopeBranchId)
    : prevMonthInvoices
  const prevMonthExpenses = (expenses ?? []).filter((e) => {
    const d = e?.date ?? ''
    return d >= prevMonthPeriod.fromDate && d <= prevMonthPeriod.toDate
      && (!scopeBranchId || e.branchId === scopeBranchId)
  })
  const summaryPrevMonth = buildDrillDownSummary(
    prevMonthScoped,
    prevMonthExpenses,
    {
      fromDate: prevMonthPeriod.fromDate,
      toDate: prevMonthPeriod.toDate,
      branchId: scopeBranchId || '',
    },
    null,
    fixedCosts,
  )
  const monthProfitTrend = computeTrend(summaryMonth.profit, summaryPrevMonth.profit)

  const branchRows = buildBranchDrillRows(scopedMonth, monthExpenses, filtersMonth, null, fixedCosts)
    .sort((a, b) => (b.ticketRevenue ?? 0) - (a.ticketRevenue ?? 0))
    .slice(0, 5)
    .map((row) => ({
      id: row.branchId,
      name: row.branchName || row.branchId,
      value: row.ticketRevenue ?? 0,
      label: formatCurrency(row.ticketRevenue ?? 0),
    }))

  const topEmployees = computeTopEmployeesByRevenue(scopedMonth)
    .slice(0, 5)
    .map((row) => ({
      id: row.employeeId || row.employeeName,
      name: row.employeeName || '—',
      value: row.ticketRevenue ?? 0,
      label: formatCurrency(row.ticketRevenue ?? 0),
    }))

  const topServices = computeTopServices(scopedMonth)
    .slice(0, 5)
    .map((row) => ({
      id: row.serviceId || row.serviceName,
      name: row.serviceName || '—',
      value: row.ticketRevenue ?? 0,
      label: formatCurrency(row.ticketRevenue ?? 0),
      count: row.count ?? 0,
    }))

  return {
    ticketRevenueToday: summaryToday.ticketRevenue ?? 0,
    ticketRevenueTodayLabel: formatCurrency(summaryToday.ticketRevenue ?? 0),
    revenueTrend,
    profitMonth: summaryMonth.profit ?? 0,
    profitMonthLabel: formatCurrency(summaryMonth.profit ?? 0),
    profitTrend: monthProfitTrend,
    topBranches: branchRows,
    topEmployees,
    topServices,
  }
}
