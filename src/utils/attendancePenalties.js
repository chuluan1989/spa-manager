import { ATTENDANCE_STATUS, getAttendanceStatusConfig, isVoidAttendanceStatus } from '../constants/attendanceTypes'
import { isAttendanceSpecialDay } from './attendanceSpecialDays'

export const WEEKDAY_PERMITTED_QUOTA_DAYS = 3
export const WEEKDAY_FULL_PENALTY = 100000
export const WEEKDAY_HALF_PENALTY = 50000
export const SPECIAL_FULL_PENALTY = 200000
export const SPECIAL_HALF_PENALTY = 100000
export const LATE_EARLY_UNPERMITTED_PENALTY = 20000

const PERMITTED_LEAVE = new Set([
  ATTENDANCE_STATUS.FULL_DAY_PERMITTED,
  ATTENDANCE_STATUS.HALF_MORNING_PERMITTED,
  ATTENDANCE_STATUS.HALF_EVENING_PERMITTED,
])
const UNPERMITTED_LEAVE = new Set([
  ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED,
  ATTENDANCE_STATUS.HALF_MORNING_UNPERMITTED,
  ATTENDANCE_STATUS.HALF_EVENING_UNPERMITTED,
])
const WEEKEND_STATUS = new Set([
  ATTENDANCE_STATUS.FULL_DAY_WEEKEND,
  ATTENDANCE_STATUS.HALF_MORNING_WEEKEND,
  ATTENDANCE_STATUS.HALF_EVENING_WEEKEND,
])
const HALF_LEAVE = new Set([
  ATTENDANCE_STATUS.HALF_MORNING_PERMITTED,
  ATTENDANCE_STATUS.HALF_EVENING_PERMITTED,
  ATTENDANCE_STATUS.HALF_MORNING_UNPERMITTED,
  ATTENDANCE_STATUS.HALF_EVENING_UNPERMITTED,
  ATTENDANCE_STATUS.HALF_MORNING_WEEKEND,
  ATTENDANCE_STATUS.HALF_EVENING_WEEKEND,
])
const FULL_LEAVE = new Set([
  ATTENDANCE_STATUS.FULL_DAY_PERMITTED,
  ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED,
  ATTENDANCE_STATUS.FULL_DAY_WEEKEND,
])

export function getMonthPrefixFromDate(dateStr) {
  if (!dateStr || dateStr.length < 7) return ''
  return dateStr.slice(0, 7)
}

export function getAttendanceLeaveDays(statusId) {
  if (HALF_LEAVE.has(statusId)) return 0.5
  if (FULL_LEAVE.has(statusId) || WEEKEND_STATUS.has(statusId)) return 1
  return 0
}

export function isAttendanceLeaveStatus(statusId) {
  return PERMITTED_LEAVE.has(statusId) || UNPERMITTED_LEAVE.has(statusId) || WEEKEND_STATUS.has(statusId)
}

export function formatAttendanceDays(value) {
  const n = Number(value) || 0
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 10) / 10)
}

function money(n) {
  return Math.round(Number(n) || 0)
}

function specialLeavePenalty(days) {
  return days === 0.5 ? SPECIAL_HALF_PENALTY : SPECIAL_FULL_PENALTY
}

function weekdayUnpermittedPenalty(days) {
  return days === 0.5 ? WEEKDAY_HALF_PENALTY : WEEKDAY_FULL_PENALTY
}

function weekdayPermittedPenalty(days, usedQuotaDays) {
  const freeRemaining = Math.max(0, WEEKDAY_PERMITTED_QUOTA_DAYS - usedQuotaDays)
  const billed = Math.max(0, days - Math.min(days, freeRemaining))
  return {
    penaltyAmount: money(billed * WEEKDAY_FULL_PENALTY),
    quotaUsed: Math.min(days, freeRemaining),
    excessDays: billed,
  }
}

function lateEarlyPenalty(statusId) {
  if (statusId === ATTENDANCE_STATUS.LATE_2H_UNPERMITTED || statusId === ATTENDANCE_STATUS.EARLY_2H_UNPERMITTED) {
    return LATE_EARLY_UNPERMITTED_PENALTY
  }
  return 0
}

export function classifyAttendanceRecord(statusId, isoDate, holidays = []) {
  if (isVoidAttendanceStatus(statusId)) {
    return { kind: 'void', days: 0 }
  }
  const config = getAttendanceStatusConfig(statusId)
  const group = config?.statGroup ?? ''
  if (group === 'on_time') return { kind: 'on_time', days: 0 }
  if (group === 'late' || group === 'late_permitted') return { kind: 'late', days: 0 }
  if (group === 'early' || group === 'early_permitted') return { kind: 'early', days: 0 }

  const days = getAttendanceLeaveDays(statusId)
  if (!days) return { kind: 'other', days: 0 }
  if (isAttendanceSpecialDay(isoDate, holidays)) return { kind: 'special_leave', days }
  if (PERMITTED_LEAVE.has(statusId)) return { kind: 'weekday_permitted', days }
  return { kind: 'weekday_unpermitted', days }
}

function resolveHolidays(options = {}) {
  return options.holidays ?? []
}

function penaltyForClassifiedRecord(classified, statusId, usedWeekdayPermittedDays) {
  if (classified.kind === 'void' || classified.kind === 'on_time' || classified.kind === 'other') return 0
  if (classified.kind === 'late' || classified.kind === 'early') return lateEarlyPenalty(statusId)
  if (classified.kind === 'special_leave') return specialLeavePenalty(classified.days)
  if (classified.kind === 'weekday_unpermitted') return weekdayUnpermittedPenalty(classified.days)
  return weekdayPermittedPenalty(classified.days, usedWeekdayPermittedDays).penaltyAmount
}

/** Tính tiền phạt cho một bản ghi mới, dựa trên các bản ghi cùng tháng trước đó. */
export function calculatePenaltyForNewRecord(statusId, monthRecords, recordDate, options = {}) {
  if (isVoidAttendanceStatus(statusId)) return 0

  const holidays = resolveHolidays(options)
  const monthPrefix = getMonthPrefixFromDate(recordDate)
  const classified = classifyAttendanceRecord(statusId, recordDate, holidays)

  if (classified.kind !== 'weekday_permitted') {
    return penaltyForClassifiedRecord(classified, statusId, 0)
  }

  const usedQuota = (monthRecords || [])
    .filter((record) =>
      !isVoidAttendanceStatus(record.status)
      && getMonthPrefixFromDate(record.date) === monthPrefix
      && record.date < recordDate,
    )
    .reduce((sum, record) => {
      const prior = classifyAttendanceRecord(record.status, record.date, holidays)
      return prior.kind === 'weekday_permitted' ? sum + prior.days : sum
    }, 0)

  return weekdayPermittedPenalty(classified.days, usedQuota).penaltyAmount
}

/** Tính lại toàn bộ tiền phạt trong tháng theo thứ tự ngày. */
export function recomputeMonthlyPenalties(records, monthPrefix, options = {}) {
  const holidays = resolveHolidays(options)
  const sorted = [...records]
    .filter((record) => getMonthPrefixFromDate(record.date) === monthPrefix)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '') || String(a.id ?? '').localeCompare(String(b.id ?? '')))

  let usedWeekdayPermittedDays = 0

  return sorted.map((record) => {
    const classified = classifyAttendanceRecord(record.status, record.date, holidays)
    const penaltyAmount = penaltyForClassifiedRecord(classified, record.status, usedWeekdayPermittedDays)
    if (classified.kind === 'weekday_permitted') {
      usedWeekdayPermittedDays += classified.days
    }
    return { ...record, penaltyAmount }
  })
}

export function sumAttendancePenalties(records) {
  return records.reduce((sum, record) => sum + Number(record.penaltyAmount ?? 0), 0)
}

export function computeAttendanceLeaveBreakdown(records, options = {}) {
  const holidays = resolveHolidays(options)
  let permittedDays = 0
  let unpermittedDays = 0
  let weekendHolidayDays = 0
  let lateCount = 0
  let earlyCount = 0
  let permittedPenalty = 0
  let unpermittedPenalty = 0
  let weekendPenalty = 0
  let latePenalty = 0
  let earlyPenalty = 0
  let otherPenalty = 0
  let totalPenalty = 0

  for (const record of records || []) {
    if (!record || isVoidAttendanceStatus(record.status)) continue
    const penaltyAmount = Number(record.penaltyAmount ?? 0)
    totalPenalty += penaltyAmount
    const classified = classifyAttendanceRecord(record.status, record.date, holidays)

    if (classified.kind === 'late') {
      lateCount += 1
      latePenalty += penaltyAmount
      continue
    }
    if (classified.kind === 'early') {
      earlyCount += 1
      earlyPenalty += penaltyAmount
      continue
    }
    if (classified.kind === 'weekday_permitted') {
      permittedDays += classified.days
      permittedPenalty += penaltyAmount
      continue
    }
    if (classified.kind === 'weekday_unpermitted') {
      unpermittedDays += classified.days
      unpermittedPenalty += penaltyAmount
      continue
    }
    if (classified.kind === 'special_leave') {
      weekendHolidayDays += classified.days
      weekendPenalty += penaltyAmount
      continue
    }
    otherPenalty += penaltyAmount
  }

  return {
    permittedDays,
    permittedFreeDays: Math.min(WEEKDAY_PERMITTED_QUOTA_DAYS, permittedDays),
    permittedExceedDays: Math.max(0, permittedDays - WEEKDAY_PERMITTED_QUOTA_DAYS),
    unpermittedDays,
    weekendHolidayDays,
    lateCount,
    earlyCount,
    permittedPenalty,
    unpermittedPenalty,
    weekendPenalty,
    latePenalty,
    earlyPenalty,
    otherPenalty,
    totalPenalty,
    permittedUnits: permittedDays,
    permittedFreeUnits: Math.min(WEEKDAY_PERMITTED_QUOTA_DAYS, permittedDays),
    permittedExceedUnits: Math.max(0, permittedDays - WEEKDAY_PERMITTED_QUOTA_DAYS),
    unpermittedUnits: unpermittedDays,
    lateUnpermittedCount: lateCount,
    earlyUnpermittedCount: earlyCount,
    weekendRecordCount: weekendHolidayDays,
  }
}

export function buildAttendanceStats(records, options = {}) {
  const holidays = resolveHolidays(options)
  const activeRecords = (records || []).filter((record) => !isVoidAttendanceStatus(record.status))
  const stats = {
    total: activeRecords.length,
    onTime: 0,
    late: 0,
    early: 0,
    offPermitted: 0,
    offUnpermitted: 0,
    weekend: 0,
    totalPenalty: sumAttendancePenalties(activeRecords),
  }

  for (const record of activeRecords) {
    const classified = classifyAttendanceRecord(record.status, record.date, holidays)
    if (classified.kind === 'on_time') stats.onTime += 1
    else if (classified.kind === 'late') stats.late += 1
    else if (classified.kind === 'early') stats.early += 1
    else if (classified.kind === 'weekday_permitted') stats.offPermitted += classified.days
    else if (classified.kind === 'weekday_unpermitted') stats.offUnpermitted += classified.days
    else if (classified.kind === 'special_leave') stats.weekend += classified.days
  }

  return stats
}

export function mergeAttendanceIntoEmployeeReports(report, attendanceRecords) {
  if (!report?.employees) return report

  const employees = report.employees.map((row) => {
    const penalties = sumAttendancePenalties(
      attendanceRecords.filter((record) => record.employeeId === row.employeeId),
    )
    const totalSalary = Math.max(0, row.totalSalary - penalties)
    return {
      ...row,
      attendancePenalty: penalties,
      totalSalary,
    }
  })

  const periodTotals = {
    ...report.periodTotals,
    attendancePenalty: employees.reduce((sum, row) => sum + (row.attendancePenalty ?? 0), 0),
    totalSalary: employees.reduce((sum, row) => sum + (row.totalSalary ?? 0), 0),
  }

  return {
    ...report,
    employees,
    periodTotals,
  }
}
