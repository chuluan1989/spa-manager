import { CLOSE_CYCLES, shiftMonthValue } from './payCycleCalendar'
import { fetchPayrollCycleClose } from '../../repositories/payrollCycleCloseRepository'

/**
 * Map ngày chấm công → kỳ chốt lương (quy ước Batch 1–3).
 * - Ngày 01–15 tháng M → Kỳ 2 tháng M
 * - Ngày 16–cuối tháng M → Kỳ 1 tháng M+1
 */
export function resolveCloseCycleForAttendanceDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const month = dateStr.slice(0, 7)
  const day = Number(dateStr.slice(8, 10))
  if (!Number.isFinite(day)) return null
  if (day <= 15) {
    return { billingMonth: month, cycle: CLOSE_CYCLES.PERIOD_2 }
  }
  return {
    billingMonth: shiftMonthValue(month, 1),
    cycle: CLOSE_CYCLES.PERIOD_1,
  }
}

/**
 * Kỳ chốt đã approved → khóa sửa chấm công / gửi yêu cầu bổ sung (không đổi snapshot).
 */
export async function isAttendanceDateLockedByApprovedClose(employeeId, dateStr) {
  if (!employeeId || !dateStr) return false
  const info = resolveCloseCycleForAttendanceDate(dateStr)
  if (!info) return false
  const close = await fetchPayrollCycleClose({
    employeeId,
    billingMonth: info.billingMonth,
    cycle: info.cycle,
  })
  return close?.status === 'approved'
}

export function getApprovedCloseLockMessage(dateStr) {
  const info = resolveCloseCycleForAttendanceDate(dateStr)
  if (!info) return 'Kỳ lương đã duyệt — không được sửa chấm công.'
  const label = info.cycle === CLOSE_CYCLES.PERIOD_1 ? 'Kỳ 1' : 'Kỳ 2'
  const [y, m] = info.billingMonth.split('-')
  return `${label} tháng ${m}/${y} đã được Admin duyệt — không sửa chấm công / gửi yêu cầu bổ sung (snapshot đã khóa).`
}
