import { resolveCanonicalBranchId } from '../constants/canonicalBranches'
import {
  PAYMENT_METHOD_FILTER_OPTIONS,
  getPaymentMethodLabel,
  invoiceMatchesPaymentMethodFilter,
  normalizePaymentMethod,
} from '../constants/paymentMethods'
import {
  getInvoiceDiscountAmount,
  getInvoiceOriginalServiceTotal,
  invoiceHasDiscount,
  getInvoicePayment,
  getInvoiceCustomerTotal,
  getInvoiceServiceDetails,
  getInvoiceServiceCommission,
} from './invoice'
import { resolveInvoiceHomeBranchId } from './crossBranchSupport'

export const INVOICE_PAGE_SIZE = 20

/** Lọc chi nhánh: phục vụ khách vs chi nhánh gốc nhân viên — không gộp một filter chung. */
export const BRANCH_FILTER_MODES = {
  SERVING: 'serving',
  HOME: 'home',
}

export const BRANCH_FILTER_MODE_OPTIONS = [
  { value: BRANCH_FILTER_MODES.SERVING, label: 'Chi nhánh phục vụ' },
  { value: BRANCH_FILTER_MODES.HOME, label: 'Chi nhánh gốc nhân viên' },
]

export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHOD_FILTER_OPTIONS

export { resolveInvoiceHomeBranchId, getPaymentMethodLabel, normalizePaymentMethod }

export function invoiceMatchesEmployee(invoice, employeeId) {
  if (!employeeId) return true
  return invoice?.employeeId === employeeId || invoice?.supportEmployeeId === employeeId
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

function invoiceSortTime(invoice) {
  if (invoice?.invoiceTime && invoice.invoiceTime !== '—') return invoice.invoiceTime
  if (!invoice?.createdAt) return '00:00'
  const parsed = new Date(invoice.createdAt)
  if (Number.isNaN(parsed.getTime())) return '00:00'
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
}

export function compareInvoicesDesc(a, b) {
  const aCreated = a?.createdAt ?? ''
  const bCreated = b?.createdAt ?? ''
  if (aCreated || bCreated) {
    const createdCmp = bCreated.localeCompare(aCreated)
    if (createdCmp !== 0) return createdCmp
  }

  const dateCmp = (b?.date ?? '').localeCompare(a?.date ?? '')
  if (dateCmp !== 0) return dateCmp

  return invoiceSortTime(b).localeCompare(invoiceSortTime(a))
}

export function sortInvoicesDesc(invoices) {
  return [...invoices].sort(compareInvoicesDesc)
}

function buildInvoiceSearchHaystack(invoice) {
  return [
    invoice.id ?? '',
    invoice.customerName ?? '',
    invoice.customerPhone ?? '',
    invoice.note ?? '',
  ].join(' ').toLowerCase()
}

export function filterInvoices(invoices, filters) {
  const {
    fromDate = '',
    toDate = '',
    branchId = '',
    branchFilterMode = BRANCH_FILTER_MODES.SERVING,
    employeeId = '',
    serviceId = '',
    paymentMethod = '',
    search = '',
    discountFilter = '',
  } = filters

  const query = search.trim().toLowerCase()
  const scopedBranchId = resolveCanonicalBranchId(branchId)

  return invoices.filter((invoice) => {
    if (fromDate && invoice.date < fromDate) return false
    if (toDate && invoice.date > toDate) return false

    // Chọn / tìm theo nhân viên: hiện đủ HĐ chính + hỗ trợ, mọi chi nhánh phục vụ.
    if (employeeId) {
      if (!invoiceMatchesEmployee(invoice, employeeId)) return false
    } else if (scopedBranchId) {
      if (branchFilterMode === BRANCH_FILTER_MODES.HOME) {
        if (resolveInvoiceHomeBranchId(invoice) !== scopedBranchId) return false
      } else if (resolveCanonicalBranchId(invoice.branchId) !== scopedBranchId) {
        return false
      }
    }

    if (!invoiceMatchesPaymentMethodFilter(invoice, paymentMethod)) return false

    if (serviceId) {
      const services = getInvoiceServiceDetails(invoice)
      const serviceIds = invoice.serviceIds?.length
        ? invoice.serviceIds
        : services.map((service) => service.id)
      if (!serviceIds.includes(serviceId)) return false
    }

    if (query && !buildInvoiceSearchHaystack(invoice).includes(query)) return false

    if (discountFilter === 'with' && !invoiceHasDiscount(invoice)) return false
    if (discountFilter === 'without' && invoiceHasDiscount(invoice)) return false

    return true
  })
}

export function computeInvoiceListTotals(invoices) {
  return invoices.reduce(
    (acc, invoice) => {
      acc.count += 1
      acc.ticketPrice += getInvoiceOriginalServiceTotal(invoice)
      acc.discount += getInvoiceDiscountAmount(invoice)
      acc.ticketRevenue += getInvoicePayment(invoice)
      acc.revenue += getInvoicePayment(invoice)
      acc.customerTotal += getInvoiceCustomerTotal(invoice)
      acc.tips += Number.isFinite(invoice.tips) ? invoice.tips : 0
      acc.commission += getInvoiceServiceCommission(invoice)
      return acc
    },
    {
      count: 0,
      ticketPrice: 0,
      discount: 0,
      ticketRevenue: 0,
      revenue: 0,
      customerTotal: 0,
      tips: 0,
      commission: 0,
    },
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
    || filters.search?.trim(),
  )
}
