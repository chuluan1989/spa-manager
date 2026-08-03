import { getInvoicePayment, getInvoiceTips, getInvoiceServiceDetails } from '../invoice'
import { aggregatePaymentMethodTotals } from '../paymentMethodTotals'
import { countUniqueCustomers } from '../drillDownReport'
import { buildDrillDownSummary } from '../drillDownReport'
import { computeAttendanceStats } from '../payrollLiveHelpers'
import { computeTopServices } from '../report'
import { getBranchById, loadBranches } from '../../constants/branches'
import { getEmployeeById } from '../employeeStorage'
import { getPayrollBranchDisplayTitle } from '../../constants/branchPayrollDisplay'
import { buildAdminEmployeeSummary } from '../salaryReport'
import {
  computeSafeTrend,
  countInclusiveDays,
  safeDivide,
  safeRatePercent,
} from './periodCompare'

/** Drill modes for employee invoice lists in Management Reports. */
export const EMPLOYEE_INVOICE_DRILL_MODES = {
  PRIMARY: 'primary',
  SUPPORT: 'support',
  REQUESTED: 'requested',
  ALL: 'all',
}

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

function supportInvoicesForEmployee(invoices, employeeId) {
  return invoices.filter((inv) => inv.supportEmployeeId === employeeId)
}

function scopedInvoices(invoices, scopeBranchId) {
  return scopeBranchId ? filterByBranch(invoices, scopeBranchId) : invoices
}

function ensureEmployeeMeta(employeeMap, employeeId, inv, scopeBranchId) {
  if (!employeeId || employeeMap.has(employeeId)) return
  const emp = getEmployeeById(employeeId)
  const displayBranchId = scopeBranchId || emp?.branchId || inv?.branchId || ''
  employeeMap.set(employeeId, {
    id: employeeId,
    name: emp?.name || (inv?.employeeId === employeeId ? inv.employeeName : inv?.supportEmployeeName) || employeeId,
    branchId: displayBranchId,
    branchName: scopeBranchId
      ? getPayrollBranchDisplayTitle(scopeBranchId, getBranchById(scopeBranchId)?.name)
      : (getBranchById(emp?.branchId || inv?.branchId)?.name || inv?.branchName || '—'),
  })
}

function countRequestedCustomers(invoices) {
  const keys = new Set()
  for (const inv of invoices) {
    if (!inv.customerRequested) continue
    keys.add(customerKey(inv))
  }
  return keys.size
}

function countRequestedTours(invoices) {
  return invoices.filter((inv) => inv.customerRequested).length
}

function buildBaseMetrics(invoices, daysInPeriod) {
  const revenue = invoices.reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
  const tips = invoices.reduce((sum, inv) => sum + getInvoiceTips(inv), 0)
  const totalCustomerCount = countUniqueCustomers(invoices)
  const requestedCustomerCount = countRequestedCustomers(invoices)
  const requestedRate = safeRatePercent(requestedCustomerCount, totalCustomerCount)
  const customerRequestedTourCount = countRequestedTours(invoices)
  const customerRequestedTourRate = safeRatePercent(customerRequestedTourCount, invoices.length)
  const averageRevenuePerCustomer = safeDivide(revenue, totalCustomerCount)
  const averageRevenuePerDay = safeDivide(revenue, daysInPeriod)
  const averageTicket = safeDivide(revenue, invoices.length)
  const payments = aggregatePaymentMethodTotals(invoices)

  return {
    revenue,
    tips,
    totalCustomerCount,
    requestedCustomerCount,
    requestedRate,
    customerRequestedTourCount,
    customerRequestedTourRate,
    averageRevenuePerCustomer,
    averageRevenuePerDay,
    averageTicket,
    invoiceCount: invoices.length,
    cashAmount: payments.cashAmount,
    bankTransferAmount: payments.bankTransferAmount,
    unknownPaymentAmount: payments.unknownAmount,
    totalCollected: payments.totalCollected,
    cashCount: payments.cashCount,
    bankTransferCount: payments.bankTransferCount,
    unknownPaymentCount: payments.unknownCount,
    cashRatePercent: payments.cashRatePercent,
    bankTransferRatePercent: payments.bankTransferRatePercent,
  }
}

function withTrends(current, previous) {
  return {
    ...current,
    revenueTrend: computeSafeTrend(current.revenue, previous?.revenue),
    customerTrend: computeSafeTrend(current.totalCustomerCount, previous?.totalCustomerCount),
    requestedRateTrend: computeSafeTrend(current.requestedRate, previous?.requestedRate),
    customerRequestedTourRateTrend: computeSafeTrend(
      current.customerRequestedTourRate,
      previous?.customerRequestedTourRate,
    ),
    tipsTrend: computeSafeTrend(current.tips, previous?.tips),
    averageTicketTrend: computeSafeTrend(current.averageTicket, previous?.averageTicket),
    previous: previous
      ? {
          revenue: previous.revenue,
          totalCustomerCount: previous.totalCustomerCount,
          requestedCustomerCount: previous.requestedCustomerCount,
          requestedRate: previous.requestedRate,
          customerRequestedTourCount: previous.customerRequestedTourCount,
          customerRequestedTourRate: previous.customerRequestedTourRate,
          tips: previous.tips,
          averageTicket: previous.averageTicket,
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
 * Tours: main (employeeId) + support (supportEmployeeId) kept separate; total = sum.
 * Salary: commission (+ tips for primary) across both roles via salaryReport rules.
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
  const currentScoped = scopedInvoices(invoices, scopeBranchId)
  const previousScoped = scopedInvoices(previousInvoices, scopeBranchId)

  const considerInvoice = (inv) => {
    if (scopeBranchId && inv.branchId !== scopeBranchId) return
    for (const id of [inv.employeeId, inv.supportEmployeeId].filter(Boolean)) {
      if (employeeIds && !employeeIds.has(id)) continue
      ensureEmployeeMeta(employeeMap, id, inv, scopeBranchId)
    }
  }

  for (const inv of invoices) considerInvoice(inv)
  for (const inv of previousInvoices) considerInvoice(inv)

  if (employeeIds) {
    for (const id of employeeIds) {
      if (employeeMap.has(id)) continue
      const emp = getEmployeeById(id)
      if (!emp) continue
      ensureEmployeeMeta(employeeMap, id, { branchId: emp.branchId, employeeName: emp.name }, scopeBranchId)
    }
  }

  const rows = [...employeeMap.values()].map((meta) => {
    const curPrimary = primaryInvoicesForEmployee(currentScoped, meta.id)
    const curSupport = supportInvoicesForEmployee(currentScoped, meta.id)
    const prevPrimary = primaryInvoicesForEmployee(previousScoped, meta.id)
    const prevSupport = supportInvoicesForEmployee(previousScoped, meta.id)

    const current = buildBaseMetrics(curPrimary, days)
    const previous = buildBaseMetrics(prevPrimary, countInclusiveDays(previousFromDate, previousToDate))

    const mainTourCount = curPrimary.length
    const supportTourCount = curSupport.length
    const totalTourCount = mainTourCount + supportTourCount
    const prevMainTourCount = prevPrimary.length
    const prevSupportTourCount = prevSupport.length
    const prevTotalTourCount = prevMainTourCount + prevSupportTourCount

    const salaryInvoices = [...curPrimary, ...curSupport]
    const salarySummary = buildAdminEmployeeSummary(salaryInvoices, meta.id)
    const totalSalary = salarySummary.totalSalary ?? 0
    const prevSalarySummary = buildAdminEmployeeSummary([...prevPrimary, ...prevSupport], meta.id)
    const previousTotalSalary = prevSalarySummary.totalSalary ?? 0

    const att = computeAttendanceStats(attendanceRecords, meta.id)
    const prevAtt = computeAttendanceStats(previousAttendanceRecords, meta.id)
    const workDays = att.workDays ?? 0
    const averageRevenuePerWorkDay = safeDivide(current.revenue, workDays)

    const row = withTrends(
      {
        ...current,
        // invoiceCount = Tổng tour (chính + hỗ trợ) — cột tổng hợp
        invoiceCount: totalTourCount,
        mainTourCount,
        supportTourCount,
        totalTourCount,
        totalSalary,
        id: meta.id,
        employeeId: meta.id,
        name: meta.name,
        branchId: meta.branchId,
        branchName: meta.branchName,
        workDays,
        averageRevenuePerWorkDay,
        previousWorkDays: prevAtt.workDays ?? 0,
      },
      {
        ...previous,
        invoiceCount: prevTotalTourCount,
        mainTourCount: prevMainTourCount,
        supportTourCount: prevSupportTourCount,
        totalTourCount: prevTotalTourCount,
        totalSalary: previousTotalSalary,
      },
    )
    row.totalSalaryTrend = computeSafeTrend(totalSalary, previous ? previousTotalSalary : null)
    if (row.previous) {
      row.previous.mainTourCount = prevMainTourCount
      row.previous.supportTourCount = prevSupportTourCount
      row.previous.totalTourCount = prevTotalTourCount
      row.previous.totalSalary = previousTotalSalary
    }
    return row
  })

  // Rank within scoped branch (record.branch_id), not employee.current_branch
  const rankGroupKey = scopeBranchId || 'all'
  const rankList = scopeBranchId ? rows : rows
  const byBranch = new Map([[rankGroupKey, rankList]])
  for (const list of byBranch.values()) {
    const byRevenue = [...list].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
    byRevenue.forEach((row, index) => {
      row.revenueRankInBranch = index + 1
      row.revenueRankTotal = byRevenue.length
    })
    const byTourRate = [...list].sort((a, b) => {
      const ar = a.customerRequestedTourRate == null ? -1 : a.customerRequestedTourRate
      const br = b.customerRequestedTourRate == null ? -1 : b.customerRequestedTourRate
      return br - ar
    })
    byTourRate.forEach((row, index) => {
      row.requestedTourRateRankInBranch = index + 1
      row.requestedTourRateRankTotal = byTourRate.length
    })
    const byTourCount = [...list].sort(
      (a, b) => (b.customerRequestedTourCount ?? 0) - (a.customerRequestedTourCount ?? 0),
    )
    byTourCount.forEach((row, index) => {
      row.requestedTourCountRankInBranch = index + 1
      row.requestedTourCountRankTotal = byTourCount.length
    })
  }

  return rows.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
}

export function buildBranchEmployeeInsights(branchId, employeeRows, invoices, fromDate, toDate) {
  const branchInvoices = filterByBranch(invoices, branchId)
  const activeIds = new Set(
    branchInvoices.map((inv) => inv.employeeId).filter(Boolean),
  )
  const inBranch = employeeRows.filter((row) => activeIds.has(row.id ?? row.employeeId))
  const withRevenue = inBranch.filter((row) => (row.revenue ?? 0) > 0 || row.revenueTrend?.direction === 'down')
  const gainers = [...inBranch]
    .filter((row) => row.revenueTrend?.direction === 'up' || row.revenueTrend?.direction === 'new')
    .sort((a, b) => (b.revenueTrend?.percent ?? 0) - (a.revenueTrend?.percent ?? 0))
  const losers = [...inBranch]
    .filter((row) => row.revenueTrend?.direction === 'down')
    .sort((a, b) => (b.revenueTrend?.percent ?? 0) - (a.revenueTrend?.percent ?? 0))

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

/**
 * Invoice list for employee drill-down.
 * @param {'primary'|'support'|'requested'|'all'} [mode]
 */
export function buildEmployeeInvoiceList(invoices, employeeId, mode = EMPLOYEE_INVOICE_DRILL_MODES.PRIMARY) {
  let list
  if (mode === EMPLOYEE_INVOICE_DRILL_MODES.SUPPORT) {
    list = supportInvoicesForEmployee(invoices, employeeId)
  } else if (mode === EMPLOYEE_INVOICE_DRILL_MODES.REQUESTED) {
    list = primaryInvoicesForEmployee(invoices, employeeId).filter((inv) => inv.customerRequested)
  } else if (mode === EMPLOYEE_INVOICE_DRILL_MODES.ALL) {
    const seen = new Set()
    list = []
    for (const inv of [
      ...primaryInvoicesForEmployee(invoices, employeeId),
      ...supportInvoicesForEmployee(invoices, employeeId),
    ]) {
      if (seen.has(inv.id)) continue
      seen.add(inv.id)
      list.push(inv)
    }
  } else {
    list = primaryInvoicesForEmployee(invoices, employeeId)
  }

  return list
    .slice()
    .sort((a, b) => `${b.date}T${b.invoiceTime || ''}`.localeCompare(`${a.date}T${a.invoiceTime || ''}`))
    .map((inv) => {
      const services = getInvoiceServiceDetails(inv)
      const role = inv.supportEmployeeId === employeeId ? 'support' : 'primary'
      return {
        id: inv.id,
        date: inv.date,
        time: inv.invoiceTime || '',
        customerName: inv.customerName || '—',
        customerPhone: inv.customerPhone || '',
        branchId: inv.branchId || '',
        branchName: inv.branchName || getBranchById(inv.branchId)?.name || '—',
        serviceNames: services.map((s) => s.name).filter(Boolean).join(', ') || '—',
        customerRequested: Boolean(inv.customerRequested),
        revenue: getInvoicePayment(inv),
        tips: role === 'primary' ? getInvoiceTips(inv) : 0,
        employeeId: inv.employeeId || '',
        employeeName: inv.employeeName || getEmployeeById(inv.employeeId)?.name || '—',
        supportEmployeeId: inv.supportEmployeeId || '',
        supportEmployeeName: inv.supportEmployeeName || getEmployeeById(inv.supportEmployeeId)?.name || '',
        salaryRole: role,
        roleLabel: role === 'support' ? 'Hỗ trợ' : 'Chính',
        invoice: inv,
      }
    })
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
