import { PAY_CYCLES, getPayCycleLabel, shiftMonthValue } from './salaryReport'

/** Ngày hiện tại theo múi giờ Việt Nam (YYYY-MM-DD). */
export function getVietnamTodayDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Xác định kỳ lương chứa một ngày hóa đơn / chấm công. */
export function resolvePayCycleForDate(dateStr) {
  if (!dateStr || dateStr.length < 10) return null
  const month = dateStr.slice(0, 7)
  const day = Number(dateStr.slice(8, 10))
  if (!Number.isFinite(day)) return null
  return {
    month,
    cycle: day <= 15 ? PAY_CYCLES.PERIOD_1 : PAY_CYCLES.PERIOD_2,
  }
}

/**
 * Ngày bắt đầu khóa kỳ:
 * - Kỳ 1 (01–15): khóa từ ngày 16 cùng tháng.
 * - Kỳ 2 (16–cuối): khóa từ ngày 01 tháng sau.
 */
export function getPayCycleLockStartDate(month, cycle) {
  if (!month) return null
  if (cycle === PAY_CYCLES.PERIOD_1) return `${month}-16`
  if (cycle === PAY_CYCLES.PERIOD_2) return `${shiftMonthValue(month, 1)}-01`
  return null
}

export function isPayCycleClosedForRecordDate(recordDate, todayDate = getVietnamTodayDate()) {
  const info = resolvePayCycleForDate(recordDate)
  if (!info) return false
  const lockStart = getPayCycleLockStartDate(info.month, info.cycle)
  return Boolean(lockStart && todayDate >= lockStart)
}

export function getPayCycleLockBlockMessage(recordDate) {
  const info = resolvePayCycleForDate(recordDate)
  if (!info) return 'Không xác định được kỳ lương của bản ghi.'
  const monthLabel = `${info.month.slice(5, 7)}/${info.month.slice(0, 4)}`
  return `Kỳ lương ${getPayCycleLabel(info.cycle)} tháng ${monthLabel} đã chốt. Chỉ Admin được chỉnh sửa.`
}

export function describePayCycleLock(recordDate, todayDate = getVietnamTodayDate()) {
  const info = resolvePayCycleForDate(recordDate)
  if (!info) return { closed: false, info: null, lockStart: null, todayDate }
  const lockStart = getPayCycleLockStartDate(info.month, info.cycle)
  return {
    closed: Boolean(lockStart && todayDate >= lockStart),
    info,
    lockStart,
    todayDate,
  }
}
