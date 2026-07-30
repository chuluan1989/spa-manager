import {
  getInvoiceCustomerTotal,
  getInvoiceDiscountAmount,
  getInvoiceOriginalServiceTotal,
  getInvoicePayment,
  getInvoiceServiceDetails,
  getInvoiceServiceCommission,
  getServiceLineCommissionAmount,
} from './invoice'
import { readInvoiceTime } from './invoiceFilters'
import {
  filterSalaryInvoices,
  formatDisplayDate,
  getPayCycleLabel,
} from './salaryReport'
import { SALARY_ROLES, SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../constants/salary'
import { isCrossBranchSupportInvoice } from './crossBranchSupport'

function getSalaryRole(invoice, employeeId) {
  if (employeeId && invoice.supportEmployeeId === employeeId) {
    return SALARY_ROLES.SUPPORT
  }
  return SALARY_ROLES.PRIMARY
}

function scaleCommissionAmount(amount, role) {
  if (role !== SALARY_ROLES.SUPPORT) return amount
  return Math.round(amount * SUPPORT_EMPLOYEE_COMMISSION_RATE)
}

function getInvoiceTipsForEmployee(invoice, role) {
  if (role !== SALARY_ROLES.PRIMARY) return 0
  return Number.isFinite(invoice.tips) ? invoice.tips : 0
}

function getEmployeeCommission(invoice, employeeId, role) {
  const baseCommission = getInvoiceServiceCommission(invoice)
  return scaleCommissionAmount(baseCommission, role)
}

export function filterEmployeeReportInvoices(invoices, filters) {
  const {
    customerSearch = '',
    serviceId = '',
    ...salaryFilters
  } = filters

  let result = filterSalaryInvoices(invoices, salaryFilters)

  const query = customerSearch.trim().toLowerCase()
  if (query) {
    result = result.filter(
      (invoice) =>
        (invoice.customerName || '').toLowerCase().includes(query)
        || (invoice.customerPhone || '').includes(query),
    )
  }

  if (serviceId) {
    result = result.filter((invoice) => {
      const services = getInvoiceServiceDetails(invoice)
      if (services.some((service) => service.id === serviceId)) return true
      return Array.isArray(invoice.serviceIds) && invoice.serviceIds.includes(serviceId)
    })
  }

  return result
}

export function buildEmployeeInvoiceDetailItem(invoice, employeeId) {
  const role = getSalaryRole(invoice, employeeId)
  const services = getInvoiceServiceDetails(invoice)
  const tips = getInvoiceTipsForEmployee(invoice, role)
  const payment = getInvoicePayment(invoice)
  const commission = getEmployeeCommission(invoice, employeeId, role)

  const isCrossBranchSupport = role === SALARY_ROLES.PRIMARY && isCrossBranchSupportInvoice(invoice)

  return {
    invoiceId: invoice.id,
    invoice,
    date: invoice.date,
    displayDate: formatDisplayDate(invoice.date),
    invoiceTime: readInvoiceTime(invoice),
    branchId: invoice.branchId ?? '',
    branchName: invoice.branchName || '—',
    homeBranchId: invoice.homeBranchId ?? '',
    homeBranchName: invoice.homeBranchName || '',
    isCrossBranchSupport,
    customerName: invoice.customerName || '—',
    customerPhone: invoice.customerPhone || '',
    customerRequested: Boolean(invoice.customerRequested),
    serviceNames: services.map((service) => service.name).join(', ') || '—',
    ticketPrice: getInvoiceOriginalServiceTotal(invoice),
    discount: getInvoiceDiscountAmount(invoice),
    payment,
    tips,
    commission,
    customerTotal: getInvoiceCustomerTotal(invoice),
    totalSalary: commission + tips,
    salaryRole: role,
    roleLabel: role === SALARY_ROLES.SUPPORT ? 'Hỗ trợ' : 'Chính',
    sortKey: `${invoice.date}T${invoice.invoiceTime || '00:00'}:${invoice.createdAt ?? ''}`,
  }
}

function sortInvoiceItems(items) {
  return [...items].sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

function buildDayGroups(invoiceItems) {
  const byDate = new Map()

  for (const item of invoiceItems) {
    if (!byDate.has(item.date)) byDate.set(item.date, [])
    byDate.get(item.date).push(item)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => {
      const sorted = sortInvoiceItems(items)
      const invoiceCount = sorted.length
      const customerRequestedCount = sorted.filter((row) => row.customerRequested).length
      const serviceRevenue = sorted.reduce((sum, row) => sum + row.payment, 0)
      const tips = sorted.reduce((sum, row) => sum + row.tips, 0)
      const serviceCommission = sorted.reduce((sum, row) => sum + row.commission, 0)
      const totalSalary = tips + serviceCommission

      return {
        date,
        displayDate: formatDisplayDate(date),
        invoices: sorted,
        invoiceCount,
        customerRequestedCount,
        serviceRevenue,
        tips,
        serviceCommission,
        totalSalary,
      }
    })
}

/** Chi tiết báo cáo nhân viên: danh sách từng hóa đơn theo ngày (Tips riêng từng khách). */
export function computeEmployeeInvoiceDetailReport(invoices, employeeId, filters) {
  const { cycle = 'full', branchId } = filters
  const scoped = filterEmployeeReportInvoices(invoices, { ...filters, employeeId })
  const employeeInvoices = scoped.filter(
    (invoice) =>
      invoice.employeeId === employeeId || invoice.supportEmployeeId === employeeId,
  )

  const invoiceItems = employeeInvoices.map((invoice) =>
    buildEmployeeInvoiceDetailItem(invoice, employeeId),
  )

  const days = buildDayGroups(invoiceItems)

  const crossBranchItems = invoiceItems.filter((item) => item.isCrossBranchSupport)
  const periodTotals = days.reduce(
    (acc, day) => {
      acc.invoiceCount += day.invoiceCount
      acc.customerRequestedCount += day.customerRequestedCount
      acc.serviceRevenue += day.serviceRevenue
      acc.tips += day.tips
      acc.serviceCommission += day.serviceCommission
      acc.totalSalary += day.totalSalary
      return acc
    },
    {
      invoiceCount: 0,
      customerRequestedCount: 0,
      serviceRevenue: 0,
      tips: 0,
      serviceCommission: 0,
      totalSalary: 0,
      crossBranchSupportTourCount: 0,
      crossBranchSupportRevenue: 0,
    },
  )
  periodTotals.crossBranchSupportTourCount = crossBranchItems.length
  periodTotals.crossBranchSupportRevenue = crossBranchItems.reduce((sum, row) => sum + row.payment, 0)

  const first = employeeInvoices[0]
  const employeeName = first?.employeeName ?? '—'
  const branchLabels = [...new Set(
    employeeInvoices.map((inv) => inv.branchName).filter(Boolean),
  )]
  const branchName = branchLabels.length > 0 ? branchLabels.join(' · ') : (first?.branchName ?? '—')

  return {
    employeeId,
    employeeName,
    branchName,
    cycleLabel: getPayCycleLabel(cycle),
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    days,
    periodTotals,
  }
}

/** Thống kê khách yêu cầu — chỉ tour chính (employeeId), không gộp khách quay lại. */
export function computeEmployeeCustomerRequestedStats(invoices, employeeId, filters) {
  const scoped = filterEmployeeReportInvoices(invoices, { ...filters, employeeId })
  const primaryInvoices = scoped.filter((invoice) => invoice.employeeId === employeeId)
  const requestedInvoices = primaryInvoices.filter((invoice) => invoice.customerRequested)

  const dailyMap = new Map()
  const monthlyMap = new Map()

  for (const invoice of primaryInvoices) {
    const monthKey = invoice.date?.slice(0, 7) ?? ''
    if (!dailyMap.has(invoice.date)) {
      dailyMap.set(invoice.date, { date: invoice.date, displayDate: formatDisplayDate(invoice.date), totalTours: 0, requestedCount: 0 })
    }
    const day = dailyMap.get(invoice.date)
    day.totalTours += 1
    if (invoice.customerRequested) day.requestedCount += 1

    if (monthKey) {
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { month: monthKey, totalTours: 0, requestedCount: 0 })
      }
      const month = monthlyMap.get(monthKey)
      month.totalTours += 1
      if (invoice.customerRequested) month.requestedCount += 1
    }
  }

  const totalTours = primaryInvoices.length
  const requestedCount = requestedInvoices.length
  const requestedRate = totalTours > 0 ? Math.round((requestedCount / totalTours) * 1000) / 10 : null

  return {
    totalTours,
    requestedCount,
    requestedRate,
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    monthly: [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    invoices: requestedInvoices
      .map((invoice) => buildEmployeeInvoiceDetailItem(invoice, employeeId))
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey)),
  }
}
