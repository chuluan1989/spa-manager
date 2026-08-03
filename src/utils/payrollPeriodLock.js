/**
 * Lịch khóa kỳ theo ngày cố định (16 / 01 tháng sau).
 *
 * DEPRECATED — KHÔNG dùng để chặn tạo/sửa hóa đơn hoặc chấm công của NV.
 * Khóa nguồn duy nhất: employeeId + fromDate–toDate + status approved
 * (xem payrollCycleClose/approvedCloseLock.js).
 *
 * isPayCycleClosedForRecordDate luôn false để tránh khóa nhầm kỳ mới
 * (vd. duyệt Kỳ 2/7 không được khóa tháng 8).
 */
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
 * Ngày bắt đầu khóa kỳ (lịch) — chỉ còn ý nghĩa tham chiếu lịch nộp.
 * Không dùng để block dữ liệu NV.
 */
export function getPayCycleLockStartDate(month, cycle) {
  if (!month) return null
  if (cycle === PAY_CYCLES.PERIOD_1) return `${month}-16`
  if (cycle === PAY_CYCLES.PERIOD_2) return `${shiftMonthValue(month, 1)}-01`
  return null
}

/** @deprecated Luôn false — khóa theo approvedCloseLock. */
export function isPayCycleClosedForRecordDate(_recordDate, _todayDate = getVietnamTodayDate()) {
  return false
}

/** @deprecated */
export function getPayCycleLockBlockMessage(recordDate) {
  const info = resolvePayCycleForDate(recordDate)
  if (!info) return 'Không xác định được kỳ lương của bản ghi.'
  const monthLabel = `${info.month.slice(5, 7)}/${info.month.slice(0, 4)}`
  return `Kỳ lương ${getPayCycleLabel(info.cycle)} tháng ${monthLabel} — kiểm tra trạng thái duyệt phiếu chốt của nhân viên.`
}

export function describePayCycleLock(recordDate, todayDate = getVietnamTodayDate()) {
  const info = resolvePayCycleForDate(recordDate)
  if (!info) return { closed: false, info: null, lockStart: null, todayDate }
  const lockStart = getPayCycleLockStartDate(info.month, info.cycle)
  return {
    closed: false,
    info,
    lockStart,
    todayDate,
  }
}
