import { ATTENDANCE_STATUS, getAttendanceStatusConfig } from '../constants/attendanceTypes'
import { getIctParts, listDatesInclusive, isAfterIctEndOfDay } from './ictTime'

/** Module status — cấu hình runtime qua Cài đặt → Hệ thống (không hardcode applyFrom). */
export const AUTO_ABSENT_MODULE_STATUS = 'Production Stable'

export const AUTO_ABSENT_CREATED_BY = 'system'
export const AUTO_ABSENT_REASON =
  'Hệ thống tự ghi nhận do không chấm công'
export const AUTO_ABSENT_NOTE =
  'Không có bản ghi chấm công trong ngày'
export const AUTO_ABSENT_SOURCE_LABEL = 'Hệ thống tự động'
export const AUTO_ABSENT_MISSING_APPLY_FROM_MESSAGE =
  'Chưa cấu hình ngày bắt đầu áp dụng nghỉ không phép.'

export const DEFAULT_AUTO_ABSENT_SETTINGS = {
  autoAbsentEnabled: false,
  autoAbsentCloseTime: '00:05',
  /** null = Admin chưa cấu hình → không tự chạy. */
  autoAbsentApplyFrom: null,
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

function normalizeApplyFrom(value) {
  const trimmed = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

export function resolveAutoAbsentSettings(raw = {}) {
  const penaltyDefault = getAttendanceStatusConfig(ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED)?.penaltyAmount
    ?? DEFAULT_AUTO_ABSENT_SETTINGS.autoAbsentPenaltyAmount
  return {
    autoAbsentEnabled: raw.autoAbsentEnabled === true,
    autoAbsentCloseTime: String(raw.autoAbsentCloseTime || DEFAULT_AUTO_ABSENT_SETTINGS.autoAbsentCloseTime),
    autoAbsentApplyFrom: normalizeApplyFrom(raw.autoAbsentApplyFrom),
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

/** Gate cấu hình: enabled + applyFrom đã set và applyFrom <= hôm nay (ICT). */
export function getAutoAbsentConfigGate(settings, now = new Date()) {
  const cfg = resolveAutoAbsentSettings(settings)
  if (!cfg.autoAbsentEnabled) {
    return { ok: false, reason: 'disabled', message: 'Tính năng tự động nghỉ không phép đang tắt.' }
  }
  if (!cfg.autoAbsentApplyFrom) {
    return {
      ok: false,
      reason: 'missing_apply_from',
      message: AUTO_ABSENT_MISSING_APPLY_FROM_MESSAGE,
    }
  }
  const today = getIctParts(now).date
  if (cfg.autoAbsentApplyFrom > today) {
    return {
      ok: false,
      reason: 'apply_from_future',
      message: `Ngày bắt đầu áp dụng (${cfg.autoAbsentApplyFrom}) chưa tới.`,
    }
  }
  return { ok: true, reason: '', message: '', applyFrom: cfg.autoAbsentApplyFrom }
}

export function getAutoAbsentGateMessage(reason) {
  if (reason === 'missing_apply_from') return AUTO_ABSENT_MISSING_APPLY_FROM_MESSAGE
  if (reason === 'disabled') return 'Tính năng tự động nghỉ không phép đang tắt.'
  if (reason === 'apply_from_future') return 'Ngày bắt đầu áp dụng chưa tới.'
  if (reason === 'before_apply_from') return 'Ngày xử lý trước ngày bắt đầu áp dụng.'
  if (reason === 'backfill_grace') return 'Đang trong thời hạn bổ sung chấm công kỳ lương 1.'
  if (reason === 'holiday') return 'Ngày nghỉ chung — không tạo nghỉ không phép.'
  if (reason === 'not_work_day') return 'Không thuộc ngày làm việc đã cấu hình.'
  return reason ? `Không chạy (${reason}).` : ''
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
  const configGate = getAutoAbsentConfigGate(cfg, now)
  if (!configGate.ok) {
    return { ok: false, reason: configGate.reason }
  }
  // Chỉ xử lý ngày >= applyFrom (cấu hình runtime, không hardcode).
  if (isoDate < cfg.autoAbsentApplyFrom) {
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
