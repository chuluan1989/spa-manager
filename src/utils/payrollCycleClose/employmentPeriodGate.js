/**
 * Root rule: không tạo/nhắc chấm công & kỳ lương trước ngày nhân viên bắt đầu làm.
 */
import { getEmployeeBranchSegments, getSortedBranchHistory } from '../employeeBranchTimeline'

function normalizeDate(value) {
  const text = String(value ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export const MISSING_EMPLOYMENT_START_WARNING =
  'Nhân viên chưa có ngày bắt đầu làm việc trong hồ sơ. Không thể loại trừ kỳ trước khi vào làm — vui lòng cập nhật startDate (Admin).'

/**
 * Ngày bắt đầu làm việc chuẩn:
 * 1) employee.startDate / start_date
 * 2) fromDate sớm nhất trong branch segments / branch history
 * Không tự mặc định về nhiều tháng trước khi thiếu dữ liệu.
 *
 * @returns {{ startDate: string, source: 'profile'|'branch_history'|'missing', warning: string }}
 */
export function resolveEmployeeEmploymentStartDate(employee) {
  if (!employee) {
    return { startDate: '', source: 'missing', warning: MISSING_EMPLOYMENT_START_WARNING }
  }

  const profile = normalizeDate(employee.startDate || employee.start_date)
  if (profile) {
    return { startDate: profile, source: 'profile', warning: '' }
  }

  const segmentStarts = getEmployeeBranchSegments(employee)
    .map((segment) => normalizeDate(segment.fromDate))
    .filter(Boolean)
    .sort()
  if (segmentStarts[0]) {
    return { startDate: segmentStarts[0], source: 'branch_history', warning: '' }
  }

  const historyStarts = getSortedBranchHistory(employee)
    .map((entry) => normalizeDate(entry.effectiveDate))
    .filter(Boolean)
    .sort()
  if (historyStarts[0]) {
    return { startDate: historyStarts[0], source: 'branch_history', warning: '' }
  }

  return { startDate: '', source: 'missing', warning: MISSING_EMPLOYMENT_START_WARNING }
}

export function resolveEmployeeEmploymentEndDate(employee) {
  return normalizeDate(employee?.endDate || employee?.daysOff || employee?.end_date || '')
}

/**
 * Toàn bộ kỳ nằm trước startDate (hoặc sau endDate) → kỳ không tồn tại với NV.
 */
export function isClosePeriodOutsideEmployment(
  { fromDate, toDate },
  employmentStartDate = '',
  employmentEndDate = '',
) {
  const from = normalizeDate(fromDate)
  const to = normalizeDate(toDate)
  if (!from || !to) return false
  const start = normalizeDate(employmentStartDate)
  const end = normalizeDate(employmentEndDate)
  if (start && to < start) return true
  if (end && from > end) return true
  return false
}

/**
 * Clamp khoảng kiểm tra chấm công vào thời gian làm việc.
 * @returns {{ fromDate: string, toDate: string, clamped: boolean, empty: boolean }}
 */
export function clampRangeToEmployment(fromDate, toDate, employmentStartDate = '', employmentEndDate = '') {
  let from = normalizeDate(fromDate)
  let to = normalizeDate(toDate)
  if (!from || !to) {
    return { fromDate: '', toDate: '', clamped: false, empty: true }
  }
  if (from > to) {
    const swap = from
    from = to
    to = swap
  }

  const start = normalizeDate(employmentStartDate)
  const end = normalizeDate(employmentEndDate)
  let clamped = false

  if (start && from < start) {
    from = start
    clamped = true
  }
  if (end && to > end) {
    to = end
    clamped = true
  }

  if (!from || !to || from > to) {
    return { fromDate: '', toDate: '', clamped: true, empty: true }
  }
  return { fromDate: from, toDate: to, clamped, empty: false }
}

/** CTA banner/panel gửi chốt. */
export function formatPayrollCloseSubmitCta(cycleLabel) {
  const label = String(cycleLabel || '').trim() || 'kỳ lương'
  return `Gửi chốt lương ${label}`
}
