import { getInvoiceServiceDetails, getInvoiceServiceTotal } from './invoice'
import {
  computeExpenseByBranch,
  computeExpenseSummary,
  filterExpenses,
  sumExpenseAmount,
} from './expenseStorage'
import { getMonthStartDate } from './invoiceStorage'

export { getMonthStartDate }

export function filterInvoices(invoices, { fromDate, toDate, branchId, employeeId }) {
  return invoices.filter((inv) => {
    if (fromDate && inv.date < fromDate) return false
    if (toDate && inv.date > toDate) return false
    if (branchId && inv.branchId !== branchId) return false
    if (employeeId && inv.employeeId !== employeeId) return false
    return true
  })
}

function getInvoiceTips(invoice) {
  return Number.isFinite(invoice.tips) ? invoice.tips : 0
}

function getInvoiceServiceCommission(invoice) {
  return getInvoiceServiceDetails(invoice)
    .reduce((sum, service) => sum + (service.commissionAmount ?? 0), 0)
}

function getInvoiceTotal(invoice) {
  return Number.isFinite(invoice.total) ? invoice.total : 0
}

export function computeReportSummary(invoices) {
  return invoices.reduce(
    (acc, inv) => {
      acc.revenue += getInvoiceTotal(inv)
      acc.serviceTotal += getInvoiceServiceTotal(inv)
      acc.tips += getInvoiceTips(inv)
      acc.commission += getInvoiceServiceCommission(inv)
      acc.invoiceCount += 1
      return acc
    },
    { revenue: 0, serviceTotal: 0, tips: 0, commission: 0, invoiceCount: 0 },
  )
}

export function computeBranchReport(invoices) {
  const map = new Map()

  for (const inv of invoices) {
    const key = inv.branchId || inv.branchName || 'unknown'
    const current = map.get(key) ?? {
      branchId: inv.branchId,
      branchName: inv.branchName || '—',
      invoiceCount: 0,
      revenue: 0,
      tips: 0,
      commission: 0,
      expenses: 0,
      profit: 0,
    }

    current.invoiceCount += 1
    current.revenue += getInvoiceTotal(inv)
    current.tips += getInvoiceTips(inv)
    current.commission += getInvoiceServiceCommission(inv)
    map.set(key, current)
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

function mergeBranchReports(revenueRows, expenseRows) {
  const map = new Map()

  for (const row of revenueRows) {
    map.set(row.branchId || row.branchName, { ...row, expenses: 0, profit: row.revenue })
  }

  for (const row of expenseRows) {
    const key = row.branchId || row.branchName
    const current = map.get(key) ?? {
      branchId: row.branchId,
      branchName: row.branchName,
      invoiceCount: 0,
      revenue: 0,
      tips: 0,
      commission: 0,
      expenses: 0,
      profit: 0,
    }
    current.expenses = row.total
    current.profit = current.revenue - current.expenses
    map.set(key, current)
  }

  for (const row of map.values()) {
    row.profit = row.revenue - (row.expenses ?? 0)
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

export function computeEmployeeReport(invoices) {
  const map = new Map()

  for (const inv of invoices) {
    const key = inv.employeeId || inv.employeeName || 'unknown'
    const current = map.get(key) ?? {
      employeeId: inv.employeeId,
      employeeName: inv.employeeName || '—',
      branchName: inv.branchName || '—',
      invoiceCount: 0,
      revenue: 0,
      tips: 0,
      commission: 0,
    }

    current.invoiceCount += 1
    current.revenue += getInvoiceTotal(inv)
    current.tips += getInvoiceTips(inv)
    current.commission += getInvoiceServiceCommission(inv)
    map.set(key, current)
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
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
        revenue: 0,
        commission: 0,
      }

      current.count += 1
      current.revenue += service.price
      current.commission += service.commissionAmount ?? 0
      map.set(key, current)
    }
  }

  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

export function computeTopServices(invoices) {
  return computeServiceReport(invoices).sort(
    (a, b) => b.count - a.count || b.revenue - a.revenue,
  )
}

export function computeTopEmployeesByServiceCount(invoices) {
  const map = new Map()

  for (const inv of invoices) {
    const key = inv.employeeId || inv.employeeName || 'unknown'
    const services = getInvoiceServiceDetails(inv)
    const current = map.get(key) ?? {
      employeeId: inv.employeeId,
      employeeName: inv.employeeName || '—',
      branchName: inv.branchName || '—',
      invoiceCount: 0,
      serviceCount: 0,
      revenue: 0,
      tips: 0,
      commission: 0,
    }

    current.invoiceCount += 1
    current.serviceCount += services.length
    current.revenue += getInvoiceTotal(inv)
    current.tips += getInvoiceTips(inv)
    current.commission += getInvoiceServiceCommission(inv)
    map.set(key, current)
  }

  return [...map.values()].sort(
    (a, b) => b.serviceCount - a.serviceCount || b.revenue - a.revenue,
  )
}

export function computeTopEmployeesByRevenue(invoices) {
  return computeEmployeeReport(invoices)
}

export function computeReportData(invoices, expenses, filters) {
  const filtered = filterInvoices(invoices, filters)
  const filteredExpenses = filterExpenses(expenses, filters)
  const summary = computeReportSummary(filtered)
  const expenseSummary = computeExpenseSummary(filteredExpenses)
  const expenseTotal = expenseSummary.total

  return {
    filtered,
    filteredExpenses,
    summary: {
      ...summary,
      expenses: expenseTotal,
      profit: summary.revenue - expenseTotal,
    },
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
