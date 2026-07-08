import { ROLES } from '../constants/roles'
import {
  CUSTOMER_SEGMENTS,
  REMARKETING_LISTS,
} from '../constants/customerTypes'
import {
  getInvoiceCustomerTotal,
  getInvoiceDiscountAmount,
  getInvoicePayment,
  getInvoiceServiceDetails,
  getInvoiceTips,
} from './invoice'
import { loadSystemSettings } from './systemSettingsStorage'
import { getBranchName } from './branchStorage'

export function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '')
}

export function formatPhoneDisplay(value) {
  const digits = normalizePhone(value)
  if (!digits) return ''
  if (digits.length === 10) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 7)}.${digits.slice(7)}`
  }
  return value?.trim?.() ?? digits
}

export function buildCustomerKey(invoice) {
  const phone = normalizePhone(invoice.customerPhone)
  const name = (invoice.customerName ?? '').trim().toLowerCase()
  if (phone) return `phone:${phone}`
  if (name && invoice.branchId) return `name:${name}|branch:${invoice.branchId}`
  if (name) return `name:${name}`
  return `inv:${invoice.id}`
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysBetween(fromDate, toDate) {
  const from = parseDate(fromDate)
  const to = parseDate(toDate)
  if (!from || !to) return 0
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

function getMonthsSpan(firstDate, lastDate) {
  const first = parseDate(firstDate)
  const last = parseDate(lastDate)
  if (!first || !last) return 1
  const months = (last.getFullYear() - first.getFullYear()) * 12
    + (last.getMonth() - first.getMonth()) + 1
  return Math.max(1, months)
}

function getInvoiceTimestamp(invoice) {
  const date = invoice.date ?? ''
  const time = invoice.invoiceTime ?? '12:00'
  const parsed = new Date(`${date}T${time}:00`)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function sortInvoicesDesc(invoices) {
  return [...invoices].sort((a, b) => {
    const dateCmp = (b.date ?? '').localeCompare(a.date ?? '')
    if (dateCmp !== 0) return dateCmp
    return getInvoiceTimestamp(b) - getInvoiceTimestamp(a)
  })
}

export function scopeInvoicesForCrm(invoices, { role, branchId, employeeId }) {
  if (role === ROLES.ADMIN) return invoices
  if (role === ROLES.BRANCH_MANAGER) {
    return invoices.filter((invoice) => invoice.branchId === branchId)
  }
  if (role === ROLES.EMPLOYEE) {
    return invoices.filter((invoice) => invoice.employeeId === employeeId)
  }
  return []
}

function countBranchVisits(invoices) {
  const counts = new Map()
  for (const invoice of invoices) {
    const branchId = invoice.branchId ?? ''
    counts.set(branchId, (counts.get(branchId) ?? 0) + 1)
  }
  let topBranchId = ''
  let topCount = 0
  for (const [branchId, count] of counts.entries()) {
    if (count > topCount) {
      topCount = count
      topBranchId = branchId
    }
  }
  return { topBranchId, topCount, counts }
}

function buildServiceStats(invoices) {
  const map = new Map()
  for (const invoice of invoices) {
    for (const service of getInvoiceServiceDetails(invoice)) {
      const id = service.id ?? service.name
      const current = map.get(id) ?? {
        id,
        name: service.name ?? 'Dịch vụ',
        count: 0,
        revenue: 0,
      }
      current.count += 1
      current.revenue += Number(service.price ?? 0)
      map.set(id, current)
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

function buildEmployeeStats(invoices) {
  const map = new Map()
  for (const invoice of invoices) {
    const id = invoice.employeeId ?? invoice.employeeName ?? 'unknown'
    const current = map.get(id) ?? {
      id: invoice.employeeId ?? '',
      name: invoice.employeeName ?? '—',
      count: 0,
    }
    current.count += 1
    map.set(id, current)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

export function classifyCustomer(profile, vipThreshold) {
  const visitCount = profile.visitCount
  const daysSinceLast = profile.daysSinceLastVisit
  const avgVisitsPerMonth = profile.avgVisitsPerMonth
  const totalTicketRevenue = profile.totalTicketRevenue

  if (daysSinceLast >= 90) {
    return CUSTOMER_SEGMENTS.AT_RISK
  }
  if (visitCount <= 1) {
    return CUSTOMER_SEGMENTS.NEW
  }
  if (avgVisitsPerMonth >= 2 || totalTicketRevenue >= vipThreshold) {
    return CUSTOMER_SEGMENTS.VIP
  }
  if (visitCount >= 2 && avgVisitsPerMonth >= 1) {
    return CUSTOMER_SEGMENTS.LOYAL
  }
  return CUSTOMER_SEGMENTS.NEW
}

function buildTimelineEntry(invoice) {
  const services = getInvoiceServiceDetails(invoice)
  const ticketRevenue = getInvoicePayment(invoice)
  const tips = getInvoiceTips(invoice)
  const discount = getInvoiceDiscountAmount(invoice)
  return {
    id: invoice.id,
    date: invoice.date ?? '',
    time: invoice.invoiceTime ?? '',
    branchId: invoice.branchId ?? '',
    branchName: invoice.branchName ?? getBranchName(invoice.branchId),
    employeeId: invoice.employeeId ?? '',
    employeeName: invoice.employeeName ?? '—',
    services: services.map((service) => service.name).join(', '),
    serviceLines: services,
    ticketRevenue,
    discount,
    payment: ticketRevenue,
    tips,
    total: getInvoiceCustomerTotal(invoice),
    invoice,
  }
}

export function buildCustomerProfile(key, invoices, profileOverride = {}) {
  const sorted = sortInvoicesDesc(invoices)
  const latest = sorted[0]
  const oldest = sorted[sorted.length - 1]
  const visitCount = sorted.length
  const totalTicketRevenue = sorted.reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
  const totalTips = sorted.reduce((sum, inv) => sum + getInvoiceTips(inv), 0)
  const totalSpend = totalTicketRevenue + totalTips
  const firstVisitDate = oldest?.date ?? ''
  const lastVisitDate = latest?.date ?? ''
  const today = new Date().toISOString().slice(0, 10)
  const daysSinceLastVisit = lastVisitDate ? daysBetween(lastVisitDate, today) : 0
  const monthsSpan = getMonthsSpan(firstVisitDate, lastVisitDate)
  const avgVisitsPerMonth = visitCount / monthsSpan
  const avgSpendPerVisit = visitCount > 0 ? totalSpend / visitCount : 0
  const phone = normalizePhone(latest?.customerPhone)
  const name = (latest?.customerName ?? profileOverride.name ?? '').trim()
  const branchStats = countBranchVisits(sorted)
  const primaryBranchId = branchStats.topBranchId
  const settings = loadSystemSettings()
  const vipThreshold = Number(settings.vipCustomerThreshold ?? 10000000)

  const base = {
    key,
    name: profileOverride.name?.trim?.() || name || 'Khách chưa đặt tên',
    phone: profileOverride.phone?.trim?.() || formatPhoneDisplay(latest?.customerPhone),
    phoneRaw: phone,
    missingPhone: !phone,
    gender: profileOverride.gender ?? '',
    dateOfBirth: profileOverride.dateOfBirth ?? '',
    occupation: profileOverride.occupation ?? '',
    address: profileOverride.address ?? '',
    note: profileOverride.note ?? '',
    primaryBranchId,
    primaryBranchName: getBranchName(primaryBranchId) || latest?.branchName || '—',
    latestEmployeeId: latest?.employeeId ?? '',
    latestEmployeeName: latest?.employeeName ?? '—',
    visitCount,
    totalTicketRevenue,
    totalTips,
    totalSpend,
    avgSpendPerVisit,
    avgVisitsPerMonth,
    firstVisitDate,
    lastVisitDate,
    daysSinceLastVisit,
    serviceStats: buildServiceStats(sorted),
    employeeStats: buildEmployeeStats(sorted),
    timeline: sorted.map(buildTimelineEntry),
    invoices: sorted,
    branchIds: [...new Set(sorted.map((inv) => inv.branchId).filter(Boolean))],
  }

  base.segment = classifyCustomer(base, vipThreshold)
  base.isVip = base.segment === CUSTOMER_SEGMENTS.VIP
  return base
}

export function buildCustomerProfiles(invoices, profileMap = {}) {
  const groups = new Map()
  for (const invoice of invoices) {
    const key = buildCustomerKey(invoice)
    const list = groups.get(key) ?? []
    list.push(invoice)
    groups.set(key, list)
  }

  return [...groups.entries()]
    .map(([key, customerInvoices]) => buildCustomerProfile(key, customerInvoices, profileMap[key] ?? {}))
    .sort((a, b) => {
      const dateCmp = (b.lastVisitDate ?? '').localeCompare(a.lastVisitDate ?? '')
      if (dateCmp !== 0) return dateCmp
      return b.totalSpend - a.totalSpend
    })
}

export function filterCustomers(customers, filters = {}) {
  const query = (filters.query ?? '').trim().toLowerCase()
  const branchId = filters.branchId ?? ''
  const employeeId = filters.employeeId ?? ''
  const serviceQuery = (filters.serviceQuery ?? '').trim().toLowerCase()
  const segment = filters.segment ?? ''
  const fromDate = filters.fromDate ?? ''
  const toDate = filters.toDate ?? ''

  return customers.filter((customer) => {
    if (query) {
      const haystack = `${customer.name} ${customer.phone} ${customer.phoneRaw}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    if (branchId && !customer.branchIds.includes(branchId)) return false
    if (employeeId && !customer.employeeStats.some((row) => row.id === employeeId)) return false
    if (serviceQuery) {
      const matched = customer.serviceStats.some((row) =>
        row.name.toLowerCase().includes(serviceQuery),
      )
      if (!matched) return false
    }
    if (segment && customer.segment !== segment) return false
    if (fromDate && (customer.lastVisitDate ?? '') < fromDate) return false
    if (toDate && (customer.lastVisitDate ?? '') > toDate) return false
    return true
  })
}

export function buildCrmDashboard(customers) {
  const today = new Date()
  const month = today.getMonth()
  const year = today.getFullYear()
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`

  const returningThisMonth = customers.filter((customer) =>
    customer.invoices.some((invoice) => (invoice.date ?? '').startsWith(monthPrefix)),
  ).length

  const returnedCustomers = customers.filter((customer) => customer.visitCount >= 2).length
  const returnRate = customers.length > 0
    ? Math.round((returnedCustomers / customers.length) * 100)
    : 0

  const topSpend = [...customers].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 5)
  const topTips = [...customers].sort((a, b) => b.totalTips - a.totalTips).slice(0, 5)

  return {
    totalCustomers: customers.length,
    newCustomers: customers.filter((c) => c.segment === CUSTOMER_SEGMENTS.NEW).length,
    loyalCustomers: customers.filter((c) => c.segment === CUSTOMER_SEGMENTS.LOYAL).length,
    vipCustomers: customers.filter((c) => c.segment === CUSTOMER_SEGMENTS.VIP).length,
    atRiskCustomers: customers.filter((c) => c.segment === CUSTOMER_SEGMENTS.AT_RISK).length,
    returningThisMonth,
    returnRate,
    topSpend,
    topTips,
  }
}

export function buildRemarketingLists(customers) {
  const today = new Date()
  const month = today.getMonth() + 1

  const pick = (predicate) => customers.filter(predicate)

  return {
    [REMARKETING_LISTS.NEW]: pick((c) => c.segment === CUSTOMER_SEGMENTS.NEW),
    [REMARKETING_LISTS.LOYAL]: pick((c) => c.segment === CUSTOMER_SEGMENTS.LOYAL),
    [REMARKETING_LISTS.VIP]: pick((c) => c.segment === CUSTOMER_SEGMENTS.VIP),
    [REMARKETING_LISTS.INACTIVE_30]: pick((c) => c.daysSinceLastVisit >= 30 && c.daysSinceLastVisit < 60),
    [REMARKETING_LISTS.INACTIVE_60]: pick((c) => c.daysSinceLastVisit >= 60 && c.daysSinceLastVisit < 90),
    [REMARKETING_LISTS.INACTIVE_90]: pick((c) => c.daysSinceLastVisit >= 90),
    [REMARKETING_LISTS.BIRTHDAY]: pick((c) => {
      if (!c.dateOfBirth) return false
      const parts = c.dateOfBirth.split('-')
      if (parts.length < 2) return false
      const birthMonth = Number.parseInt(parts[1], 10)
      return birthMonth === month
    }),
  }
}

export function getCustomerInitials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'KH'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
