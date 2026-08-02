import { getAttendanceStatusLabel, isVoidAttendanceStatus } from '../../constants/attendanceTypes'
import { listDatesInclusive } from '../ictTime'
import { CLOSE_CYCLES, getCloseCycleRange } from './payCycleCalendar'

export const ATTENDANCE_DAY_RESULT = {
  RECORDED: 'recorded',
  MISSING: 'missing',
  PENDING_CORRECTION: 'pending_correction',
  FUTURE: 'future',
  OUT_OF_EMPLOYMENT: 'out_of_employment',
}

export const MISSING_ATTENDANCE_LABEL = 'Chưa chấm công'
export const PENDING_CORRECTION_LABEL = 'Chờ duyệt bổ sung'
export const FUTURE_ATTENDANCE_LABEL = 'Chưa đến ngày'
export const OUT_OF_EMPLOYMENT_LABEL = 'Ngoài thời gian làm việc'

/** Ngoại lệ lịch sử một lần: Kỳ 1 tháng 07/2026 — không bắt buộc đủ chấm công để gửi chốt. */
export function isAttendanceOptionalForCloseCycle(billingMonth, cycle) {
  return billingMonth === '2026-07' && cycle === CLOSE_CYCLES.PERIOD_1
}

/** Bản ghi hợp lệ = có status và không void/hủy. */
export function isValidAttendanceRecord(record) {
  if (!record) return false
  const status = record.status ?? ''
  if (!status) return false
  return !isVoidAttendanceStatus(status)
}

/**
 * Chọn bản ghi hợp lệ mới nhất trong ngày (nếu nhiều).
 */
export function pickValidAttendanceForDate(records, employeeId, date) {
  const matches = (records ?? []).filter(
    (row) => row.employeeId === employeeId && row.date === date && isValidAttendanceRecord(row),
  )
  if (matches.length === 0) return null
  return [...matches].sort((a, b) => String(b.updatedAt || b.submittedAt || '').localeCompare(
    String(a.updatedAt || a.submittedAt || ''),
  ))[0]
}

function pickPendingCorrection(requests, employeeId, date) {
  return (requests ?? []).find((row) => (
    row.employeeId === employeeId
    && (row.date === date || row.attendanceDate === date)
    && row.status === 'pending'
  )) ?? null
}

function isOutsideEmployment(date, employmentStartDate, employmentEndDate) {
  if (employmentStartDate && date < employmentStartDate) return true
  if (employmentEndDate && date > employmentEndDate) return true
  return false
}

/**
 * Danh sách ngày trong kỳ + kết quả chấm công.
 * - Chỉ xét fromDate–toDate được truyền vào (đúng kỳ đang chốt).
 * - Ngày trước startDate / sau endDate → không tính thiếu, không chặn chốt.
 * - Không có bản ghi hợp lệ → "Chưa chấm công" (KHÔNG tự thành nghỉ không phép).
 * - Có yêu cầu pending → "Chờ duyệt bổ sung" (vẫn chặn chốt lương).
 * - Ngày hiện tại / tương lai không tính thiếu.
 */
export function buildEmployeeAttendancePeriodDays({
  employeeId,
  records = [],
  fromDate,
  toDate,
  todayDate = '',
  correctionRequests = [],
  employmentStartDate = '',
  employmentEndDate = '',
}) {
  if (!employeeId || !fromDate || !toDate) {
    return { days: [], summary: emptySummary() }
  }

  const dates = listDatesInclusive(fromDate, toDate)
  const days = dates.map((date) => {
    if (isOutsideEmployment(date, employmentStartDate, employmentEndDate)) {
      return {
        date,
        result: ATTENDANCE_DAY_RESULT.OUT_OF_EMPLOYMENT,
        resultLabel: OUT_OF_EMPLOYMENT_LABEL,
        status: '',
        record: null,
        correctionRequest: null,
        isMissing: false,
        isPendingCorrection: false,
        blocksClose: false,
        isRequired: false,
        canRequestCorrection: false,
      }
    }

    const record = pickValidAttendanceForDate(records, employeeId, date)
    if (record) {
      return {
        date,
        result: ATTENDANCE_DAY_RESULT.RECORDED,
        resultLabel: getAttendanceStatusLabel(record.status),
        status: record.status,
        record,
        correctionRequest: null,
        isMissing: false,
        isPendingCorrection: false,
        blocksClose: false,
        isRequired: true,
        canRequestCorrection: false,
      }
    }

    const isFuture = Boolean(todayDate && date > todayDate)
    if (isFuture) {
      return {
        date,
        result: ATTENDANCE_DAY_RESULT.FUTURE,
        resultLabel: FUTURE_ATTENDANCE_LABEL,
        status: '',
        record: null,
        correctionRequest: null,
        isMissing: false,
        isPendingCorrection: false,
        blocksClose: false,
        isRequired: false,
        canRequestCorrection: false,
      }
    }

    // Hôm nay: chưa bắt buộc thiếu (chỉ ngày trước đó)
    const isToday = Boolean(todayDate && date === todayDate)
    if (isToday) {
      return {
        date,
        result: ATTENDANCE_DAY_RESULT.MISSING,
        resultLabel: MISSING_ATTENDANCE_LABEL,
        status: '',
        record: null,
        correctionRequest: null,
        isMissing: false,
        isPendingCorrection: false,
        blocksClose: false,
        isRequired: false,
        canRequestCorrection: false,
      }
    }

    const pending = pickPendingCorrection(correctionRequests, employeeId, date)
    if (pending) {
      return {
        date,
        result: ATTENDANCE_DAY_RESULT.PENDING_CORRECTION,
        resultLabel: PENDING_CORRECTION_LABEL,
        status: '',
        record: null,
        correctionRequest: pending,
        isMissing: false,
        isPendingCorrection: true,
        blocksClose: true,
        isRequired: true,
        canRequestCorrection: false,
      }
    }

    return {
      date,
      result: ATTENDANCE_DAY_RESULT.MISSING,
      resultLabel: MISSING_ATTENDANCE_LABEL,
      status: '',
      record: null,
      correctionRequest: null,
      isMissing: true,
      isPendingCorrection: false,
      blocksClose: true,
      isRequired: true,
      canRequestCorrection: true,
    }
  })

  return { days, summary: summarizePeriodDays(days) }
}

function emptySummary() {
  return {
    totalDays: 0,
    requiredDays: 0,
    completedDays: 0,
    missingDays: 0,
    pendingCorrectionDays: 0,
    unresolvedDays: 0,
    futureDays: 0,
    missingDates: [],
    pendingCorrectionDates: [],
    unresolvedDates: [],
    isComplete: true,
  }
}

export function summarizePeriodDays(days) {
  const required = days.filter((d) => d.isRequired)
  const missingDates = required.filter((d) => d.isMissing).map((d) => d.date)
  const pendingCorrectionDates = required
    .filter((d) => d.isPendingCorrection)
    .map((d) => d.date)
  const unresolvedDates = required.filter((d) => d.blocksClose).map((d) => d.date)
  const completedDays = required.filter((d) => !d.blocksClose).length
  return {
    totalDays: days.length,
    requiredDays: required.length,
    completedDays,
    missingDays: missingDates.length,
    pendingCorrectionDays: pendingCorrectionDates.length,
    unresolvedDays: unresolvedDates.length,
    futureDays: days.filter((d) => d.result === ATTENDANCE_DAY_RESULT.FUTURE).length,
    missingDates,
    pendingCorrectionDates,
    unresolvedDates,
    isComplete: unresolvedDates.length === 0,
  }
}

/**
 * Resolve khoảng ngày từ bộ lọc kỳ / ngày / khoảng.
 */
export function resolveAttendanceReviewRange({
  mode = 'cycle',
  billingMonth = '',
  cycle = CLOSE_CYCLES.PERIOD_2,
  singleDate = '',
  fromDate = '',
  toDate = '',
  month = '',
}) {
  if (mode === 'day' && singleDate) {
    return { fromDate: singleDate, toDate: singleDate, cycle: '', billingMonth: '' }
  }
  if (mode === 'range' && fromDate && toDate) {
    const a = fromDate <= toDate ? fromDate : toDate
    const b = fromDate <= toDate ? toDate : fromDate
    return { fromDate: a, toDate: b, cycle: '', billingMonth: '' }
  }
  if (mode === 'month' && month) {
    const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
    return {
      fromDate: `${month}-01`,
      toDate: `${month}-${String(last).padStart(2, '0')}`,
      cycle: '',
      billingMonth: month,
    }
  }
  if (mode === 'cycle' && billingMonth && cycle) {
    const range = getCloseCycleRange(billingMonth, cycle)
    return {
      fromDate: range.fromDate,
      toDate: range.toDate,
      cycle: range.cycle,
      billingMonth: range.billingMonth,
      submitDate: range.submitDate,
    }
  }
  return { fromDate: '', toDate: '', cycle: '', billingMonth: '' }
}

function formatDateList(dates) {
  return (dates ?? []).map((iso) => {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  })
}

/** Thông báo thiếu ngày — nhắc gửi yêu cầu bổ sung (không nhắc trừ lương). */
export function formatMissingDaysMessage(summary) {
  const missing = summary?.missingDates ?? []
  if (missing.length <= 0) return ''
  return `Bạn còn ngày chưa chấm công: ${formatDateList(missing).join(', ')}. Vui lòng gửi yêu cầu bổ sung chấm công.`
}

export function formatPendingCorrectionMessage(summary) {
  const pending = summary?.pendingCorrectionDates ?? []
  if (pending.length <= 0) return ''
  return `Bạn còn ngày đang chờ duyệt bổ sung: ${formatDateList(pending).join(', ')}. Vui lòng đợi Admin/Quản lý xử lý trước khi gửi chốt kỳ lương.`
}

/** Ghép message chặn chốt lương (thiếu + chờ duyệt). */
export function formatCloseBlockAttendanceMessage(summary) {
  const parts = [
    formatMissingDaysMessage(summary),
    formatPendingCorrectionMessage(summary),
  ].filter(Boolean)
  return parts.join(' ')
}
