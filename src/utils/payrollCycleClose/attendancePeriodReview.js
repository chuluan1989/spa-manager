import { getAttendanceStatusLabel, isVoidAttendanceStatus } from '../../constants/attendanceTypes'
import { listDatesInclusive } from '../ictTime'
import { CLOSE_CYCLES, getCloseCycleRange } from './payCycleCalendar'

export const ATTENDANCE_DAY_RESULT = {
  RECORDED: 'recorded',
  MISSING: 'missing',
  FUTURE: 'future',
}

export const MISSING_ATTENDANCE_LABEL = 'Chưa chấm công'
export const FUTURE_ATTENDANCE_LABEL = 'Chưa đến ngày'

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

/**
 * Danh sách ngày trong kỳ + kết quả chấm công đơn giản.
 * @param {object} options
 * @param {string} options.employeeId
 * @param {object[]} options.records
 * @param {string} options.fromDate
 * @param {string} options.toDate
 * @param {string} [options.todayDate] — ngày ICT hiện tại; ngày sau today = chưa đến
 */
export function buildEmployeeAttendancePeriodDays({
  employeeId,
  records = [],
  fromDate,
  toDate,
  todayDate = '',
}) {
  if (!employeeId || !fromDate || !toDate) {
    return { days: [], summary: emptySummary() }
  }

  const dates = listDatesInclusive(fromDate, toDate)
  const days = dates.map((date) => {
    const record = pickValidAttendanceForDate(records, employeeId, date)
    if (record) {
      return {
        date,
        result: ATTENDANCE_DAY_RESULT.RECORDED,
        resultLabel: getAttendanceStatusLabel(record.status),
        status: record.status,
        record,
        isMissing: false,
        isRequired: true,
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
        isMissing: false,
        isRequired: false,
      }
    }

    return {
      date,
      result: ATTENDANCE_DAY_RESULT.MISSING,
      resultLabel: MISSING_ATTENDANCE_LABEL,
      status: '',
      record: null,
      isMissing: true,
      isRequired: true,
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
    futureDays: 0,
    missingDates: [],
    isComplete: true,
  }
}

export function summarizePeriodDays(days) {
  const required = days.filter((d) => d.isRequired)
  const missingDates = required.filter((d) => d.isMissing).map((d) => d.date)
  const completedDays = required.filter((d) => !d.isMissing).length
  return {
    totalDays: days.length,
    requiredDays: required.length,
    completedDays,
    missingDays: missingDates.length,
    futureDays: days.filter((d) => d.result === ATTENDANCE_DAY_RESULT.FUTURE).length,
    missingDates,
    isComplete: missingDates.length === 0,
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

export function formatMissingDaysMessage(summary) {
  const count = summary?.missingDays ?? 0
  if (count <= 0) return ''
  const dates = (summary.missingDates ?? []).map((iso) => {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  })
  return `Bạn còn ${count} ngày chưa chấm công. Vui lòng hoàn thành trước khi gửi chốt kỳ lương.${
    dates.length ? ` Ngày thiếu: ${dates.join(', ')}.` : ''
  }`
}
