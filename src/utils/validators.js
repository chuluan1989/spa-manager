/**
 * Các hàm kiểm tra dữ liệu dùng chung (CCCD, số điện thoại...).
 */

export function isValidCccd(cccd) {
  const value = String(cccd ?? '').trim()
  if (!value) return true
  return /^\d{12}$/.test(value)
}

export function isValidVietnamesePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return false
  if (/^0\d{9}$/.test(digits)) return true
  if (/^84\d{9}$/.test(digits)) return true
  return false
}

/** Chuẩn hóa SĐT khách hàng — chỉ giữ chữ số. */
export function normalizeCustomerPhone(phone) {
  return String(phone ?? '').replace(/\D/g, '')
}

/** SĐT khách trên hóa đơn: tối thiểu 9 số. */
export function isValidCustomerPhone(phone) {
  return normalizeCustomerPhone(phone).length >= 9
}

/** Chỉ cho nhập số, dấu chấm hoặc khoảng trắng khi gõ SĐT khách. */
export function sanitizeCustomerPhoneInput(value) {
  const raw = String(value ?? '')
  if (raw === '') return ''
  return /^[\d.\s]+$/.test(raw) ? raw : raw.replace(/[^\d.\s]/g, '')
}

export const INVOICE_CUSTOMER_REQUIRED_MESSAGE =
  'Vui lòng nhập đầy đủ tên khách hàng và SĐT khách hàng trước khi lưu hóa đơn.'

/**
 * Validate dữ liệu hồ sơ cá nhân nhân viên tự cập nhật.
 * Bắt buộc để Lưu: Họ tên + Số điện thoại.
 * CCCD và các trường khác được phép trống (cập nhật sau).
 * Nếu đã nhập CCCD / SĐT liên hệ thì phải đúng định dạng.
 */
export function validateEmployeeSelfProfile(data) {
  const errors = {}

  if (!data.name?.trim()) {
    errors.name = 'Vui lòng nhập họ và tên'
  }

  if (!data.phone?.trim()) {
    errors.phone = 'Vui lòng nhập số điện thoại'
  } else if (!isValidVietnamesePhone(data.phone)) {
    errors.phone = 'Số điện thoại không đúng định dạng'
  }

  if (data.cccd?.trim() && !isValidCccd(data.cccd)) {
    errors.cccd = 'CCCD phải gồm đúng 12 số'
  }

  return errors
}
