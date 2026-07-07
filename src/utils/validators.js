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

/**
 * Validate dữ liệu hồ sơ cá nhân nhân viên tự cập nhật.
 * Bắt buộc: Họ tên, SĐT (đúng định dạng), CCCD (đúng 12 số).
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

  if (!data.cccd?.trim()) {
    errors.cccd = 'Vui lòng nhập số CCCD'
  } else if (!isValidCccd(data.cccd)) {
    errors.cccd = 'CCCD phải gồm đúng 12 số'
  }

  if (
    data.emergencyContactPhone?.trim()
    && !isValidVietnamesePhone(data.emergencyContactPhone)
  ) {
    errors.emergencyContactPhone = 'Số điện thoại không đúng định dạng'
  }

  return errors
}
