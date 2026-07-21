import { CUSTOMER_SEGMENTS } from '../../constants/customerTypes'
import { getCareLogsForCustomer, loadCustomerCareLogs } from '../customerProfileStorage'
import {
  CARE_TODAY_LABELS,
  CARE_TODAY_REASONS,
  GROWTH_THRESHOLDS,
} from './crmGrowthConstants'

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

export function enrichCustomerGrowthProfile(profile) {
  const primaryEmployee = profile.employeeStats?.[0] || null
  const favoriteService = profile.serviceStats?.[0] || null
  return {
    ...profile,
    ltv: computeCustomerLtv(profile),
    avgReturnCycleDays: computeAvgReturnCycleDays(profile),
    primaryEmployeeId: primaryEmployee?.id || profile.latestEmployeeId || '',
    primaryEmployeeName: primaryEmployee?.name || profile.latestEmployeeName || '—',
    favoriteServiceId: favoriteService?.id || '',
    favoriteServiceName: favoriteService?.name || '—',
    favoriteServiceCount: favoriteService?.count || 0,
  }
}

export function enrichCustomersForGrowth(customers) {
  return (customers ?? []).map(enrichCustomerGrowthProfile)
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
export function buildCrmCeoInsights(customers) {
  const list = customers ?? []
  const atRisk = list
    .filter((c) => c.segment === CUSTOMER_SEGMENTS.AT_RISK || c.segment === CUSTOMER_SEGMENTS.DORMANT)
    .sort((a, b) => (b.ltv ?? 0) - (a.ltv ?? 0))
    .slice(0, 8)

  const vip = list
    .filter((c) => c.segment === CUSTOMER_SEGMENTS.VIP)
    .sort((a, b) => (b.ltv ?? 0) - (a.ltv ?? 0))
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
    bestBranches: rankRetention([...branchMap.values()]),
    bestEmployees: rankRetention([...employeeMap.values()]),
  }
}

export function loadAllCareLogsCount() {
  return loadCustomerCareLogs().length
}
