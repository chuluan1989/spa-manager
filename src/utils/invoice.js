import {
  calculateCommissionAmount,
  resolveCommissionPercent,
} from './commissionPolicyEngine.js'
import { getServiceMapForBranch } from './serviceStorage'

export function parseTips(value) {
  if (value === '' || value === null || value === undefined) return 0
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || num < 0) return 0
  return num
}

export function formatCurrency(amount) {
  const safe = Number.isFinite(amount) ? amount : 0
  return new Intl.NumberFormat('vi-VN').format(safe) + ' ₫'
}

/** Nhận dạng giảm giá: "10%" hoặc "50000" / "50.000" */
export function parseDiscountInput(input) {
  const raw = String(input ?? '').trim()
  if (!raw) {
    return { type: null, value: 0, input: '' }
  }

  if (raw.endsWith('%')) {
    const num = Number.parseFloat(raw.slice(0, -1).replace(',', '.'))
    if (!Number.isFinite(num) || num <= 0 || num > 100) {
      return { type: null, value: 0, input: raw }
    }
    return { type: 'percent', value: num, input: raw }
  }

  const digits = raw.replace(/\D/g, '')
  const num = Number.parseInt(digits, 10)
  if (!Number.isFinite(num) || num <= 0) {
    return { type: null, value: 0, input: raw }
  }
  return { type: 'amount', value: num, input: raw }
}

function resolveLineCommissionPercent(service, branchId = '') {
  if (Number.isFinite(service?.commissionPercent)) {
    return service.commissionPercent
  }
  return resolveCommissionPercent(branchId, service)
}

/** Hoa hồng 1 dòng dịch vụ = giá vé thực thu × % theo chính sách chi nhánh. */
export function getServiceLineCommissionAmount(service, options = {}) {
  const branchId = typeof options === 'string' ? options : (options?.branchId ?? '')
  const preferSnapshot = typeof options === 'object' ? Boolean(options.preferSnapshot) : false

  if (preferSnapshot && Number.isFinite(service?.commissionAmount)) {
    return service.commissionAmount
  }

  const actualPrice = Number(service?.price ?? 0)
  const percent = resolveLineCommissionPercent(service, branchId)
  return calculateCommissionAmount(actualPrice, percent)
}

/** Tổng hoa hồng hóa đơn (không gồm Tips). Ưu tiên snapshot đã lưu trên hóa đơn. */
export function getInvoiceServiceCommission(invoice) {
  return getInvoiceServiceDetails(invoice).reduce(
    (sum, service) => sum + getServiceLineCommissionAmount(service, {
      branchId: invoice?.branchId ?? '',
      preferSnapshot: true,
    }),
    0,
  )
}

function buildBaseServiceLine(service, branchId = '') {
  const originalPrice = Number(service.price ?? 0)
  const commissionPercent = resolveCommissionPercent(branchId, service)

  return {
    id: service.id,
    name: service.name,
    originalPrice,
    price: originalPrice,
    discountAmount: 0,
    commissionPercent,
    commissionAmount: calculateCommissionAmount(originalPrice, commissionPercent),
  }
}

function withLineCommission(service, branchId = '') {
  const commissionPercent = resolveLineCommissionPercent(service, branchId)
  const price = Number(service.price ?? 0)
  return {
    ...service,
    commissionPercent,
    commissionAmount: calculateCommissionAmount(price, commissionPercent),
  }
}

export function applyDiscountToServices(services, discountInput, branchId = '') {
  if (!Array.isArray(services) || services.length === 0) return []

  const parsed = parseDiscountInput(discountInput)
  const originalTotal = services.reduce(
    (sum, service) => sum + Number(service.originalPrice ?? service.price ?? 0),
    0,
  )

  if (!parsed.type || originalTotal <= 0) {
    return services.map((service) => withLineCommission({
      ...service,
      originalPrice: service.originalPrice ?? service.price ?? 0,
      price: service.originalPrice ?? service.price ?? 0,
      discountAmount: service.discountAmount ?? 0,
    }, branchId))
  }

  const totalDiscount = parsed.type === 'percent'
    ? Math.round(originalTotal * parsed.value / 100)
    : Math.min(parsed.value, originalTotal)

  let remainingDiscount = totalDiscount

  return services.map((service, index) => {
    const originalPrice = Number(service.originalPrice ?? service.price ?? 0)
    const lineDiscount = index === services.length - 1
      ? remainingDiscount
      : Math.round(totalDiscount * originalPrice / originalTotal)
    remainingDiscount -= lineDiscount
    const actualPrice = Math.max(0, originalPrice - lineDiscount)

    return withLineCommission({
      ...service,
      originalPrice,
      price: actualPrice,
      discountAmount: lineDiscount,
    }, branchId)
  })
}

export function buildServiceDetailsForSave(selectedIds, branchId, fallbackServices = []) {
  const serviceMap = getServiceMapForBranch(branchId)

  return selectedIds
    .map((id) => {
      const live = serviceMap[id]
      const fallback = fallbackServices.find((service) => service.id === id)
      const service = live || fallback
      if (!service) return null
      return buildBaseServiceLine(service, branchId)
    })
    .filter(Boolean)
}

export function calculateServiceCommissionFromDetails(services, branchId = '') {
  return services.reduce(
    (sum, service) => sum + getServiceLineCommissionAmount(service, { branchId }),
    0,
  )
}

export function calculateCommissionFromDetails(services, branchId = '') {
  return calculateServiceCommissionFromDetails(services, branchId)
}

export function calculateCommission(
  selectedIds,
  tips,
  branchId = '',
  fallbackServices = [],
  _branchName = '',
  discountInput = '',
) {
  const services = buildServiceDetailsForSave(selectedIds, branchId, fallbackServices)
  const discounted = applyDiscountToServices(services, discountInput, branchId)
  return calculateServiceCommissionFromDetails(discounted, branchId)
}

export function calculateInvoiceTotals(
  selectedIds,
  tips,
  branchId = '',
  fallbackServices = [],
  _branchName = '',
  discountInput = '',
) {
  const baseServices = buildServiceDetailsForSave(selectedIds, branchId, fallbackServices)
  const services = applyDiscountToServices(baseServices, discountInput, branchId)
  const parsed = parseDiscountInput(discountInput)

  const originalServiceTotal = services.reduce(
    (sum, service) => sum + Number(service.originalPrice ?? service.price ?? 0),
    0,
  )
  const discountAmount = services.reduce(
    (sum, service) => sum + Number(service.discountAmount ?? 0),
    0,
  )
  const serviceTotal = services.reduce((sum, service) => sum + Number(service.price ?? 0), 0)
  const tipsValue = parseTips(tips)
  const payment = serviceTotal
  const customerTotal = payment + tipsValue
  const serviceCommission = calculateServiceCommissionFromDetails(services, branchId)

  return {
    originalServiceTotal,
    discountInput: parsed.input,
    discountType: parsed.type,
    discountValue: parsed.value,
    discountAmount,
    serviceTotal,
    payment,
    tips: tipsValue,
    total: customerTotal,
    customerTotal,
    commission: serviceCommission,
    serviceCommission,
    services,
  }
}

export function getSelectedServiceDetails(selectedIds, branchId = '', fallbackServices = []) {
  return buildServiceDetailsForSave(selectedIds, branchId, fallbackServices)
}

export function getInvoiceServiceDetails(invoice) {
  if (Array.isArray(invoice?.services) && invoice.services.length > 0) {
    return invoice.services
  }
  return []
}

export function invoiceHasDiscount(invoice) {
  if (Number.isFinite(invoice?.discountAmount) && invoice.discountAmount > 0) return true
  return getInvoiceServiceDetails(invoice).some(
    (service) => Number(service.discountAmount ?? 0) > 0,
  )
}

export function getInvoiceOriginalServiceTotal(invoice) {
  if (Number.isFinite(invoice?.originalServiceTotal) && invoice.originalServiceTotal > 0) {
    return invoice.originalServiceTotal
  }

  const details = getInvoiceServiceDetails(invoice)
  if (details.length > 0) {
    return details.reduce(
      (sum, service) => sum + Number(service.originalPrice ?? service.price ?? 0),
      0,
    )
  }

  return getInvoiceServiceTotal(invoice)
}

export function getInvoiceDiscountAmount(invoice) {
  if (Number.isFinite(invoice?.discountAmount)) return invoice.discountAmount
  return getInvoiceServiceDetails(invoice).reduce(
    (sum, service) => sum + Number(service.discountAmount ?? 0),
    0,
  )
}

export function formatServiceLine(service, branchId = '') {
  const price = formatCurrency(service.price).replace(' ₫', 'đ')
  const percent = resolveLineCommissionPercent(service, branchId)
  const commission = formatCurrency(calculateCommissionAmount(service.price, percent)).replace(' ₫', 'đ')
  const original = Number(service.originalPrice ?? service.price ?? 0)
  const discount = Number(service.discountAmount ?? 0)
  const promoNote = discount > 0 && original > service.price
    ? ` (gốc ${formatCurrency(original).replace(' ₫', 'đ')})`
    : ''
  return `${service.name}: ${price}${promoNote} | HH ${percent}% = ${commission}`
}

export function getInvoiceTips(invoice) {
  return Number.isFinite(invoice?.tips) ? invoice.tips : 0
}

/** Thanh toán dịch vụ / Doanh thu tiền vé = Giá vé − KM, không gồm Tips. */
export function getInvoicePayment(invoice) {
  return getInvoiceServiceTotal(invoice)
}

/** Alias nghiệp vụ: Doanh thu tiền vé. */
export function getInvoiceTicketRevenue(invoice) {
  return getInvoicePayment(invoice)
}

/** Giá vé gốc (trước khuyến mãi). */
export function getInvoiceTicketPrice(invoice) {
  return getInvoiceOriginalServiceTotal(invoice)
}

/** Tổng khách thanh toán = Doanh thu tiền vé + Tips. */
export function getInvoiceCustomerTotal(invoice) {
  if (Number.isFinite(invoice?.total)) return invoice.total
  return getInvoicePayment(invoice) + getInvoiceTips(invoice)
}

export function getInvoiceServiceTotal(invoice) {
  if (Number.isFinite(invoice?.serviceTotal)) return invoice.serviceTotal

  const details = getInvoiceServiceDetails(invoice)
  if (details.length > 0) {
    return details.reduce((sum, service) => sum + Number(service.price ?? 0), 0)
  }

  const total = Number.isFinite(invoice?.total) ? invoice.total : 0
  const tips = Number.isFinite(invoice?.tips) ? invoice.tips : 0

  return Math.max(0, total - tips)
}
