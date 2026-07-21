import { CUSTOMER_SEGMENTS } from '../../constants/customerTypes'
import { getCareLogsForCustomer, loadCustomerCareLogs } from '../customerProfileStorage'
import { getInvoiceServiceDetails } from '../invoice'
import {
  CARE_TODAY_LABELS,
  CARE_TODAY_REASONS,
  GROWTH_THRESHOLDS,
  NEW_VIP_MAX_FIRST_VISIT_DAYS,
} from './crmGrowthConstants'
import { computeCustomerHealthScore } from './computeCustomerHealthScore'
import { buildCustomerFullTimeline } from './buildCustomerFullTimeline'

function parseDate(value) {
  if (!value) return null
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysBetween(fromDate, toDate) {
  const from = parseDate(fromDate)
  const to = parseDate(toDate)
  if (!from || !to) return null
  return Math.floor((to.getTime() - from.getTime()) / 86400000)
}

/**
 * Average return cycle (days between consecutive visits).
 */
export function computeAvgReturnCycleDays(profile) {
  const dates = [...new Set((profile.invoices ?? []).map((inv) => inv.date).filter(Boolean))]
    .sort()
  if (dates.length < 2) return null
  let sum = 0
  let count = 0
  for (let i = 1; i < dates.length; i += 1) {
    const d = daysBetween(dates[i - 1], dates[i])
    if (d != null && d >= 0) {
      sum += d
      count += 1
    }
  }
  if (!count) return null
  return Math.round((sum / count) * 10) / 10
}

/** LTV = tổng chi tiêu hiện có (ticket + tips). */
export function computeCustomerLtv(profile) {
  return Number(profile.totalSpend ?? 0)
}

export function countCustomerRequested(profile) {
  return (profile.invoices ?? []).filter((inv) => Boolean(inv.customerRequested)).length
}

export function buildCustomerValueAnalysis(profile) {
  const topRevenueService = [...(profile.serviceStats ?? [])]
    .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0) || (b.count ?? 0) - (a.count ?? 0))[0] || null
  const topEmployee = profile.employeeStats?.[0] || null
  const latestInvoice = profile.invoices?.[0]
  let lastServiceName = profile.favoriteServiceName || '—'
  if (latestInvoice) {
    const names = getInvoiceServiceDetails(latestInvoice).map((s) => s.name).filter(Boolean)
    if (names.length) lastServiceName = names.join(', ')
  }

  return {
    totalRevenue: Number(profile.totalTicketRevenue ?? 0),
    totalSpend: Number(profile.totalSpend ?? 0),
    avgSpendPerVisit: Number(profile.avgSpendPerVisit ?? 0),
    avgReturnCycleDays: profile.avgReturnCycleDays ?? computeAvgReturnCycleDays(profile),
    topRevenueServiceName: topRevenueService?.name || '—',
    topRevenueServiceAmount: Number(topRevenueService?.revenue ?? 0),
    topEmployeeName: topEmployee?.name || profile.latestEmployeeName || '—',
    topEmployeeVisitCount: Number(topEmployee?.count ?? 0),
    lastServiceName,
  }
}

function buildPeerStats(customers) {
  const list = customers ?? []
  return {
    maxLtv: Math.max(1, ...list.map((c) => Number(c.totalSpend ?? 0)), 1),
    maxVisits: Math.max(1, ...list.map((c) => Number(c.visitCount ?? 0)), 1),
  }
}

export function enrichCustomerGrowthProfile(profile, peers = {}) {
  const primaryEmployee = profile.employeeStats?.[0] || null
  const favoriteService = profile.serviceStats?.[0] || null
  const ltv = computeCustomerLtv(profile)
  const avgReturnCycleDays = computeAvgReturnCycleDays(profile)
  const requestedCount = countCustomerRequested(profile)

  const base = {
    ...profile,
    ltv,
    avgReturnCycleDays,
    requestedCount,
    primaryEmployeeId: primaryEmployee?.id || profile.latestEmployeeId || '',
    primaryEmployeeName: primaryEmployee?.name || profile.latestEmployeeName || '—',
    favoriteServiceId: favoriteService?.id || '',
    favoriteServiceName: favoriteService?.name || '—',
    favoriteServiceCount: favoriteService?.count || 0,
  }

  const health = computeCustomerHealthScore(base, peers)
  const valueAnalysis = buildCustomerValueAnalysis(base)
  const fullTimeline = buildCustomerFullTimeline(base)

  return {
    ...base,
    healthScore: health.score,
    healthGradeId: health.gradeId,
    healthGradeLabel: health.gradeLabel,
    healthParts: health.parts,
    valueAnalysis,
    fullTimeline,
    lastServiceName: valueAnalysis.lastServiceName,
  }
}

export function enrichCustomersForGrowth(customers) {
  const peers = buildPeerStats(customers)
  return (customers ?? []).map((c) => enrichCustomerGrowthProfile(c, peers))
}

/**
 * Care list for today — rule-based.
 */
export function buildCareTodayList(customers, { today } = {}) {
  const day = today || new Date().toISOString().slice(0, 10)
  const month = Number(day.slice(5, 7))
  const items = []

  for (const customer of customers ?? []) {
    const reasons = []
    if (customer.segment === CUSTOMER_SEGMENTS.DORMANT
      || customer.daysSinceLastVisit >= GROWTH_THRESHOLDS.dormantDays) {
      reasons.push(CARE_TODAY_REASONS.DORMANT)
    } else if (customer.segment === CUSTOMER_SEGMENTS.AT_RISK) {
      reasons.push(CARE_TODAY_REASONS.AT_RISK)
    } else if (customer.daysSinceLastVisit >= 30 && customer.daysSinceLastVisit < 90) {
      reasons.push(CARE_TODAY_REASONS.INVITE_BACK)
    }

    if (customer.dateOfBirth) {
      const parts = customer.dateOfBirth.split('-')
      if (parts.length >= 2 && Number(parts[1]) === month) {
        reasons.push(CARE_TODAY_REASONS.BIRTHDAY)
      }
    }

    const careLogs = getCareLogsForCustomer(customer.key)
    const dueFollowUp = careLogs.some((log) => log.followUpDate && log.followUpDate <= day)
    if (dueFollowUp) reasons.push(CARE_TODAY_REASONS.FOLLOW_UP)

    if (!reasons.length) continue
    items.push({
      key: customer.key,
      name: customer.name,
      phone: customer.phone,
      segment: customer.segment,
      daysSinceLastVisit: customer.daysSinceLastVisit,
      primaryEmployeeName: customer.primaryEmployeeName,
      branchName: customer.primaryBranchName,
      reasons,
      reasonLabels: reasons.map((r) => CARE_TODAY_LABELS[r] || r),
      ltv: customer.ltv ?? customer.totalSpend,
      lastVisitDate: customer.lastVisitDate,
      healthScore: customer.healthScore ?? 0,
      healthGradeLabel: customer.healthGradeLabel ?? '',
    })
  }

  return items.sort((a, b) => (b.daysSinceLastVisit ?? 0) - (a.daysSinceLastVisit ?? 0))
}

/**
 * Aggregate customer growth KPIs.
 */
export function buildCustomerGrowthMetrics(customers) {
  const list = customers ?? []
  const total = list.length
  const returning = list.filter((c) => c.visitCount >= 2).length
  const returnRate = total ? Math.round((returning / total) * 1000) / 10 : 0

  const cycles = list.map((c) => c.avgReturnCycleDays).filter((v) => v != null && Number.isFinite(v))
  const avgReturnCycleDays = cycles.length
    ? Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 10) / 10
    : null

  const totalLtv = list.reduce((sum, c) => sum + Number(c.ltv ?? c.totalSpend ?? 0), 0)
  const avgLtv = total ? Math.round(totalLtv / total) : 0
  const avgHealthScore = total
    ? Math.round(list.reduce((sum, c) => sum + Number(c.healthScore ?? 0), 0) / total)
    : 0

  const bySegment = {}
  for (const seg of Object.values(CUSTOMER_SEGMENTS)) {
    const group = list.filter((c) => c.segment === seg)
    bySegment[seg] = {
      count: group.length,
      revenue: group.reduce((s, c) => s + Number(c.totalTicketRevenue ?? 0), 0),
      spend: group.reduce((s, c) => s + Number(c.totalSpend ?? 0), 0),
    }
  }

  return {
    totalCustomers: total,
    returnRate,
    avgReturnCycleDays,
    totalLtv,
    avgLtv,
    avgHealthScore,
    bySegment,
    vipCount: bySegment[CUSTOMER_SEGMENTS.VIP]?.count ?? 0,
    loyalCount: bySegment[CUSTOMER_SEGMENTS.LOYAL]?.count ?? 0,
    atRiskCount: bySegment[CUSTOMER_SEGMENTS.AT_RISK]?.count ?? 0,
    dormantCount: bySegment[CUSTOMER_SEGMENTS.DORMANT]?.count ?? 0,
    newCount: bySegment[CUSTOMER_SEGMENTS.NEW]?.count ?? 0,
  }
}

/**
 * CEO dashboard cards for growth.
 */
export function buildCrmCeoInsights(customers, { today } = {}) {
  const list = customers ?? []
  const day = today || new Date().toISOString().slice(0, 10)

  const atRisk = list
    .filter((c) => c.segment === CUSTOMER_SEGMENTS.AT_RISK || c.segment === CUSTOMER_SEGMENTS.DORMANT
      || (c.healthScore != null && c.healthScore < 40))
    .sort((a, b) => (a.healthScore ?? 0) - (b.healthScore ?? 0) || (b.ltv ?? 0) - (a.ltv ?? 0))
    .slice(0, 8)

  const vip = list
    .filter((c) => c.segment === CUSTOMER_SEGMENTS.VIP)
    .sort((a, b) => (b.ltv ?? 0) - (a.ltv ?? 0))
    .slice(0, 8)

  const newVip = list
    .filter((c) => {
      if (c.segment !== CUSTOMER_SEGMENTS.VIP) return false
      const sinceFirst = daysBetween(c.firstVisitDate, day)
      return sinceFirst != null && sinceFirst <= NEW_VIP_MAX_FIRST_VISIT_DAYS
    })
    .sort((a, b) => (b.ltv ?? 0) - (a.ltv ?? 0))
    .slice(0, 8)

  const topSpenders = [...list]
    .sort((a, b) => (b.ltv ?? b.totalSpend ?? 0) - (a.ltv ?? a.totalSpend ?? 0))
    .slice(0, 8)

  const topReturners = [...list]
    .filter((c) => c.visitCount >= 2)
    .sort((a, b) => (b.visitCount ?? 0) - (a.visitCount ?? 0)
      || (b.avgVisitsPerMonth ?? 0) - (a.avgVisitsPerMonth ?? 0))
    .slice(0, 8)

  const branchMap = new Map()
  const employeeMap = new Map()

  for (const c of list) {
    if (c.visitCount < 2) continue
    const branchId = c.primaryBranchId || 'unknown'
    const branch = branchMap.get(branchId) ?? {
      id: branchId,
      name: c.primaryBranchName || branchId,
      returning: 0,
      total: 0,
    }
    branch.total += 1
    if (c.daysSinceLastVisit < 60) branch.returning += 1
    branchMap.set(branchId, branch)

    const empId = c.primaryEmployeeId || c.latestEmployeeId || ''
    if (!empId) continue
    const emp = employeeMap.get(empId) ?? {
      id: empId,
      name: c.primaryEmployeeName || c.latestEmployeeName || empId,
      returning: 0,
      total: 0,
    }
    emp.total += 1
    if (c.daysSinceLastVisit < 60) emp.returning += 1
    employeeMap.set(empId, emp)
  }

  const rankRetention = (rows) => [...rows]
    .filter((r) => r.total >= 3)
    .map((r) => ({
      ...r,
      retentionRate: Math.round((r.returning / r.total) * 1000) / 10,
    }))
    .sort((a, b) => b.retentionRate - a.retentionRate || b.total - a.total)
    .slice(0, 5)

  return {
    atRisk,
    vip,
    newVip,
    topSpenders,
    topReturners,
    bestBranches: rankRetention([...branchMap.values()]),
    bestEmployees: rankRetention([...employeeMap.values()]),
  }
}

export function loadAllCareLogsCount() {
  return loadCustomerCareLogs().length
}
