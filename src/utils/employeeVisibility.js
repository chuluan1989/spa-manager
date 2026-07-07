import {
  canViewEmployeeAvatar,
  canViewEmployeeBankInfo,
  canViewEmployeeCccd,
  canViewEmployeeCurrentAddress,
  canViewEmployeeEmergencyContact,
  canViewEmployeeNote,
  canViewEmployeePersonalInfo,
} from '../constants/auth'

const CCCD_FIELDS = [
  'cccd',
  'cccdIssueDate',
  'cccdIssuePlace',
  'cccdAddress',
  'cccdFrontImage',
  'cccdBackImage',
]
const BANK_FIELDS = ['bankName', 'bankAccountHolder', 'bankAccount']
const EMERGENCY_CONTACT_FIELDS = ['emergencyContactName', 'emergencyContactPhone']
const PERSONAL_FIELDS = ['email', 'gender', 'dateOfBirth']

function omit(source, keys) {
  const result = { ...source }
  keys.forEach((key) => {
    delete result[key]
  })
  return result
}

/**
 * Trả về bản sao hồ sơ nhân viên đã LOẠI BỎ HẲN (không chỉ để trống) các trường
 * nhạy cảm mà người xem hiện tại (theo role) không có quyền truy cập.
 *
 * Đây KHÔNG phải là ẩn bằng CSS/UI: các trường bị loại bỏ ngay ở tầng dữ liệu
 * trước khi đưa vào state/props, nên component hiển thị (VD: EmployeeProfileForm)
 * sẽ không bao giờ nhận được giá trị thật nếu role không đủ quyền xem.
 *
 * Dùng `delete` (loại bỏ key) thay vì gán chuỗi rỗng để khi form được submit lại
 * cho `updateEmployee`, các trường bị ẩn sẽ KHÔNG bị ghi đè thành rỗng — vì
 * `updateEmployee` merge theo kiểu {...current, ...data}, thiếu key nghĩa là
 * giữ nguyên giá trị đã lưu.
 *
 * Dùng cho các màn Quản lý chi nhánh xem/sửa hồ sơ nhân viên khác (VD: trang Nhân viên).
 * Không dùng cho "Hồ sơ cá nhân" (nhân viên luôn xem đầy đủ hồ sơ của chính mình)
 * và không dùng khi forceAdminFields = true (Admin xem toàn bộ qua Cài đặt).
 */
export function redactEmployeeForViewer(employee, { forceAdminFields = false } = {}) {
  if (!employee) return employee
  if (forceAdminFields) return { ...employee }

  let safe = { ...employee }

  if (!canViewEmployeeCccd()) safe = omit(safe, CCCD_FIELDS)
  if (!canViewEmployeeCurrentAddress()) safe = omit(safe, ['currentAddress'])
  if (!canViewEmployeeBankInfo()) safe = omit(safe, BANK_FIELDS)
  if (!canViewEmployeeEmergencyContact()) safe = omit(safe, EMERGENCY_CONTACT_FIELDS)
  if (!canViewEmployeeNote()) safe = omit(safe, ['note'])
  if (!canViewEmployeePersonalInfo()) safe = omit(safe, PERSONAL_FIELDS)
  if (!canViewEmployeeAvatar()) safe = omit(safe, ['avatar'])

  return safe
}
