import { ATTENDANCE_STATUS, getAttendanceStatusConfig } from '../constants/attendanceTypes'
import { getIctParts, listDatesInclusive, isAfterIctEndOfDay } from './ictTime'

export const AUTO_ABSENT_CREATED_BY = 'system'
export const AUTO_ABSENT_REASON =
  'Hệ thống tự ghi nhận do nhân viên không chấm công trong ngày'
export const AUTO_ABSENT_NOTE =
  'Không có bản ghi chấm công trong ngày'
export const AUTO_ABSENT_SOURCE_LABEL = 'Hệ thống tự động'

export const DEFAULT_AUTO_ABSENT_SETTINGS = {
  autoAbsentEnabled: false,
  autoAbsentCloseTime: '00:05',
  autoAbsentApplyFrom: '2026-07-16',
  autoAbsentPenaltyAmount: 100000,
  /** 0=CN … 6=T7. Rỗng = không tự ghi (lịch làm việc chưa xác định). */
  autoAbsentWorkDays: [1, 2, 3, 4, 5, 6],
  autoAbsentHolidays: [],
  autoAbsentExemptEmployeeIds: [],
}

export function isSystemAutoAbsentRecord(record) {
  if (!record) return false
  const createdBy = String(record.createdBy || record.submittedBy || '').toLowerCase()
  if (createdBy === AUTO_ABSENT_CREATED_BY) return true
  return String(record.reason || '').includes('Hệ thống tự ghi nhận')
}

export function getAttendanceSourceLabel(record) {
  if (!record) return '—'
  if (isSystemAutoAbsentRecord(record)) return AUTO_ABSENT_SOURCE_LABEL
  return 'Nhân viên / Admin'
}

export function getAttendanceDisplayNote(record) {
  if (!record) return ''
  if (record.note) return record.note
  if (isSystemAutoAbsentRecord(record)) return AUTO_ABSENT_NOTE
  return ''
}

function normalizeWorkDays(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6))]
}

function normalizeDateList(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

export function resolveAutoAbsentSettings(raw = {}) {
  const penaltyDefault = getAttendanceStatusConfig(ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED)?.penaltyAmount
    ?? DEFAULT_AUTO_ABSENT_SETTINGS.autoAbsentPenaltyAmount
  return {
    autoAbsentEnabled: raw.autoAbsentEnabled === true,
    autoAbsentCloseTime: String(raw.autoAbsentCloseTime || DEFAULT_AUTO_ABSENT_SETTINGS.autoAbsentCloseTime),
    autoAbsentApplyFrom: String(raw.autoAbsentApplyFrom || DEFAULT_AUTO_ABSENT_SETTINGS.autoAbsentApplyFrom).trim(),
    autoAbsentPenaltyAmount: Math.max(
      0,
      Number(raw.autoAbsentPenaltyAmount ?? penaltyDefault) || penaltyDefault,
    ),
    autoAbsentWorkDays: normalizeWorkDays(
      raw.autoAbsentWorkDays ?? DEFAULT_AUTO_ABSENT_SETTINGS.autoAbsentWorkDays,
    ),
    autoAbsentHolidays: normalizeDateList(raw.autoAbsentHolidays),
    autoAbsentExemptEmployeeIds: normalizeIdList(raw.autoAbsentExemptEmployeeIds),
    payroll1PeriodStart: String(raw.payroll1PeriodStart || '2026-07-01'),
    payroll1LockDate: String(raw.payroll1LockDate || '2026-07-15'),
  }
}

/** JS getDay(): 0 CN … 6 T7 */
export function getWeekdayIndex(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function isConfiguredWorkDay(isoDate, workDays) {
  const days = normalizeWorkDays(workDays)
  if (days.length === 0) return false
  return days.includes(getWeekdayIndex(isoDate))
}

export function isHoliday(isoDate, holidays) {
  return normalizeDateList(holidays).includes(isoDate)
}

/**
 * Ngày còn trong thời hạn bổ sung kỳ lương 1 → không tự ghi nghỉ không phép.
 */
export function isInsideAttendanceBackfillGrace(isoDate, settings, now = new Date()) {
  const cfg = resolveAutoAbsentSettings(settings)
  const start = cfg.payroll1PeriodStart
  const lockDate = cfg.payroll1LockDate
  if (!isoDate || isoDate < start || isoDate > lockDate) return false
  return !isAfterIctEndOfDay(lockDate, now)
}

export function getPreviousIctDate(now = new Date()) {
  const today = getIctParts(now).date
  const dates = listDatesInclusive('2000-01-01', today)
  if (dates.length < 2) return today
  return dates[dates.length - 2]
}

export function canAutoAbsentOnDate(isoDate, settings, now = new Date()) {
  const cfg = resolveAutoAbsentSettings(settings)
  if (!cfg.autoAbsentEnabled) {
    return { ok: false, reason: 'disabled' }
  }
  if (!cfg.autoAbsentApplyFrom || isoDate < cfg.autoAbsentApplyFrom) {
    return { ok: false, reason: 'before_apply_from' }
  }
  if (isInsideAttendanceBackfillGrace(isoDate, cfg, now)) {
    return { ok: false, reason: 'backfill_grace' }
  }
  if (isHoliday(isoDate, cfg.autoAbsentHolidays)) {
    return { ok: false, reason: 'holiday' }
  }
  if (!isConfiguredWorkDay(isoDate, cfg.autoAbsentWorkDays)) {
    return { ok: false, reason: 'not_work_day' }
  }
  return { ok: true, reason: '' }
}

export function shouldAutoAbsentForEmployee(employee, isoDate, settings, existingRecord) {
  if (existingRecord) {
    return { ok: false, reason: 'already_has_record' }
  }
  if (!employee?.id) return { ok: false, reason: 'no_employee' }

  const status = String(employee.status || '').toLowerCase()
  if (status && status !== 'active') {
    return { ok: false, reason: 'inactive' }
  }

  const cfg = resolveAutoAbsentSettings(settings)
  if (cfg.autoAbsentExemptEmployeeIds.includes(employee.id)) {
    return { ok: false, reason: 'exempt' }
  }

  const startDate = String(employee.startDate || '').trim()
  if (startDate && isoDate < startDate) {
    return { ok: false, reason: 'before_start_date' }
  }

  const endDate = String(employee.endDate || employee.daysOff || '').trim()
  if (endDate && isoDate > endDate) {
    return { ok: false, reason: 'after_end_date' }
  }

  if (!employee.branchId) {
    return { ok: false, reason: 'no_branch' }
  }

  return { ok: true, reason: '' }
}

export function buildAutoAbsentRecord({ employee, date, penaltyAmount, id }) {
  return {
    id,
    employeeId: employee.id,
    employeeName: employee.name ?? '',
    branchId: employee.branchId,
    date,
    status: ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED,
    reason: AUTO_ABSENT_REASON,
    note: AUTO_ABSENT_NOTE,
    penaltyAmount: Number(penaltyAmount ?? 0),
    submittedAt: new Date().toISOString(),
    submittedBy: AUTO_ABSENT_CREATED_BY,
    createdBy: AUTO_ABSENT_CREATED_BY,
  }
}
