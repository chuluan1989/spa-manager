import { CLOSE_CYCLES, getCloseCycleRange, formatCloseCycleRangeLabel, shiftMonthValue } from './payCycleCalendar'
import { canSubmitCloseCycle, getCloseCycleStatusLabel, CLOSE_CYCLE_STATUS } from './closeCycleStatus'
import { fetchPayrollCycleClose } from '../../repositories/payrollCycleCloseRepository'
import { fetchAttendanceFiltered } from '../../repositories/attendanceRepository'
import { getEmployeeById } from '../employeeStorage'
import { getCurrentUser } from '../../constants/auth'
import { checkUnsyncedLocalInvoices } from '../invoiceLegacyMigrate'
import { loadCorrectionRequestsForEmployeeRange } from '../attendanceEditRequestService'
import { buildEmployeeAttendancePeriodDays, isAttendanceOptionalForCloseCycle } from './attendancePeriodReview'
import {
  isClosePeriodOutsideEmployment,
  resolveEmployeeEmploymentEndDate,
  resolveEmployeeEmploymentStartDate,
} from './employmentPeriodGate'
import {
  SONG_KHOE_REMIND_PERIOD_START,
  SONG_KHOE_SPA_BRANCH_ID,
} from '../payroll1Policy'

/** Số tháng nhìn lại để tìm kỳ đã đến hạn chốt nhưng chưa gửi. */
const DUE_LOOKBACK_MONTHS = 3

/**
 * Các kỳ đã đến hạn nhắc (submitDate <= hôm nay), cũ → mới.
 * Kỳ 1: từ ngày 17 cùng tháng; Kỳ 2: từ ngày 02 tháng sau.
 * Banner neo theo resolvePayrollCloseRemindTarget (kỳ đang đến hạn theo lịch);
 * các kỳ cũ hơn chưa hoàn thành chỉ đếm để cảnh báo phụ — không đổi CTA.
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
 * Kỳ đang đến hạn theo lịch (cửa sổ nhắc chính):
 * - Ngày 17 → cuối tháng → Kỳ 1 tháng hiện tại
 * - Ngày 02 → 16 → Kỳ 2 tháng trước
 * (= kỳ mới nhất trong danh sách đến hạn theo submitDate).
 */
export function resolvePayrollCloseRemindTarget(todayDate) {
  const due = listDuePayrollCloseTargets(todayDate)
  if (due.length === 0) return null
  return due[due.length - 1]
}

export function isSameCloseTarget(a, b) {
  if (!a || !b) return false
  return a.billingMonth === b.billingMonth && a.cycle === b.cycle
}

/** Kỳ chưa hoàn thành (còn thiếu): chưa có / draft / returned / submitted / resubmitted — trừ approved. */
export function isCloseCycleIncomplete(status) {
  if (!status) return true
  return status !== CLOSE_CYCLE_STATUS.APPROVED
}

/** Copy cảnh báo kỳ cũ chưa hoàn thành (không đổi CTA chính). */
export function formatPendingOlderCloseMessage(count) {
  const n = Number(count) || 0
  if (n <= 0) return ''
  if (n === 1) return 'Bạn còn 1 kỳ lương trước chưa hoàn thành.'
  return `Bạn còn ${n} kỳ lương trước chưa hoàn thành.`
}

function isSongKhoeBlocked(employee, target) {
  if (employee?.branchId !== SONG_KHOE_SPA_BRANCH_ID) return false
  const range = getCloseCycleRange(target.billingMonth, target.cycle)
  return Boolean(range.fromDate && range.fromDate < SONG_KHOE_REMIND_PERIOD_START)
}

/**
 * Lọc kỳ đến hạn theo ngày bắt đầu làm việc.
 * - Có startDate: bỏ kỳ toDate < startDate (toàn kỳ trước khi vào làm).
 * - Thiếu startDate: chỉ giữ kỳ đến hạn mới nhất — không kéo nhiều tháng trước + warning Admin.
 */
export function filterDueTargetsForEmployee(dueTargets, employee) {
  const resolved = resolveEmployeeEmploymentStartDate(employee)
  const endDate = resolveEmployeeEmploymentEndDate(employee)
  const list = Array.isArray(dueTargets) ? dueTargets : []

  if (resolved.startDate) {
    return {
      targets: list.filter((target) => !isClosePeriodOutsideEmployment(target, resolved.startDate, endDate)),
      employmentStartDate: resolved.startDate,
      employmentStartSource: resolved.source,
      employmentStartWarning: '',
    }
  }

  const latest = list.length > 0 ? [list[list.length - 1]] : []
  return {
    targets: latest,
    employmentStartDate: '',
    employmentStartSource: 'missing',
    employmentStartWarning: resolved.warning,
  }
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

  const employee = getEmployeeById(employeeId)
  const { startDate: employmentStartDate, warning: employmentStartWarning } =
    resolveEmployeeEmploymentStartDate(employee)
  const employmentEndDate = resolveEmployeeEmploymentEndDate(employee)
  const attendanceReview = buildEmployeeAttendancePeriodDays({
    employeeId,
    records: attendanceRows ?? [],
    fromDate: target.fromDate,
    toDate: target.toDate,
    todayDate,
    correctionRequests: corrections,
    employmentStartDate,
    employmentEndDate,
  })

  const existing = await fetchPayrollCycleClose({
    employeeId,
    billingMonth: target.billingMonth,
    cycle: target.cycle,
  })
  const status = existing?.status ?? null
  const attendanceWaiver = isAttendanceOptionalForCloseCycle(target.billingMonth, target.cycle)
  const missingDays = attendanceWaiver ? 0 : (attendanceReview.summary.missingDays ?? 0)
  const missingDates = attendanceWaiver ? [] : (attendanceReview.summary.missingDates ?? [])

  const tourOk = !syncCheck.error && !syncCheck.hasUnsynced
  const attendanceOk = attendanceWaiver || attendanceReview.summary.isComplete
  const salaryOk = true

  return {
    status,
    statusLabel: submitStatusLabel(status),
    employmentStartDate,
    employmentStartWarning,
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
      label: attendanceWaiver
        ? 'Ngoại lệ Kỳ 1/07 — không bắt buộc'
        : attendanceOk
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
 * Banner trang chủ: luôn neo “kỳ đang đến hạn theo lịch”.
 * Kỳ cũ chưa hoàn thành → cảnh báo phụ + nút xem; không đổi CTA chính.
 */
export async function shouldShowPayrollCloseRemind({ employeeId, todayDate, user = getCurrentUser() }) {
  if (!employeeId || !todayDate) {
    return {
      show: false,
      target: null,
      checklist: null,
      pendingOlderTargets: [],
      pendingOlderCount: 0,
    }
  }

  const employee = getEmployeeById(employeeId)
  const { targets: dueTargets, employmentStartWarning } = filterDueTargetsForEmployee(
    listDuePayrollCloseTargets(todayDate),
    employee,
  )

  const calendarTarget = resolvePayrollCloseRemindTarget(todayDate)
  const targetApplicable = Boolean(
    calendarTarget
    && dueTargets.some((row) => isSameCloseTarget(row, calendarTarget))
    && !isSongKhoeBlocked(employee, calendarTarget),
  )
  const target = targetApplicable
    ? (dueTargets.find((row) => isSameCloseTarget(row, calendarTarget)) || calendarTarget)
    : null

  const pendingOlderTargets = []
  for (const row of dueTargets) {
    if (target && isSameCloseTarget(row, target)) continue
    if (target && String(row.submitDate) >= String(target.submitDate)) continue
    if (isSongKhoeBlocked(employee, row)) continue

    const existingOlder = await fetchPayrollCycleClose({
      employeeId,
      billingMonth: row.billingMonth,
      cycle: row.cycle,
    })
    // Kỳ còn thiếu: draft / returned / resubmitted / submitted / chưa có — trừ approved.
    if (!isCloseCycleIncomplete(existingOlder?.status ?? null)) continue
    pendingOlderTargets.push(row)
  }

  if (!target) {
    return {
      show: false,
      target: null,
      checklist: null,
      status: null,
      pendingOlderTargets,
      pendingOlderCount: pendingOlderTargets.length,
      employmentStartWarning,
    }
  }

  const existing = await fetchPayrollCycleClose({
    employeeId,
    billingMonth: target.billingMonth,
    cycle: target.cycle,
  })
  const status = existing?.status ?? null
  if (!canSubmitCloseCycle(status)) {
    return {
      show: false,
      target,
      checklist: null,
      status,
      pendingOlderTargets,
      pendingOlderCount: pendingOlderTargets.length,
      employmentStartWarning,
    }
  }

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
    checklist: {
      ...checklist,
      employmentStartWarning: checklist.employmentStartWarning || employmentStartWarning,
      pendingOlderCount: pendingOlderTargets.length,
      pendingOlderTargets,
      pendingOlderMessage: formatPendingOlderCloseMessage(pendingOlderTargets.length),
    },
    pendingOlderTargets,
    pendingOlderCount: pendingOlderTargets.length,
  }
}
