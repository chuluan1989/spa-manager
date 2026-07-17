import { getEmployeeProfileStatus, isEmployeeProfileComplete } from './employeeStorage'
import { loadSystemSettings } from './systemSettingsStorage'

export const PROFILE_TRACKED_FIELDS = [
  'name',
  'phone',
  'email',
  'cccd',
  'dateOfBirth',
  'gender',
  'currentAddress',
  'cccdIssueDate',
  'cccdIssuePlace',
  'cccdAddress',
  'bankName',
  'bankAccountHolder',
  'bankAccount',
]

export function getEmployeeProfileDeadline() {
  return loadSystemSettings().employeeProfileDeadline || '2026-07-10'
}

export function formatProfileDeadlineDisplay(deadline = getEmployeeProfileDeadline()) {
  if (!deadline) return '—'
  const [year, month, day] = deadline.split('-')
  if (!year || !month || !day) return deadline
  return `${day}/${month}/${year}`
}

export function isProfileDeadlinePassed(today = getTodayDate(), deadline = getEmployeeProfileDeadline()) {
  if (!deadline) return false
  return today > deadline
}

export function isEmployeeProfileFullyComplete(employee) {
  // Đủ tối thiểu: Họ tên + SĐT + CCCD (khớp isEmployeeProfileComplete).
  return isEmployeeProfileComplete(employee)
}

export function computeProfileCompletionPercent(employee) {
  if (!employee) return 0
  const filled = PROFILE_TRACKED_FIELDS.filter((field) => String(employee[field] ?? '').trim()).length
  return Math.round((filled / PROFILE_TRACKED_FIELDS.length) * 100)
}

export function getEmployeeProfileCompliance(employee, today = getTodayDate()) {
  const deadline = getEmployeeProfileDeadline()
  const isComplete = isEmployeeProfileFullyComplete(employee)
  const percent = computeProfileCompletionPercent(employee)
  const isOverdue = !isComplete && isProfileDeadlinePassed(today, deadline)
  const isLocked = isOverdue

  return {
    isComplete,
    percent,
    deadline,
    deadlineLabel: formatProfileDeadlineDisplay(deadline),
    isOverdue,
    isLocked,
    status: getEmployeeProfileStatus(employee),
    lastUpdatedAt: employee?.updatedAt ?? '',
  }
}

export function isEmployeeProfileLocked(_employee, _today = getTodayDate()) {
  // Không khóa chức năng theo hạn hồ sơ — nhân viên luôn được nhập hóa đơn / thao tác.
  return false
}

export function getEmployeeProfileBannerMessage(employee, today = getTodayDate()) {
  const compliance = getEmployeeProfileCompliance(employee, today)
  if (compliance.isComplete) return null

  if (compliance.isLocked) {
    return 'Hồ sơ nhân viên chưa hoàn chỉnh. Vui lòng cập nhật đầy đủ thông tin.'
  }

  return 'Vui lòng hoàn thiện hồ sơ trước 10/07.'
}

export function getEmployeeProfileLockMessage() {
  return 'Hồ sơ nhân viên chưa hoàn chỉnh. Vui lòng cập nhật đầy đủ thông tin.'
}

export function getProfileComplianceFilterStatus(employee, today = getTodayDate()) {
  const compliance = getEmployeeProfileCompliance(employee, today)
  if (compliance.isComplete) return 'complete'
  if (compliance.isOverdue) return 'overdue'
  return 'incomplete'
}

function getTodayDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function filterEmployeesByProfileCompliance(employees, filter, today = getTodayDate()) {
  if (!filter) return employees
  return employees.filter((employee) => getProfileComplianceFilterStatus(employee, today) === filter)
}
