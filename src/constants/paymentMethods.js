/** Giá trị chuẩn lưu DB / app. */
export const PAYMENT_METHODS = Object.freeze({
  CASH: 'cash',
  BANK_TRANSFER: 'bank_transfer',
})

/** Legacy Production từng dùng `transfer` — vẫn đọc được. */
export const LEGACY_PAYMENT_METHOD_TRANSFER = 'transfer'

export const PAYMENT_METHOD_OPTIONS = [
  { value: PAYMENT_METHODS.CASH, label: 'Tiền mặt' },
  { value: PAYMENT_METHODS.BANK_TRANSFER, label: 'Chuyển khoản' },
]

export const PAYMENT_METHOD_FILTER_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: PAYMENT_METHODS.CASH, label: 'Tiền mặt' },
  { value: PAYMENT_METHODS.BANK_TRANSFER, label: 'Chuyển khoản' },
  { value: 'unknown', label: 'Chưa xác định' },
]

/**
 * Chuẩn hoá về cash | bank_transfer | '' (chưa xác định).
 * `transfer` (legacy) → bank_transfer.
 */
export function normalizePaymentMethod(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (raw === PAYMENT_METHODS.CASH) return PAYMENT_METHODS.CASH
  if (
    raw === PAYMENT_METHODS.BANK_TRANSFER
    || raw === LEGACY_PAYMENT_METHOD_TRANSFER
    || raw === 'bank'
    || raw === 'ck'
  ) {
    return PAYMENT_METHODS.BANK_TRANSFER
  }
  return ''
}

export function isKnownPaymentMethod(value) {
  const n = normalizePaymentMethod(value)
  return n === PAYMENT_METHODS.CASH || n === PAYMENT_METHODS.BANK_TRANSFER
}

export function getPaymentMethodLabel(value) {
  const n = normalizePaymentMethod(value)
  if (n === PAYMENT_METHODS.CASH) return 'Tiền mặt'
  if (n === PAYMENT_METHODS.BANK_TRANSFER) return 'Chuyển khoản'
  return 'Chưa xác định'
}

export function invoiceMatchesPaymentMethodFilter(invoice, filterValue) {
  if (!filterValue) return true
  const n = normalizePaymentMethod(invoice?.paymentMethod)
  if (filterValue === 'unknown') return !n
  return n === filterValue
}
