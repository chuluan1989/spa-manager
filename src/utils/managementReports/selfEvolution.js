/**
 * Self Evolution — vertical compare vs self over the last 3 months (rule-based).
 */

import { getInvoicePayment, getInvoiceTips } from '../invoice'
import { countUniqueCustomers } from '../drillDownReport'
import { computeAttendanceStats } from '../payrollLiveHelpers'
import {
  computeSafeTrend,
  daysInMonth,
  formatIsoDate,
  parseIsoDate,
  safeDivide,
  safeRatePercent,
  shiftYearMonth,
} from './periodCompare'

function customerKey(invoice) {
  const phone = (invoice.customerPhone ?? '').replace(/\D/g, '')
  const name = (invoice.customerName ?? '').trim().toLowerCase()
  if (phone) return `phone:${phone}`
  if (name) return `name:${name}`
  return `inv:${invoice.id}`
}

function countRequested(invoices) {
  const keys = new Set()
  for (const inv of invoices) {
    if (!inv.customerRequested) continue
    keys.add(customerKey(inv))
  }
  return keys.size
}

/**
 * Last 3 month windows ending at toDate's month (current month capped at toDate).
 */
export function getLastThreeMonthWindows(toDate, count = 3) {
  if (!toDate) return []
  const endMonth = toDate.slice(0, 7)
  const windows = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const monthKey = shiftYearMonth(endMonth, -i)
    const last = daysInMonth(monthKey)
    const fromDate = `${monthKey}-01`
    let monthTo = `${monthKey}-${String(last).padStart(2, '0')}`
    if (monthKey === endMonth && toDate < monthTo) monthTo = toDate
    windows.push({ monthKey, fromDate, toDate: monthTo, label: monthKey })
  }
  return windows
}

export function filterByDateRange(rows, fromDate, toDate, getDate = (row) => row?.date ?? '') {
  return (rows ?? []).filter((row) => {
    const d = getDate(row)
    if (fromDate && d < fromDate) return false
    if (toDate && d > toDate) return false
    return true
  })
}

function buildMonthSnapshot({
  invoices,
  attendanceRecords,
  fromDate,
  toDate,
  entityType,
  entityId,
}) {
  let scopedInvoices = invoices ?? []
  if (entityType === 'employee') {
    scopedInvoices = scopedInvoices.filter((inv) => inv.employeeId === entityId)
  } else if (entityType === 'branch') {
    scopedInvoices = scopedInvoices.filter((inv) => inv.branchId === entityId)
  }

  const revenue = scopedInvoices.reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
  const tips = scopedInvoices.reduce((sum, inv) => sum + getInvoiceTips(inv), 0)
  const totalCustomerCount = countUniqueCustomers(scopedInvoices)
  const requestedCustomerCount = countRequested(scopedInvoices)
  const requestedRate = safeRatePercent(requestedCustomerCount, totalCustomerCount)
  const averageRevenuePerCustomer = safeDivide(revenue, totalCustomerCount)

  let workDays = 0
  if (entityType === 'employee') {
    workDays = computeAttendanceStats(attendanceRecords, entityId).workDays ?? 0
  } else {
    const employeeIds = new Set(
      (attendanceRecords ?? [])
        .filter((row) => row.branchId === entityId || !row.branchId)
        .map((row) => row.employeeId)
        .filter(Boolean),
    )
    // Prefer invoices' employee set if attendance lacks branchId
    for (const inv of scopedInvoices) {
      if (inv.employeeId) employeeIds.add(inv.employeeId)
    }
    for (const id of employeeIds) {
      workDays += computeAttendanceStats(attendanceRecords, id).workDays ?? 0
    }
  }

  const revenuePerWorkDay = safeDivide(revenue, workDays)
  const customersPerWorkDay = safeDivide(totalCustomerCount, workDays)
  const requestedPerWorkDay = safeDivide(requestedCustomerCount, workDays)
  const tipsPerWorkDay = safeDivide(tips, workDays)
  const averageRevenuePerDay = safeDivide(
    revenue,
    Math.max(1, Math.round((parseIsoDate(toDate) - parseIsoDate(fromDate)) / 86400000) + 1),
  )

  return {
    fromDate,
    toDate,
    revenue,
    tips,
    totalCustomerCount,
    requestedCustomerCount,
    requestedRate,
    averageRevenuePerCustomer,
    workDays,
    revenuePerWorkDay,
    customersPerWorkDay,
    requestedPerWorkDay,
    tipsPerWorkDay,
    averageRevenuePerDay,
  }
}

const EVOLUTION_FIELDS = [
  { key: 'revenue', label: 'Doanh thu' },
  { key: 'revenuePerWorkDay', label: 'Doanh thu/ngày' },
  { key: 'totalCustomerCount', label: 'Khách' },
  { key: 'customersPerWorkDay', label: 'Khách/ngày' },
  { key: 'requestedCustomerCount', label: 'Khách yêu cầu' },
  { key: 'requestedPerWorkDay', label: 'Khách yêu cầu/ngày' },
  { key: 'requestedRate', label: 'Tỷ lệ khách yêu cầu' },
  { key: 'tips', label: 'Tips' },
  { key: 'tipsPerWorkDay', label: 'Tips/ngày' },
  { key: 'averageRevenuePerCustomer', label: 'Doanh thu/khách' },
]

function arrowFromTrend(trend) {
  if (!trend) return '→'
  if (trend.direction === 'up' || trend.direction === 'new') return '↑'
  if (trend.direction === 'down') return '↓'
  return '→'
}

/**
 * Score months for conclusion: focus on revenuePerWorkDay then revenue.
 */
export function concludeEvolution(months) {
  if (!months?.length) {
    return { id: 'none', label: 'Chưa đủ dữ liệu', tone: 'neutral' }
  }
  if (months.length < 2) {
    return { id: 'new', label: 'Đang hình thành xu hướng', tone: 'yellow' }
  }

  let up = 0
  let down = 0
  let flat = 0
  for (let i = 1; i < months.length; i += 1) {
    const trend = computeSafeTrend(
      months[i].revenuePerWorkDay ?? months[i].revenue,
      months[i - 1].revenuePerWorkDay ?? months[i - 1].revenue,
    )
    if (trend.direction === 'up' || trend.direction === 'new') up += 1
    else if (trend.direction === 'down') down += 1
    else flat += 1
  }

  if (up > down && up >= flat) {
    return { id: 'improving', label: 'Đang tiến bộ', tone: 'green' }
  }
  if (down > up && down >= flat) {
    return { id: 'declining', label: 'Đang giảm hiệu suất', tone: 'red' }
  }
  return { id: 'stable', label: 'Đang chững lại', tone: 'yellow' }
}

/**
 * Build 3-month self-evolution for one employee or branch.
 */
export function buildSelfEvolution({
  invoices = [],
  attendanceRecords = [],
  toDate,
  entityType = 'employee',
  entityId,
}) {
  const windows = getLastThreeMonthWindows(toDate, 3)
  const months = windows.map((win) => {
    const monthInvoices = filterByDateRange(invoices, win.fromDate, win.toDate)
    const monthAttendance = filterByDateRange(attendanceRecords, win.fromDate, win.toDate)
    const snap = buildMonthSnapshot({
      invoices: monthInvoices,
      attendanceRecords: monthAttendance,
      fromDate: win.fromDate,
      toDate: win.toDate,
      entityType,
      entityId,
    })
    return {
      monthKey: win.monthKey,
      label: win.label,
      ...snap,
    }
  })

  const series = EVOLUTION_FIELDS.map((field) => {
    const points = months.map((m, index) => {
      const prev = index > 0 ? months[index - 1] : null
      const trend = prev
        ? computeSafeTrend(m[field.key], prev[field.key])
        : { direction: 'none', percent: null, label: '—' }
      return {
        monthKey: m.monthKey,
        value: m[field.key],
        trend,
        arrow: index === 0 ? '—' : arrowFromTrend(trend),
      }
    })
    return { ...field, points }
  })

  const conclusion = concludeEvolution(months)
  const latest = months[months.length - 1] ?? null
  const prior = months.length >= 2 ? months[months.length - 2] : null
  const headlineTrend = computeSafeTrend(
    latest?.revenuePerWorkDay ?? latest?.revenue,
    prior?.revenuePerWorkDay ?? prior?.revenue,
  )

  return {
    months,
    series,
    conclusion,
    headlineTrend,
    windows,
  }
}

export function evolutionSpanFrom(toDate) {
  const windows = getLastThreeMonthWindows(toDate, 3)
  return windows[0]?.fromDate || toDate
}

export { EVOLUTION_FIELDS, formatIsoDate }
