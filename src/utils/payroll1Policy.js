import { isEmployeeProfileComplete, getMissingProfileFields } from './employeeStorage'
import { loadSystemSettings } from './systemSettingsStorage'
import { formatVnDate, getIctTodayDate, isAfterIctEndOfDay, listDatesInclusive } from './ictTime'

export const PAYROLL1_PERIOD_START = '2026-07-01'
/** Ngày tham chiếu nội bộ (không dùng để khóa HĐ / không hiện popup). */
export const PAYROLL1_DEFAULT_LOCK_DATE = '2026-07-18'

export function getPayroll1PeriodStart() {
  return loadSystemSettings().payroll1PeriodStart || PAYROLL1_PERIOD_START
}

export function getPayroll1LockDate() {
  const stored = loadSystemSettings().payroll1LockDate || PAYROLL1_DEFAULT_LOCK_DATE
  if (stored < PAYROLL1_DEFAULT_LOCK_DATE) return PAYROLL1_DEFAULT_LOCK_DATE
  return stored
}

export function isPayroll1FeatureEnabled() {
  return loadSystemSettings().payroll1Enabled !== false
}

/** Sau ngày lockDate (ICT) — chỉ dùng cho copy thông báo nhắc, không khóa hóa đơn. */
export function isPayroll1DeadlinePassed(now = new Date()) {
  if (!isPayroll1FeatureEnabled()) return false
  return isAfterIctEndOfDay(getPayroll1LockDate(), now)
}

export function getPayroll1DateRange(now = new Date()) {
  const start = getPayroll1PeriodStart()
  const today = getIctTodayDate(now)
  const end = today < start ? start : today
  return { start, end, dates: listDatesInclusive(start, end) }
}

export function summarizeEmployeePayroll1Status({
  employee,
  attendanceRecords = [],
  invoices = [],
  dayReviews = [],
  override = null,
  now = new Date(),
}) {
  const { start, end, dates } = getPayroll1DateRange(now)
  const attendanceByDate = new Map(
    (attendanceRecords ?? [])
      .filter((row) => row?.date >= start && row?.date <= end)
      .map((row) => [row.date, row]),
  )

  // invoices / dayReviews: tham số giữ tương thích caller; không dùng cho hoàn thành / hạn chế.
  void invoices
  void dayReviews

  const missingAttendanceDates = dates.filter((date) => !attendanceByDate.has(date))
  const attendanceComplete = missingAttendanceDates.length === 0

  const profileComplete = isEmployeeProfileComplete(employee)
  const adminConfirmed = Boolean(override?.adminConfirmed)

  // Chỉ Hồ sơ + Chấm công cho nhắc nhở. Không khóa tạo/sửa hóa đơn.
  const dataComplete = adminConfirmed || (profileComplete && attendanceComplete)
  const deadlinePassed = isPayroll1DeadlinePassed(now)

  const completedCount = [profileComplete, attendanceComplete].filter(Boolean).length
  const progressPercent = Math.round((completedCount / 2) * 100)

  const pendingTasks = []
  if (!profileComplete) {
    const missingFields = getMissingProfileFields(employee)
    pendingTasks.push({
      id: 'profile',
      pageId: 'profile',
      label: 'Hoàn thiện hồ sơ cá nhân',
      detail: missingFields.length
        ? `Còn thiếu: ${missingFields.join(', ')}`
        : 'Hồ sơ chưa đủ thông tin bắt buộc',
      buttonLabel: 'Hoàn thiện hồ sơ',
    })
  }
  if (!attendanceComplete) {
    pendingTasks.push({
      id: 'attendance',
      pageId: 'attendance',
      label: `Bổ sung chấm công (còn thiếu ${missingAttendanceDates.length} ngày)`,
      detail: `Còn thiếu ${missingAttendanceDates.length} ngày từ ${formatVnDate(start)} đến nay`,
      buttonLabel: 'Bổ sung chấm công',
    })
  }

  const missingSummary = pendingTasks.map((task) => task.label)

  const lastUpdatedCandidates = [
    employee?.updatedAt,
    ...(attendanceRecords ?? []).map((r) => r.updatedAt || r.submittedAt),
    override?.updatedAt,
  ].filter(Boolean)
  lastUpdatedCandidates.sort()
  const lastUpdatedAt = lastUpdatedCandidates[lastUpdatedCandidates.length - 1] ?? ''

  return {
    employeeId: employee?.id ?? '',
    branchId: employee?.branchId ?? '',
    periodStart: start,
    periodEnd: end,
    profileComplete,
    profileStatusLabel: profileComplete ? 'Đã hoàn thành' : 'Chưa hoàn thành',
    attendanceComplete,
    attendanceStatusLabel: attendanceComplete ? 'Đã kiểm tra' : 'Còn thiếu ngày',
    missingAttendanceCount: missingAttendanceDates.length,
    missingAttendanceDates,
    completedCount,
    progressPercent,
    pendingTasks,
    missingSummary,
    dataComplete,
    adminConfirmed,
    deadlinePassed,
    lockDate: getPayroll1LockDate(),
    lockDateLabel: formatVnDate(getPayroll1LockDate()),
    lastUpdatedAt,
    dayRows: dates.map((date) => {
      const attendance = attendanceByDate.get(date)
      return {
        date,
        dateLabel: formatVnDate(date),
        attendance,
        attendanceStatus: attendance?.status ?? '',
      }
    }),
  }
}

/** Popup kỳ lương 1 đã tắt — luôn không hiện. */
export function shouldShowPayroll1Notice(_status) {
  return false
}

export function filterPayroll1AdminRows(rows, filter) {
  if (!filter || filter === 'all') return rows
  return rows.filter((row) => {
    if (filter === 'incomplete_profile') return !row.profileComplete
    if (filter === 'incomplete_attendance') return !row.attendanceComplete
    if (filter === 'complete') return row.dataComplete || row.progressPercent === 100
    if (filter === 'incomplete') return !row.dataComplete
    return true
  })
}
