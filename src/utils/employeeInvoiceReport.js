import {
  getInvoiceCustomerTotal,
  getInvoiceDiscountAmount,
  getInvoiceOriginalServiceTotal,
  getInvoicePayment,
  getInvoiceServiceDetails,
} from './invoice'
import { readInvoiceTime } from './invoiceFilters'
import {
  filterSalaryInvoices,
  formatDisplayDate,
  getPayCycleLabel,
} from './salaryReport'
import { SALARY_ROLES, SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../constants/salary'

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
  const services = getInvoiceServiceDetails(invoice)
  if (role === SALARY_ROLES.SUPPORT) {
    return services.reduce(
      (sum, service) => sum + scaleCommissionAmount(service.commissionAmount ?? 0, role),
      0,
    )
  }
  if (Number.isFinite(invoice.commission)) return invoice.commission
  return services.reduce((sum, service) => sum + Number(service.commissionAmount ?? 0), 0)
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

  return {
    invoiceId: invoice.id,
    invoice,
    date: invoice.date,
    displayDate: formatDisplayDate(invoice.date),
    invoiceTime: readInvoiceTime(invoice),
    customerName: invoice.customerName || '—',
    customerPhone: invoice.customerPhone || '',
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
      const serviceRevenue = sorted.reduce((sum, row) => sum + row.payment, 0)
      const tips = sorted.reduce((sum, row) => sum + row.tips, 0)
      const serviceCommission = sorted.reduce((sum, row) => sum + row.commission, 0)
      const totalSalary = tips + serviceCommission

      return {
        date,
        displayDate: formatDisplayDate(date),
        invoices: sorted,
        invoiceCount,
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

  const periodTotals = days.reduce(
    (acc, day) => {
      acc.invoiceCount += day.invoiceCount
      acc.serviceRevenue += day.serviceRevenue
      acc.tips += day.tips
      acc.serviceCommission += day.serviceCommission
      acc.totalSalary += day.totalSalary
      return acc
    },
    { invoiceCount: 0, serviceRevenue: 0, tips: 0, serviceCommission: 0, totalSalary: 0 },
  )

  const first = employeeInvoices[0]
  const employeeName = first?.employeeName ?? '—'
  const branchName = first?.branchName ?? '—'

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
