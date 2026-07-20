import { getInvoicePayment, getInvoiceTips } from '../invoice'
import { countUniqueCustomers } from '../drillDownReport'
import { buildDrillDownSummary } from '../drillDownReport'
import { computeAttendanceStats } from '../payrollLiveHelpers'
import { computeTopServices } from '../report'
import { getBranchById, loadBranches } from '../../constants/branches'
import { getEmployeeById } from '../employeeStorage'
import {
  computeSafeTrend,
  countInclusiveDays,
  safeDivide,
  safeRatePercent,
} from './periodCompare'

function customerKey(invoice) {
  const phone = (invoice.customerPhone ?? '').replace(/\D/g, '')
  const name = (invoice.customerName ?? '').trim().toLowerCase()
  if (phone) return `phone:${phone}`
  if (name) return `name:${name}`
  return `inv:${invoice.id}`
}

function filterByBranch(invoices, branchId) {
  if (!branchId) return invoices
  return invoices.filter((inv) => inv.branchId === branchId)
}

function primaryInvoicesForEmployee(invoices, employeeId) {
  return invoices.filter((inv) => inv.employeeId === employeeId)
}

function countRequestedCustomers(invoices) {
  const keys = new Set()
  for (const inv of invoices) {
    if (!inv.customerRequested) continue
    keys.add(customerKey(inv))
  }
  return keys.size
}

function buildBaseMetrics(invoices, daysInPeriod) {
  const revenue = invoices.reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
  const tips = invoices.reduce((sum, inv) => sum + getInvoiceTips(inv), 0)
  const totalCustomerCount = countUniqueCustomers(invoices)
  const requestedCustomerCount = countRequestedCustomers(invoices)
  const requestedRate = safeRatePercent(requestedCustomerCount, totalCustomerCount)
  const averageRevenuePerCustomer = safeDivide(revenue, totalCustomerCount)
  const averageRevenuePerDay = safeDivide(revenue, daysInPeriod)

  return {
    revenue,
    tips,
    totalCustomerCount,
    requestedCustomerCount,
    requestedRate,
    averageRevenuePerCustomer,
    averageRevenuePerDay,
    invoiceCount: invoices.length,
  }
}

function withTrends(current, previous) {
  return {
    ...current,
    revenueTrend: computeSafeTrend(current.revenue, previous?.revenue),
    customerTrend: computeSafeTrend(current.totalCustomerCount, previous?.totalCustomerCount),
    requestedRateTrend: computeSafeTrend(current.requestedRate, previous?.requestedRate),
    tipsTrend: computeSafeTrend(current.tips, previous?.tips),
    previous: previous
      ? {
          revenue: previous.revenue,
          totalCustomerCount: previous.totalCustomerCount,
          requestedCustomerCount: previous.requestedCustomerCount,
          requestedRate: previous.requestedRate,
          tips: previous.tips,
        }
      : null,
  }
}

/**
 * Branch management rows for selected period vs compare period.
 */
export function buildBranchManagementRows({
  invoices = [],
  previousInvoices = [],
  expenses = [],
  previousExpenses = [],
  fixedCosts = [],
  fromDate,
  toDate,
  previousFromDate,
  previousToDate,
  scopeBranchId = '',
}) {
  const days = countInclusiveDays(fromDate, toDate)
  const prevDays = countInclusiveDays(previousFromDate, previousToDate)
  const branches = loadBranches().filter((b) => b?.id && (!scopeBranchId || b.id === scopeBranchId))

  return branches.map((branch) => {
    const curInv = filterByBranch(invoices, branch.id)
    const prevInv = filterByBranch(previousInvoices, branch.id)
    const current = buildBaseMetrics(curInv, days)
    const previous = buildBaseMetrics(prevInv, prevDays)

    const curExp = expenses.filter((e) => e.branchId === branch.id)
    const prevExp = previousExpenses.filter((e) => e.branchId === branch.id)
    const summary = buildDrillDownSummary(
      curInv,
      curExp,
      { fromDate, toDate, branchId: branch.id },
      null,
      fixedCosts,
    )
    const prevSummary = buildDrillDownSummary(
      prevInv,
      prevExp,
      { fromDate: previousFromDate, toDate: previousToDate, branchId: branch.id },
      null,
      fixedCosts,
    )

    const profitAvailable = Number.isFinite(summary.profit)
    const row = withTrends(
      {
        ...current,
        id: branch.id,
        branchId: branch.id,
        name: getBranchById(branch.id)?.name || branch.name || branch.id,
        profit: profitAvailable ? summary.profit : null,
        profitAvailable,
        expenses: summary.expenses ?? 0,
        actualRevenue: summary.actualRevenue ?? current.revenue + current.tips,
      },
      {
        ...previous,
        profit: Number.isFinite(prevSummary.profit) ? prevSummary.profit : null,
      },
    )
    row.profitTrend = computeSafeTrend(row.profit, previous ? prevSummary.profit : null)
    return row
  }).sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
}

/**
 * Employee management rows.
 * Revenue / tips / requested: primary employee on invoice only (customerRequested flag).
 * Support role does not receive ticket revenue or requested credit.
 */
export function buildEmployeeManagementRows({
  invoices = [],
  previousInvoices = [],
  attendanceRecords = [],
  previousAttendanceRecords = [],
  fromDate,
  toDate,
  previousFromDate,
  previousToDate,
  scopeBranchId = '',
  employeeIds = null,
}) {
  const days = countInclusiveDays(fromDate, toDate)
  const employeeMap = new Map()

  const consider = (inv) => {
    const id = inv.employeeId
    if (!id) return
    if (scopeBranchId && inv.branchId !== scopeBranchId) return
    if (employeeIds && !employeeIds.has(id)) return
    if (!employeeMap.has(id)) {
      const emp = getEmployeeById(id)
      employeeMap.set(id, {
        id,
        name: emp?.name || inv.employeeName || id,
        branchId: emp?.branchId || inv.branchId || '',
        branchName: getBranchById(emp?.branchId || inv.branchId)?.name || inv.branchName || '—',
      })
    }
  }

  for (const inv of invoices) consider(inv)
  for (const inv of previousInvoices) consider(inv)

  if (employeeIds) {
    for (const id of employeeIds) {
      if (employeeMap.has(id)) continue
      const emp = getEmployeeById(id)
      if (!emp) continue
      if (scopeBranchId && emp.branchId !== scopeBranchId) continue
      employeeMap.set(id, {
        id,
        name: emp.name || id,
        branchId: emp.branchId || '',
        branchName: getBranchById(emp.branchId)?.name || '—',
      })
    }
  }

  const rows = [...employeeMap.values()].map((meta) => {
    const curInv = primaryInvoicesForEmployee(
      scopeBranchId ? filterByBranch(invoices, scopeBranchId) : invoices,
      meta.id,
    )
    const prevInv = primaryInvoicesForEmployee(
      scopeBranchId ? filterByBranch(previousInvoices, scopeBranchId) : previousInvoices,
      meta.id,
    )
    const current = buildBaseMetrics(curInv, days)
    const previous = buildBaseMetrics(prevInv, countInclusiveDays(previousFromDate, previousToDate))

    const att = computeAttendanceStats(attendanceRecords, meta.id)
    const prevAtt = computeAttendanceStats(previousAttendanceRecords, meta.id)
    const workDays = att.workDays ?? 0
    const averageRevenuePerWorkDay = safeDivide(current.revenue, workDays)

    return withTrends(
      {
        ...current,
        id: meta.id,
        employeeId: meta.id,
        name: meta.name,
        branchId: meta.branchId,
        branchName: meta.branchName,
        workDays,
        averageRevenuePerWorkDay,
        previousWorkDays: prevAtt.workDays ?? 0,
      },
      previous,
    )
  })

  // Rank within branch (by current branchId of employee profile / invoice activity)
  const byBranch = new Map()
  for (const row of rows) {
    const key = row.branchId || 'unknown'
    if (!byBranch.has(key)) byBranch.set(key, [])
    byBranch.get(key).push(row)
  }
  for (const list of byBranch.values()) {
    const byRevenue = [...list].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
    byRevenue.forEach((row, index) => {
      row.revenueRankInBranch = index + 1
      row.revenueRankTotal = byRevenue.length
    })
    const byRate = [...list].sort((a, b) => {
      const ar = a.requestedRate == null ? -1 : a.requestedRate
      const br = b.requestedRate == null ? -1 : b.requestedRate
      return br - ar
    })
    byRate.forEach((row, index) => {
      row.requestedRateRankInBranch = index + 1
      row.requestedRateRankTotal = byRate.length
    })
  }

  return rows.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
}

export function buildBranchEmployeeInsights(branchId, employeeRows, invoices, fromDate, toDate) {
  const inBranch = employeeRows.filter((row) => row.branchId === branchId)
  const withRevenue = inBranch.filter((row) => (row.revenue ?? 0) > 0 || row.revenueTrend?.direction === 'down')
  const gainers = [...inBranch]
    .filter((row) => row.revenueTrend?.direction === 'up' || row.revenueTrend?.direction === 'new')
    .sort((a, b) => (b.revenueTrend?.percent ?? 0) - (a.revenueTrend?.percent ?? 0))
  const losers = [...inBranch]
    .filter((row) => row.revenueTrend?.direction === 'down')
    .sort((a, b) => (b.revenueTrend?.percent ?? 0) - (a.revenueTrend?.percent ?? 0))

  const branchInvoices = filterByBranch(invoices, branchId)
  const topServices = computeTopServices(branchInvoices).slice(0, 8).map((s) => ({
    id: s.serviceId || s.serviceName,
    name: s.serviceName,
    revenue: s.ticketRevenue ?? 0,
    count: s.count ?? 0,
  }))

  return {
    employees: inBranch,
    topGainer: gainers[0] ?? null,
    topLoser: losers[0] ?? null,
    topServices,
    periodLabel: `${fromDate} → ${toDate}`,
    activeWithRevenue: withRevenue.length,
  }
}

export function buildEmployeeInvoiceList(invoices, employeeId) {
  return primaryInvoicesForEmployee(invoices, employeeId)
    .slice()
    .sort((a, b) => `${b.date}T${b.invoiceTime || ''}`.localeCompare(`${a.date}T${a.invoiceTime || ''}`))
    .map((inv) => ({
      id: inv.id,
      date: inv.date,
      time: inv.invoiceTime || '',
      customerName: inv.customerName || '—',
      customerRequested: Boolean(inv.customerRequested),
      revenue: getInvoicePayment(inv),
      tips: getInvoiceTips(inv),
      invoice: inv,
    }))
}

/** Daily revenue series for employee trend chart (simple bars). */
export function buildEmployeeDailyRevenue(invoices, employeeId, fromDate, toDate) {
  const map = new Map()
  const from = parseIsoDateSafe(fromDate)
  const to = parseIsoDateSafe(toDate)
  if (!from || !to) return []
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = formatDateKey(d)
    map.set(key, 0)
  }
  for (const inv of primaryInvoicesForEmployee(invoices, employeeId)) {
    if (!map.has(inv.date)) continue
    map.set(inv.date, (map.get(inv.date) ?? 0) + getInvoicePayment(inv))
  }
  return [...map.entries()].map(([date, revenue]) => ({ date, revenue }))
}

function parseIsoDateSafe(value) {
  if (!value) return null
  const [y, m, d] = String(value).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
