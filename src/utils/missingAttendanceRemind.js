/**
 * Banner thiếu chấm công hằng ngày — chỉ kỳ lương ĐANG DIỄN RA.
 * Tách biệt PayrollCloseRemindBanner (chốt kỳ).
 */
import { CLOSE_CYCLES, getCloseCycleRange, formatCloseCycleRangeLabel } from './payrollCycleClose/payCycleCalendar'
import { CLOSE_CYCLE_STATUS } from './payrollCycleClose/closeCycleStatus'
import { buildEmployeeAttendancePeriodDays } from './payrollCycleClose/attendancePeriodReview'
import {
  isClosePeriodOutsideEmployment,
  resolveEmployeeEmploymentEndDate,
  resolveEmployeeEmploymentStartDate,
} from './payrollCycleClose/employmentPeriodGate'
import { fetchAttendanceFiltered } from '../repositories/attendanceRepository'
import { fetchPayrollCycleClose } from '../repositories/payrollCycleCloseRepository'
import { loadCorrectionRequestsForEmployeeRange } from './attendanceEditRequestService'
import { getEmployeeById } from './employeeStorage'

/**
 * Kỳ đang diễn ra theo ngày hôm nay (VN):
 * - Ngày 01–15 → Kỳ 1 tháng hiện tại (01 → 15)
 * - Ngày 16–cuối → Kỳ 2 tháng hiện tại (16 → cuối tháng)
 *
 * @returns {{ billingMonth: string, cycle: string, fromDate: string, toDate: string, cycleLabel: string, rangeLabel: string } | null}
 */
export function resolveInProgressAttendanceRemindTarget(todayDate) {
  if (!todayDate || !/^\d{4}-\d{2}-\d{2}$/.test(todayDate)) return null
  const billingMonth = todayDate.slice(0, 7)
  const day = Number(todayDate.slice(8, 10))
  if (!Number.isFinite(day)) return null

  const cycle = day <= 15 ? CLOSE_CYCLES.PERIOD_1 : CLOSE_CYCLES.PERIOD_2
  const range = getCloseCycleRange(billingMonth, cycle)
  if (!range.fromDate || !range.toDate) return null

  return {
    billingMonth,
    cycle,
    fromDate: range.fromDate,
    toDate: range.toDate,
    cycleLabel: cycle === CLOSE_CYCLES.PERIOD_1 ? 'Kỳ 1' : 'Kỳ 2',
    rangeLabel: formatCloseCycleRangeLabel(billingMonth, cycle),
  }
}

/** Format ngày ISO → dd/mm hoặc dd/mm/yyyy. */
export function formatMissingAttendanceDate(iso, { withYear = false } = {}) {
  if (!iso || iso.length < 10) return iso || ''
  const [y, m, d] = iso.split('-')
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`
}

/**
 * Copy banner thiếu ngày đã qua (không nhắc trừ lương / không nhắc chốt).
 */
export function formatDailyMissingAttendanceMessage(missingDates = []) {
  const dates = missingDates.filter(Boolean)
  if (dates.length === 0) return ''
  if (dates.length === 1) {
    return `Bạn chưa chấm công ngày ${formatMissingAttendanceDate(dates[0], { withYear: true })}.`
  }
  const list = dates.map((d) => formatMissingAttendanceDate(d)).join(', ')
  return `Bạn còn ${dates.length} ngày chưa chấm công: ${list}.`
}

/**
 * Ngày thiếu đã qua trong kỳ đang diễn ra (không gồm hôm nay / tương lai).
 * Trả [] nếu kỳ đã approved hoặc không còn ngày thiếu.
 */
export async function loadInProgressMissingAttendanceDates({
  employeeId,
  todayDate,
}) {
  if (!employeeId || !todayDate) {
    return { missingDates: [], target: null, skippedReason: 'missing_input' }
  }

  const target = resolveInProgressAttendanceRemindTarget(todayDate)
  if (!target) {
    return { missingDates: [], target: null, skippedReason: 'no_target' }
  }

  const employee = getEmployeeById(employeeId)
  const { startDate: employmentStartDate, warning: employmentStartWarning } =
    resolveEmployeeEmploymentStartDate(employee)
  const employmentEndDate = resolveEmployeeEmploymentEndDate(employee)

  // Toàn kỳ trước ngày bắt đầu làm → không tồn tại với NV này.
  if (isClosePeriodOutsideEmployment(target, employmentStartDate, employmentEndDate)) {
    return {
      missingDates: [],
      target,
      skippedReason: 'before_employment_start',
      employmentStartWarning,
    }
  }

  // Không nhắc kỳ đã Admin duyệt.
  const close = await fetchPayrollCycleClose({
    employeeId,
    billingMonth: target.billingMonth,
    cycle: target.cycle,
  }).catch(() => null)
  if (close?.status === CLOSE_CYCLE_STATUS.APPROVED) {
    return { missingDates: [], target, skippedReason: 'approved', employmentStartWarning }
  }

  // Chỉ quét đến hôm nay; buildEmployeeAttendancePeriodDays loại hôm nay khỏi isMissing.
  const scanTo = target.toDate > todayDate ? todayDate : target.toDate
  if (!target.fromDate || !scanTo || target.fromDate > scanTo) {
    return { missingDates: [], target, skippedReason: 'empty_range', employmentStartWarning }
  }

  const [records, corrections] = await Promise.all([
    fetchAttendanceFiltered({
      fromDate: target.fromDate,
      toDate: scanTo,
      employeeId,
    }).catch(() => []),
    loadCorrectionRequestsForEmployeeRange(
      employeeId,
      target.fromDate,
      scanTo,
    ).catch(() => []),
  ])

  const { summary } = buildEmployeeAttendancePeriodDays({
    employeeId,
    records: records ?? [],
    fromDate: target.fromDate,
    toDate: scanTo,
    todayDate,
    correctionRequests: corrections,
    employmentStartDate,
    employmentEndDate,
  })

  return {
    missingDates: summary.missingDates ?? [],
    target,
    skippedReason: '',
    employmentStartWarning,
  }
}
