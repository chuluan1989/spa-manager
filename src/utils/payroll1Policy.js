import { isEmployeeProfileComplete } from './employeeStorage'
import { loadSystemSettings } from './systemSettingsStorage'
import { formatVnDate, getIctTodayDate, isAfterIctEndOfDay, listDatesInclusive } from './ictTime'

export const PAYROLL1_PERIOD_START = '2026-07-01'
export const PAYROLL1_DEFAULT_LOCK_DATE = '2026-07-15'

export const PAYROLL1_INVOICE_LOCK_MESSAGE =
  'Tài khoản đang tạm khóa chức năng nhập hóa đơn do chưa hoàn thành dữ liệu kỳ lương 1. Vui lòng hoàn thành Hồ sơ, Chấm công và kiểm tra Hóa đơn từ ngày 01/07/2026.'

export const PAYROLL1_NOTICE_TITLE = 'THÔNG BÁO HOÀN THIỆN DỮ LIỆU KỲ LƯƠNG 1'

export function getPayroll1PeriodStart() {
  return loadSystemSettings().payroll1PeriodStart || PAYROLL1_PERIOD_START
}

export function getPayroll1LockDate() {
  return loadSystemSettings().payroll1LockDate || PAYROLL1_DEFAULT_LOCK_DATE
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

  const uncheckedInvoiceDates = dates.filter((date) => {
    const review = reviewByDate.get(date)
    return !review || (review.reviewStatus !== 'checked' && review.reviewStatus !== 'no_tour')
  })
  const invoiceReviewComplete = uncheckedInvoiceDates.length === 0

  const profileComplete = isEmployeeProfileComplete(employee)
  const adminConfirmed = Boolean(override?.adminConfirmed)
  const manualUnlock = Boolean(override?.manualUnlock)

  const dataComplete = adminConfirmed || (profileComplete && attendanceComplete && invoiceReviewComplete)
  const deadlinePassed = isPayroll1DeadlinePassed(now)
  const invoiceCreateLocked = deadlinePassed && !dataComplete && !manualUnlock

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
