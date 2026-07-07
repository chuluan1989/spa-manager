import { invoiceHasDiscount, getInvoicePayment, getInvoiceCustomerTotal, getInvoiceServiceDetails } from './invoice'

export const INVOICE_PAGE_SIZE = 20

export const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: 'Tất cả phương thức' },
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'transfer', label: 'Chuyển khoản' },
]

export function getPaymentMethodLabel(method) {
  if (method === 'cash') return 'Tiền mặt'
  if (method === 'transfer') return 'Chuyển khoản'
  return method || '—'
}

export function formatInvoiceDateTime(iso) {
  if (!iso) return '—'
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function readInvoiceTime(invoice) {
  if (invoice?.invoiceTime) return invoice.invoiceTime
  if (!invoice?.createdAt) return '—'
  const parsed = new Date(invoice.createdAt)
  if (Number.isNaN(parsed.getTime())) return '—'
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
}

export function sortInvoicesDesc(invoices) {
  return [...invoices].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date)
    if (dateCmp !== 0) return dateCmp
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  })
}

export function filterInvoices(invoices, filters) {
  const {
    fromDate = '',
    toDate = '',
    branchId = '',
    employeeId = '',
    serviceId = '',
    paymentMethod = '',
    search = '',
    discountFilter = '',
  } = filters

  const query = search.trim().toLowerCase()

  return invoices.filter((invoice) => {
    if (fromDate && invoice.date < fromDate) return false
    if (toDate && invoice.date > toDate) return false
    if (branchId && invoice.branchId !== branchId) return false

    if (employeeId) {
      const matchesPrimary = invoice.employeeId === employeeId
      const matchesSupport = invoice.supportEmployeeId === employeeId
      if (!matchesPrimary && !matchesSupport) return false
    }

    if (paymentMethod && invoice.paymentMethod !== paymentMethod) return false

    if (serviceId) {
      const services = getInvoiceServiceDetails(invoice)
      const serviceIds = invoice.serviceIds?.length
        ? invoice.serviceIds
        : services.map((service) => service.id)
      if (!serviceIds.includes(serviceId)) return false
    }

    if (query) {
      const name = (invoice.customerName ?? '').toLowerCase()
      const phone = (invoice.customerPhone ?? '').toLowerCase()
      if (!name.includes(query) && !phone.includes(query)) return false
    }

    if (discountFilter === 'with' && !invoiceHasDiscount(invoice)) return false
    if (discountFilter === 'without' && invoiceHasDiscount(invoice)) return false

    return true
  })
}

export function computeInvoiceListTotals(invoices) {
  return invoices.reduce(
    (acc, invoice) => {
      acc.count += 1
      acc.ticketRevenue += getInvoicePayment(invoice)
      acc.revenue += getInvoicePayment(invoice)
      acc.customerTotal += getInvoiceCustomerTotal(invoice)
      acc.tips += Number.isFinite(invoice.tips) ? invoice.tips : 0
      acc.commission += Number.isFinite(invoice.commission) ? invoice.commission : 0
      return acc
    },
    { count: 0, ticketRevenue: 0, revenue: 0, customerTotal: 0, tips: 0, commission: 0 },
  )
}

export function paginateInvoices(invoices, page, pageSize = INVOICE_PAGE_SIZE) {
  const totalItems = invoices.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize

  return {
    items: invoices.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    totalItems,
    pageSize,
  }
}

export function hasActiveInvoiceFilters(filters) {
  return Boolean(
    filters.fromDate
    || filters.toDate
    || filters.branchId
    || filters.employeeId
    || filters.serviceId
    || filters.paymentMethod
    || filters.discountFilter
    || filters.search?.trim(),
  )
}
