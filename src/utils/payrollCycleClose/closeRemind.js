import { CLOSE_CYCLES, getCloseCycleRange, formatCloseCycleRangeLabel, shiftMonthValue } from './payCycleCalendar'
import { canSubmitCloseCycle, getCloseCycleStatusLabel, CLOSE_CYCLE_STATUS } from './closeCycleStatus'
import { fetchPayrollCycleClose } from '../../repositories/payrollCycleCloseRepository'
import { fetchAttendanceFiltered } from '../../repositories/attendanceRepository'
import { getEmployeeById } from '../employeeStorage'
import { getCurrentUser } from '../../constants/auth'
import { checkUnsyncedLocalInvoices } from '../invoiceLegacyMigrate'
import { loadCorrectionRequestsForEmployeeRange } from '../attendanceEditRequestService'
import { buildEmployeeAttendancePeriodDays } from './attendancePeriodReview'
import {
  SONG_KHOE_REMIND_PERIOD_START,
  SONG_KHOE_SPA_BRANCH_ID,
} from '../payroll1Policy'

/** Số tháng nhìn lại để tìm kỳ đã đến hạn chốt nhưng chưa gửi. */
const DUE_LOOKBACK_MONTHS = 3

/**
 * Các kỳ đã đến hạn nhắc (submitDate <= hôm nay), cũ → mới.
 * Kỳ 1: từ ngày 17 cùng tháng; Kỳ 2: từ ngày 02 tháng sau.
 * Banner/shouldShow lọc tiếp theo trạng thái gửi (ưu tiên kỳ cũ chưa gửi).
 */
export function listDuePayrollCloseTargets(todayDate) {
  if (!todayDate || todayDate.length < 10) return []
  const todayMonth = todayDate.slice(0, 7)
  const targets = []

  for (let i = 0; i < DUE_LOOKBACK_MONTHS; i += 1) {
    const billingMonth = shiftMonthValue(todayMonth, -i)
    if (!billingMonth) continue
    for (const cycle of [CLOSE_CYCLES.PERIOD_1, CLOSE_CYCLES.PERIOD_2]) {
      const range = getCloseCycleRange(billingMonth, cycle)
      if (!range.submitDate || range.submitDate > todayDate) continue
      targets.push({
        billingMonth,
        cycle,
        cycleLabel: cycle === CLOSE_CYCLES.PERIOD_1 ? 'Kỳ 1' : 'Kỳ 2',
        rangeLabel: formatCloseCycleRangeLabel(billingMonth, cycle),
        submitDate: range.submitDate,
        fromDate: range.fromDate,
        toDate: range.toDate,
      })
    }
  }

  targets.sort((a, b) => {
    const bySubmit = String(a.submitDate).localeCompare(String(b.submitDate))
    if (bySubmit !== 0) return bySubmit
    const byMonth = String(a.billingMonth).localeCompare(String(b.billingMonth))
    if (byMonth !== 0) return byMonth
    return a.cycle === CLOSE_CYCLES.PERIOD_1 ? -1 : 1
  })
  return targets
}

/**
 * Kỳ đến hạn khớp “cửa sổ nhắc chính” của ngày hôm nay (mới nhất trong các kỳ đến hạn).
 * Ví dụ: 17–cuối tháng → Kỳ 1 tháng hiện tại; 02–16 → Kỳ 2 tháng trước.
 * shouldShowPayrollCloseRemind vẫn duyệt list cũ→mới để ưu tiên kỳ chưa gửi.
 */
export function resolvePayrollCloseRemindTarget(todayDate) {
  const due = listDuePayrollCloseTargets(todayDate)
  if (due.length === 0) return null
  return due[due.length - 1]
}

function isSongKhoeBlocked(employee, target) {
  if (employee?.branchId !== SONG_KHOE_SPA_BRANCH_ID) return false
  const range = getCloseCycleRange(target.billingMonth, target.cycle)
  return Boolean(range.fromDate && range.fromDate < SONG_KHOE_REMIND_PERIOD_START)
}

function submitStatusLabel(status) {
  if (!status || status === CLOSE_CYCLE_STATUS.DRAFT) return 'Chưa gửi'
  if (status === CLOSE_CYCLE_STATUS.RETURNED) return 'Bị trả lại'
  if (
    status === CLOSE_CYCLE_STATUS.SUBMITTED
    || status === CLOSE_CYCLE_STATUS.RESUBMITTED
  ) {
    return 'Đã gửi'
  }
  if (status === CLOSE_CYCLE_STATUS.APPROVED) return 'Đã gửi'
  return getCloseCycleStatusLabel(status)
}

/**
 * Checklist nhẹ cho banner (Tour sync + chấm công + trạng thái gửi).
 */
export async function buildPayrollCloseRemindChecklist({
  employeeId,
  target,
  todayDate,
  user = getCurrentUser(),
}) {
  const [syncCheck, attendanceRows, corrections] = await Promise.all([
    checkUnsyncedLocalInvoices(user).catch((err) => ({
      hasUnsynced: false,
      count: 0,
      error: err?.message ?? 'Không kiểm tra được hóa đơn.',
    })),
    fetchAttendanceFiltered({
      fromDate: target.fromDate,
      toDate: target.toDate,
      employeeId,
    }).catch(() => []),
    loadCorrectionRequestsForEmployeeRange(
      employeeId,
      target.fromDate,
      target.toDate,
    ).catch(() => []),
  ])

  const attendanceReview = buildEmployeeAttendancePeriodDays({
    employeeId,
    records: attendanceRows ?? [],
    fromDate: target.fromDate,
    toDate: target.toDate,
    todayDate,
    correctionRequests: corrections,
  })

  const existing = await fetchPayrollCycleClose({
    employeeId,
    billingMonth: target.billingMonth,
    cycle: target.cycle,
  })
  const status = existing?.status ?? null
  const missingDays = attendanceReview.summary.missingDays ?? 0
  const missingDates = attendanceReview.summary.missingDates ?? []

  const tourOk = !syncCheck.error && !syncCheck.hasUnsynced
  const attendanceOk = attendanceReview.summary.isComplete
  const salaryOk = true

  return {
    status,
    statusLabel: submitStatusLabel(status),
    tour: {
      ok: tourOk,
      label: syncCheck.error
        ? `Không kiểm tra được đồng bộ Tour (${syncCheck.error})`
        : syncCheck.hasUnsynced
          ? `Còn ${syncCheck.count} hóa đơn chưa đồng bộ.`
          : 'Đã đồng bộ',
      unsyncedCount: syncCheck.count ?? 0,
      error: syncCheck.error || null,
      needsSync: Boolean(syncCheck.hasUnsynced),
    },
    attendance: {
      ok: attendanceOk,
      label: attendanceOk
        ? 'Đã đủ'
        : `Còn ${missingDays} ngày chưa chấm công.`,
      missingDays,
      missingDates,
      needsAttendance: !attendanceOk && missingDays > 0,
    },
    salary: {
      ok: salaryOk,
      label: 'Có thể xem',
    },
    submit: {
      ok: !canSubmitCloseCycle(status),
      label: submitStatusLabel(status),
      canSubmitStatus: canSubmitCloseCycle(status),
    },
  }
}

/**
 * Hiện banner khi có ít nhất một kỳ đến hạn và chưa gửi (null/draft/returned).
 * Ưu tiên kỳ cũ nhất. Returned → hiện lại.
 */
export async function shouldShowPayrollCloseRemind({ employeeId, todayDate, user = getCurrentUser() }) {
  if (!employeeId || !todayDate) return { show: false, target: null, checklist: null }

  const employee = getEmployeeById(employeeId)
  const dueTargets = listDuePayrollCloseTargets(todayDate)

  for (const target of dueTargets) {
    if (isSongKhoeBlocked(employee, target)) continue

    const existing = await fetchPayrollCycleClose({
      employeeId,
      billingMonth: target.billingMonth,
      cycle: target.cycle,
    })
    const status = existing?.status ?? null
    if (!canSubmitCloseCycle(status)) continue

    const checklist = await buildPayrollCloseRemindChecklist({
      employeeId,
      target,
      todayDate,
      user,
    })

    return {
      show: true,
      target,
      status,
      checklist,
    }
  }

  return { show: false, target: null, checklist: null, status: null }
}
