import { isEmployeeProfileComplete, getMissingProfileFields } from './employeeStorage'
import { loadSystemSettings } from './systemSettingsStorage'
import { formatVnDate, getIctTodayDate, isAfterIctEndOfDay, listDatesInclusive } from './ictTime'

export const PAYROLL1_PERIOD_START = '2026-07-01'
/** Hết ngày này (ICT) → từ 00:00 ngày 19/07 hạn chế tạo HĐ nếu thiếu dữ liệu. */
export const PAYROLL1_DEFAULT_LOCK_DATE = '2026-07-18'

export const PAYROLL1_INVOICE_LOCK_MESSAGE =
  'Tài khoản đang tạm hạn chế nhập hóa đơn do chưa hoàn thành Hồ sơ nhân viên hoặc Chấm công. Vui lòng hoàn thành các mục còn thiếu hoặc liên hệ Admin.'

export const PAYROLL1_NOTICE_TITLE = 'THÔNG BÁO HOÀN THIỆN DỮ LIỆU'

export const PAYROLL1_NOTICE_BEFORE_DEADLINE =
  'Vui lòng hoàn thành Hồ sơ nhân viên và Chấm công trước ngày 19/07/2026. Sau thời gian này, tài khoản chưa hoàn thành sẽ bị hạn chế cho đến khi bổ sung đầy đủ hoặc được Admin mở lại.'

export const PAYROLL1_NOTICE_AFTER_DEADLINE =
  'Tài khoản đang tạm hạn chế nhập hóa đơn do chưa hoàn thành Hồ sơ nhân viên hoặc Chấm công. Vui lòng hoàn thành các mục còn thiếu hoặc liên hệ Admin.'

export function getPayroll1PeriodStart() {
  return loadSystemSettings().payroll1PeriodStart || PAYROLL1_PERIOD_START
}

export function getPayroll1LockDate() {
  const stored = loadSystemSettings().payroll1LockDate || PAYROLL1_DEFAULT_LOCK_DATE
  // Mở lại hạn chế hiện tại: mọi lock date cũ trước 18/07 được nâng tối thiểu lên 18/07
  // → hạn chế chỉ áp từ 00:00 19/07/2026. Admin vẫn được gia hạn sang ngày sau.
  if (stored < PAYROLL1_DEFAULT_LOCK_DATE) return PAYROLL1_DEFAULT_LOCK_DATE
  return stored
}

export function isPayroll1FeatureEnabled() {
  return loadSystemSettings().payroll1Enabled !== false
}

/** Khóa tạo HĐ sau 23:59 ngày lockDate (ICT) — tức từ 00:00 ngày kế tiếp. */
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
  const reviewByDate = new Map(
    (dayReviews ?? [])
      .filter((row) => row?.dayDate >= start && row?.dayDate <= end)
      .map((row) => [row.dayDate, row]),
  )
  const invoicesByDate = new Map()
  for (const invoice of invoices ?? []) {
    if (!invoice?.date || invoice.date < start || invoice.date > end) continue
    if (!invoicesByDate.has(invoice.date)) invoicesByDate.set(invoice.date, [])
    invoicesByDate.get(invoice.date).push(invoice)
  }

  const missingAttendanceDates = dates.filter((date) => !attendanceByDate.has(date))
  const attendanceComplete = missingAttendanceDates.length === 0

  // Hóa đơn / tour KHÔNG phải tiêu chí hoàn thành hay hạn chế tạo HĐ.
  // Giữ tính toán review chỉ để màn Admin xem (không dùng cho lock).
  const uncheckedInvoiceDates = dates.filter((date) => {
    const review = reviewByDate.get(date)
    return !review || (review.reviewStatus !== 'checked' && review.reviewStatus !== 'no_tour')
  })
  const invoiceReviewComplete = uncheckedInvoiceDates.length === 0

  const profileComplete = isEmployeeProfileComplete(employee)
  const adminConfirmed = Boolean(override?.adminConfirmed)
  const manualUnlock = Boolean(override?.manualUnlock)

  // Chỉ Hồ sơ + Chấm công. Không dùng hóa đơn / tour / doanh thu.
  const dataComplete = adminConfirmed || (profileComplete && attendanceComplete)
  const deadlinePassed = isPayroll1DeadlinePassed(now)
  const invoiceCreateLocked = deadlinePassed && !dataComplete && !manualUnlock

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
    ...(dayReviews ?? []).map((r) => r.updatedAt),
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
    invoiceReviewComplete,
    invoiceStatusLabel: invoiceReviewComplete ? 'Đã kiểm tra' : 'Chưa xác nhận đầy đủ',
    uncheckedInvoiceCount: uncheckedInvoiceDates.length,
    uncheckedInvoiceDates,
    completedCount,
    progressPercent,
    pendingTasks,
    missingSummary,
    dataComplete,
    adminConfirmed,
    manualUnlock,
    deadlinePassed,
    invoiceCreateLocked,
    lockDate: getPayroll1LockDate(),
    lockDateLabel: formatVnDate(getPayroll1LockDate()),
    lastUpdatedAt,
    dayRows: dates.map((date) => {
      const dayInvoices = invoicesByDate.get(date) ?? []
      const review = reviewByDate.get(date)
      const attendance = attendanceByDate.get(date)
      const tourCount = dayInvoices.length
      const ticketTotal = dayInvoices.reduce((sum, inv) => sum + Number(inv.serviceTotal ?? inv.total ?? 0), 0)
      const tipsTotal = dayInvoices.reduce((sum, inv) => sum + Number(inv.tips ?? 0), 0)
      const reviewed = review?.reviewStatus === 'checked' || review?.reviewStatus === 'no_tour'
      return {
        date,
        dateLabel: formatVnDate(date),
        tourCount,
        ticketTotal,
        tipsTotal,
        attendance,
        attendanceStatus: attendance?.status ?? '',
        reviewStatus: review?.reviewStatus ?? '',
        reviewed,
        statusLabel: reviewed
          ? (review.reviewStatus === 'no_tour' ? 'Không phát sinh tour' : 'Đã kiểm tra')
          : 'Chưa kiểm tra',
      }
    }),
  }
}

export function shouldShowPayroll1Notice(status) {
  if (!isPayroll1FeatureEnabled()) return false
  if (!status) return true
  return !status.dataComplete
}

export function filterPayroll1AdminRows(rows, filter) {
  if (!filter || filter === 'all') return rows
  return rows.filter((row) => {
    if (filter === 'incomplete_profile') return !row.profileComplete
    if (filter === 'incomplete_attendance') return !row.attendanceComplete
    if (filter === 'incomplete_invoices') return !row.invoiceReviewComplete
    if (filter === 'complete') return row.dataComplete || row.progressPercent === 100
    if (filter === 'incomplete') return !row.dataComplete
    return true
  })
}
