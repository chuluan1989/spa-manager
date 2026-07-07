import {
  getInvoiceDiscountAmount,
  getInvoicePayment,
  getInvoiceServiceDetails,
  getInvoiceTips,
} from './invoice'
import {
  computeExpenseByBranch,
  filterExpenses,
  sumExpenseAmount,
} from './expenseStorage'
import { getBranchName } from './branchStorage'
import { getEmployeeById } from './employeeStorage'
import { filterInvoices } from './report'

function getInvoiceCommission(invoice) {
  return getInvoiceServiceDetails(invoice)
    .reduce((sum, service) => sum + Number(service.commissionAmount ?? 0), 0)
}

export function countUniqueCustomers(invoices) {
  const customers = new Set()
  for (const invoice of invoices) {
    const name = (invoice.customerName ?? '').trim().toLowerCase()
    const phone = (invoice.customerPhone ?? '').replace(/\D/g, '')
    if (phone) customers.add(`phone:${phone}`)
    else if (name) customers.add(`name:${name}`)
    else customers.add(`inv:${invoice.id}`)
  }
  return customers.size
}

export function buildInvoiceMetrics(invoices) {
  return invoices.reduce(
    (acc, inv) => {
      const ticketRevenue = getInvoicePayment(inv)
      acc.ticketRevenue += ticketRevenue
      acc.customerTotal += ticketRevenue + getInvoiceTips(inv)
      acc.tips += getInvoiceTips(inv)
      acc.discount += getInvoiceDiscountAmount(inv)
      acc.commission += getInvoiceCommission(inv)
      acc.invoiceCount += 1
      return acc
    },
    {
      ticketRevenue: 0,
      customerTotal: 0,
      tips: 0,
      discount: 0,
      commission: 0,
      invoiceCount: 0,
    },
  )
}

export function buildDrillDownSummary(invoices, expenses, filters = {}) {
  const filtered = filterInvoices(invoices, filters)
  const filteredExpenses = filterExpenses(expenses, filters)
  const metrics = buildInvoiceMetrics(filtered)
  const expenseTotal = sumExpenseAmount(filteredExpenses)
  const salary = metrics.commission + metrics.tips

  return {
    ...metrics,
    revenue: metrics.ticketRevenue,
    payment: metrics.ticketRevenue,
    expenses: expenseTotal,
    salary,
    profit: metrics.ticketRevenue - expenseTotal - metrics.commission,
    customerCount: countUniqueCustomers(filtered),
    filtered,
    filteredExpenses,
  }
}

function mergeExpenseIntoRows(rows, expenseRows, keyFn) {
  const map = new Map()
  for (const row of rows) {
    map.set(keyFn(row), { ...row, expenses: 0 })
  }
  for (const expRow of expenseRows) {
    const key = keyFn(expRow)
    const current = map.get(key) ?? {
      ...expRow,
      ticketRevenue: 0,
      customerTotal: 0,
      tips: 0,
      discount: 0,
      commission: 0,
      invoiceCount: 0,
      customerCount: 0,
      salary: 0,
      profit: 0,
      expenses: 0,
    }
    current.expenses = expRow.total ?? expRow.expenses ?? 0
    map.set(key, current)
  }

  for (const row of map.values()) {
    row.salary = row.commission + row.tips
    row.revenue = row.ticketRevenue
    row.payment = row.ticketRevenue
    row.profit = row.ticketRevenue - (row.expenses ?? 0) - row.commission
  }

  return [...map.values()].sort((a, b) => b.ticketRevenue - a.ticketRevenue)
}

export function buildBranchDrillRows(invoices, expenses, filters = {}) {
  const filtered = filterInvoices(invoices, filters)
  const filteredExpenses = filterExpenses(expenses, filters)
  const map = new Map()

  for (const inv of filtered) {
    const key = inv.branchId || inv.branchName || 'unknown'
    const ticketRevenue = getInvoicePayment(inv)
    const current = map.get(key) ?? {
      branchId: inv.branchId,
      branchName: inv.branchName || getBranchName(inv.branchId) || '—',
      ticketRevenue: 0,
      customerTotal: 0,
      tips: 0,
      discount: 0,
      commission: 0,
      invoiceCount: 0,
      invoices: [],
    }
    current.ticketRevenue += ticketRevenue
    current.customerTotal += ticketRevenue + getInvoiceTips(inv)
    current.tips += getInvoiceTips(inv)
    current.discount += getInvoiceDiscountAmount(inv)
    current.commission += getInvoiceCommission(inv)
    current.invoiceCount += 1
    current.invoices.push(inv)
    map.set(key, current)
  }

  const revenueRows = [...map.values()].map((row) => ({
    ...row,
    revenue: row.ticketRevenue,
    payment: row.ticketRevenue,
    salary: row.commission + row.tips,
    customerCount: countUniqueCustomers(row.invoices),
    invoices: undefined,
  }))

  const expenseRows = computeExpenseByBranch(filteredExpenses).map((row) => ({
    ...row,
    total: row.total,
  }))

  return mergeExpenseIntoRows(
    revenueRows,
    expenseRows,
    (row) => row.branchId || row.branchName,
  )
}

export function buildEmployeeDrillRows(invoices, filters = {}) {
  const filtered = filterInvoices(invoices, filters)
  const map = new Map()

  for (const inv of filtered) {
    const employeeId = inv.employeeId
    if (!employeeId) continue

    const employee = getEmployeeById(employeeId)
    const ticketRevenue = getInvoicePayment(inv)
    const current = map.get(employeeId) ?? {
      employeeId,
      employeeName: employee?.name ?? inv.employeeName ?? '—',
      branchId: employee?.branchId ?? inv.branchId,
      branchName: employee?.branchId
        ? getBranchName(employee.branchId)
        : inv.branchName || '—',
      ticketRevenue: 0,
      customerTotal: 0,
      tips: 0,
      discount: 0,
      commission: 0,
      invoiceCount: 0,
      customers: new Set(),
    }

    current.ticketRevenue += ticketRevenue
    current.customerTotal += ticketRevenue + getInvoiceTips(inv)
    current.tips += getInvoiceTips(inv)
    current.discount += getInvoiceDiscountAmount(inv)
    current.commission += getInvoiceCommission(inv)
    current.invoiceCount += 1

    const name = (inv.customerName ?? '').trim().toLowerCase()
    const phone = (inv.customerPhone ?? '').replace(/\D/g, '')
    if (phone) current.customers.add(`phone:${phone}`)
    else if (name) current.customers.add(`name:${name}`)

    map.set(employeeId, current)
  }

  return [...map.values()]
    .map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      branchId: row.branchId,
      branchName: row.branchName,
      ticketRevenue: row.ticketRevenue,
      payment: row.ticketRevenue,
      revenue: row.ticketRevenue,
      customerTotal: row.customerTotal,
      tips: row.tips,
      discount: row.discount,
      commission: row.commission,
      salary: row.commission + row.tips,
      invoiceCount: row.invoiceCount,
      customerCount: row.customers.size,
    }))
    .sort((a, b) => b.ticketRevenue - a.ticketRevenue)
}

/** KPI Dashboard — không trùng lặp doanh thu tiền vé / tổng khách thanh toán. */
export const DRILL_METRICS = [
  { id: 'ticketRevenue', label: 'Doanh thu tiền vé' },
  { id: 'tips', label: 'Tips' },
  { id: 'customerTotal', label: 'Tổng khách thanh toán' },
  { id: 'commission', label: 'Hoa hồng' },
  { id: 'expenses', label: 'Chi phí' },
  { id: 'profit', label: 'Lợi nhuận dự kiến' },
]

export const EMPLOYEE_DRILL_METRICS = [
  { id: 'ticketRevenue', label: 'Doanh thu tiền vé' },
  { id: 'tips', label: 'Tips' },
  { id: 'commission', label: 'Hoa hồng' },
  { id: 'salary', label: 'Tổng lương' },
  { id: 'customerCount', label: 'Số khách' },
  { id: 'invoiceCount', label: 'Số hóa đơn' },
]

export function getDrillLevelConfig(role) {
  if (role === 'admin') {
    return {
      levels: ['system', 'branch', 'employee', 'invoices', 'invoice'],
      rootLevel: 'system',
      rootLabel: 'Toàn hệ thống',
    }
  }
  if (role === 'branch_manager') {
    return {
      levels: ['branch', 'employee', 'invoices', 'invoice'],
      rootLevel: 'branch',
      rootLabel: 'Chi nhánh',
    }
  }
  return {
    levels: ['employee', 'invoices', 'invoice'],
    rootLevel: 'employee',
    rootLabel: 'Cá nhân',
  }
}
