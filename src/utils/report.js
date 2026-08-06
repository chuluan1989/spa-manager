import { getInvoiceServiceDetails, getInvoicePayment, getInvoiceServiceCommission, getInvoiceTips, getInvoiceCustomerTotal, invoiceHasDiscount, getServiceLineCommissionAmount } from './invoice'
import { aggregatePaymentMethodTotals } from './paymentMethodTotals'
import { invoiceMatchesPaymentMethodFilter } from '../constants/paymentMethods'
import {
  computeExpenseByBranch,
  filterExpenses,
  sumExpenseAmount,
} from './expenseStorage'
import { getMonthStartDate } from './invoiceStorage'
import {
  enrichProfitMetrics,
  resolveTotalSalary,
} from './profitReport'
import {
  computePeriodExpenseTotals,
  filterVariableExpenses,
} from './branchProfitBreakdown'

export { getMonthStartDate }

export function filterInvoices(invoices, {
  fromDate,
  toDate,
  branchId,
  employeeId,
  discountFilter = '',
  paymentMethod = '',
}) {
  return invoices.filter((inv) => {
    if (fromDate && inv.date < fromDate) return false
    if (toDate && inv.date > toDate) return false
    if (branchId && inv.branchId !== branchId) return false
    if (employeeId && inv.employeeId !== employeeId) return false
    if (discountFilter === 'with' && !invoiceHasDiscount(inv)) return false
    if (discountFilter === 'without' && invoiceHasDiscount(inv)) return false
    if (!invoiceMatchesPaymentMethodFilter(inv, paymentMethod)) return false
    return true
  })
}

function getInvoiceTicketRevenue(invoice) {
  return getInvoicePayment(invoice)
}

export function computeReportSummary(invoices) {
  const base = invoices.reduce(
    (acc, inv) => {
      const ticketRevenue = getInvoiceTicketRevenue(inv)
      acc.ticketRevenue += ticketRevenue
      acc.revenue += ticketRevenue
      acc.customerTotal += getInvoiceCustomerTotal(inv)
      acc.tips += getInvoiceTips(inv)
      acc.commission += getInvoiceServiceCommission(inv)
      acc.invoiceCount += 1
      return acc
    },
    {
      ticketRevenue: 0,
      revenue: 0,
      customerTotal: 0,
      tips: 0,
      commission: 0,
      invoiceCount: 0,
    },
  )
  const payments = aggregatePaymentMethodTotals(invoices)
  return {
    ...base,
    cashAmount: payments.cashAmount,
    bankTransferAmount: payments.bankTransferAmount,
    unknownPaymentAmount: payments.unknownAmount,
    totalCollected: payments.totalCollected,
    cashCount: payments.cashCount,
    bankTransferCount: payments.bankTransferCount,
    unknownPaymentCount: payments.unknownCount,
  }
}

export function computeBranchReport(invoices) {
  const map = new Map()

  for (const inv of invoices) {
    const key = inv.branchId || inv.branchName || 'unknown'
    const current = map.get(key) ?? {
      branchId: inv.branchId,
      branchName: inv.branchName || '—',
      invoiceCount: 0,
      ticketRevenue: 0,
      revenue: 0,
      customerTotal: 0,
      tips: 0,
      commission: 0,
      expenses: 0,
      profit: 0,
      _invoices: [],
    }

    const ticketRevenue = getInvoiceTicketRevenue(inv)
    current.invoiceCount += 1
    current.ticketRevenue += ticketRevenue
    current.revenue += ticketRevenue
    current.customerTotal += getInvoiceCustomerTotal(inv)
    current.tips += getInvoiceTips(inv)
    current.commission += getInvoiceServiceCommission(inv)
    current._invoices.push(inv)
    map.set(key, current)
  }

  return [...map.values()].map((row) => {
    const payments = aggregatePaymentMethodTotals(row._invoices)
    const { _invoices, ...rest } = row
    return {
      ...rest,
      cashAmount: payments.cashAmount,
      bankTransferAmount: payments.bankTransferAmount,
      unknownPaymentAmount: payments.unknownAmount,
      totalCollected: payments.totalCollected,
      cashRatePercent: payments.cashRatePercent,
      bankTransferRatePercent: payments.bankTransferRatePercent,
      cashCount: payments.cashCount,
      bankTransferCount: payments.bankTransferCount,
    }
  }).sort((a, b) => b.ticketRevenue - a.ticketRevenue)
}

function mergeBranchReports(revenueRows, expenseRows) {
  const map = new Map()

  for (const row of revenueRows) {
    map.set(row.branchId || row.branchName, { ...row, expenses: 0, profit: row.ticketRevenue })
  }

  for (const row of expenseRows) {
    const key = row.branchId || row.branchName
    const current = map.get(key) ?? {
      branchId: row.branchId,
      branchName: row.branchName,
      invoiceCount: 0,
      ticketRevenue: 0,
      revenue: 0,
      customerTotal: 0,
      tips: 0,
      commission: 0,
      expenses: 0,
      profit: 0,
    }
    current.expenses = row.total
    map.set(key, current)
  }

  for (const row of map.values()) {
    const enriched = enrichProfitMetrics(row)
    Object.assign(row, enriched)
  }

  return [...map.values()].sort((a, b) => b.ticketRevenue - a.ticketRevenue)
}

export function computeEmployeeReport(invoices) {
  const map = new Map()

  for (const inv of invoices) {
    const key = inv.employeeId || inv.employeeName || 'unknown'
    const ticketRevenue = getInvoiceTicketRevenue(inv)
    const current = map.get(key) ?? {
      employeeId: inv.employeeId,
      employeeName: inv.employeeName || '—',
      branchName: inv.branchName || '—',
      invoiceCount: 0,
      ticketRevenue: 0,
      revenue: 0,
      customerTotal: 0,
      tips: 0,
      commission: 0,
      salary: 0,
    }

    current.invoiceCount += 1
    current.ticketRevenue += ticketRevenue
    current.revenue += ticketRevenue
    current.customerTotal += getInvoiceCustomerTotal(inv)
    current.tips += getInvoiceTips(inv)
    current.commission += getInvoiceServiceCommission(inv)
    current.salary = current.commission + current.tips
    map.set(key, current)
  }

  return [...map.values()].sort((a, b) => b.ticketRevenue - a.ticketRevenue)
}

export function computeServiceReport(invoices) {
  const map = new Map()

  for (const inv of invoices) {
    const services = getInvoiceServiceDetails(inv)
    for (const service of services) {
      const key = service.id || service.name
      const current = map.get(key) ?? {
        serviceId: service.id,
        serviceName: service.name,
        count: 0,
        ticketRevenue: 0,
        revenue: 0,
        commission: 0,
      }

      current.count += 1
      current.ticketRevenue += service.price
      current.revenue += service.price
      current.commission += Number.isFinite(service.commissionAmount)
        ? service.commissionAmount
        : getServiceLineCommissionAmount(service, { branchId: inv.branchId })
      map.set(key, current)
    }
  }

  return [...map.values()].sort((a, b) => b.ticketRevenue - a.ticketRevenue)
}

export function computeTopServices(invoices) {
  return computeServiceReport(invoices).sort(
    (a, b) => b.count - a.count || b.ticketRevenue - a.ticketRevenue,
  )
}

export function computeTopEmployeesByServiceCount(invoices) {
  const map = new Map()

  for (const inv of invoices) {
    const key = inv.employeeId || inv.employeeName || 'unknown'
    const services = getInvoiceServiceDetails(inv)
    const ticketRevenue = getInvoiceTicketRevenue(inv)
    const current = map.get(key) ?? {
      employeeId: inv.employeeId,
      employeeName: inv.employeeName || '—',
      branchName: inv.branchName || '—',
      invoiceCount: 0,
      serviceCount: 0,
      ticketRevenue: 0,
      revenue: 0,
      tips: 0,
      commission: 0,
    }

    current.invoiceCount += 1
    current.serviceCount += services.length
    current.ticketRevenue += ticketRevenue
    current.revenue += ticketRevenue
    current.tips += getInvoiceTips(inv)
    current.commission += getInvoiceServiceCommission(inv)
    map.set(key, current)
  }

  return [...map.values()].sort(
    (a, b) => b.serviceCount - a.serviceCount || b.ticketRevenue - a.ticketRevenue,
  )
}

export function computeTopEmployeesByRevenue(invoices) {
  return computeEmployeeReport(invoices)
}

export function computeReportData(invoices, expenses, filters, payrollByBranch = null, fixedCosts = []) {
  const filtered = filterInvoices(invoices, filters)
  const filteredExpenses = filterVariableExpenses(filterExpenses(expenses, filters))
  const summary = computeReportSummary(filtered)
  const periodCosts = computePeriodExpenseTotals({ expenses, fixedCosts, filters })
  const totalSalary = resolveTotalSalary({ payrollByBranch })
  const profitSummary = enrichProfitMetrics({
    ...summary,
    fixedExpenses: periodCosts.fixedTotal,
    variableExpenses: periodCosts.variableTotal,
    expenses: periodCosts.total,
    salary: totalSalary,
    totalSalary,
  }, payrollByBranch)

  return {
    filtered,
    filteredExpenses,
    summary: profitSummary,
    byBranch: mergeBranchReports(
      computeBranchReport(filtered),
      computeExpenseByBranch(filteredExpenses),
    ),
    byEmployee: computeEmployeeReport(filtered),
    byService: computeServiceReport(filtered),
    topServices: computeTopServices(filtered),
    topEmployeesByServices: computeTopEmployeesByServiceCount(filtered),
    topEmployeesByRevenue: computeTopEmployeesByRevenue(filtered),
  }
}

export { sumExpenseAmount }
