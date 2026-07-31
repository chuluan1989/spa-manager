import {
  getCurrentUserEmployeeId,
  getCurrentUserName,
  isAdmin,
  isBranchManager,
  getCurrentUserBranch,
} from '../../constants/auth'
import { getTodayDate } from '../invoiceStorage'
import {
  fetchPayrollCycleClose,
  insertPayrollCycleCloseEvent,
  upsertPayrollCycleClose,
} from '../../repositories/payrollCycleCloseRepository'
import { buildCloseCyclePreview } from './buildCloseCyclePreview'
import {
  buildCloseCycleId,
  canSubmitCloseCycle,
  resolveNextSubmitStatus,
  CLOSE_CYCLE_STATUS,
} from './closeCycleStatus'
import { CLOSE_CYCLES, getCloseCycleRange } from './payCycleCalendar'

function assertActorIsEmployeeOwner(employeeId) {
  const actorId = getCurrentUserEmployeeId()
  if (!actorId || actorId !== employeeId) {
    throw new Error('Bạn chỉ được gửi chốt kỳ lương của chính mình.')
  }
  return actorId
}

function assertValidPeriod(billingMonth, cycle, fromDate, toDate) {
  if (cycle !== CLOSE_CYCLES.PERIOD_1 && cycle !== CLOSE_CYCLES.PERIOD_2) {
    throw new Error('Kỳ lương không hợp lệ.')
  }
  const expected = getCloseCycleRange(billingMonth, cycle)
  if (expected.fromDate !== fromDate || expected.toDate !== toDate) {
    throw new Error('Kỳ / khoảng ngày không khớp quy ước chốt lương.')
  }
}

/**
 * Validate + gửi chốt (service). Không chỉ dựa UI.
 * Snapshot lấy từ preview.snapshot (cùng buildCloseCyclePreview).
 */
export async function submitCloseCycle({
  employeeId,
  billingMonth,
  cycle,
  todayDate = getTodayDate(),
}) {
  const actorId = assertActorIsEmployeeOwner(employeeId)

  const preview = await buildCloseCyclePreview({
    employeeId,
    billingMonth,
    cycle,
    todayDate,
  })

  assertValidPeriod(billingMonth, cycle, preview.fromDate, preview.toDate)
  if (!preview.branchId) throw new Error('Chi nhánh không hợp lệ.')

  if (!preview.attendanceComplete) {
    throw new Error(preview.blockReasons[0] || 'Chấm công chưa đầy đủ.')
  }

  // Re-read DB để chống double-submit
  const existing = await fetchPayrollCycleClose({ employeeId, billingMonth, cycle })
  const currentStatus = existing?.status ?? null
  if (!canSubmitCloseCycle(currentStatus)) {
    throw new Error(
      currentStatus === CLOSE_CYCLE_STATUS.APPROVED
        ? 'Kỳ này đã được Admin duyệt — không gửi lại.'
        : 'Kỳ này đã gửi, đang chờ Admin duyệt.',
    )
  }

  const nextStatus = resolveNextSubmitStatus(currentStatus)
  const snapshot = preview.snapshot
  if (!snapshot?.totals || !snapshot?.attendance) {
    throw new Error('Snapshot lương không hợp lệ.')
  }

  const now = new Date().toISOString()
  const salary = preview.salary
  const prevHistory = Array.isArray(existing?.submissionHistory)
    ? existing.submissionHistory
    : []
  const submissionHistory = currentStatus === CLOSE_CYCLE_STATUS.RETURNED && existing?.snapshot
    ? [
        ...prevHistory,
        {
          version: existing.submissionVersion ?? prevHistory.length + 1,
          status: existing.status,
          snapshot: existing.snapshot,
          submittedAt: existing.submittedAt || existing.resubmittedAt || null,
          returnedAt: existing.returnedAt || null,
          returnReason: existing.returnReason || existing.rejectReason || '',
        },
      ]
    : prevHistory

  const nextVersion = Number(existing?.submissionVersion ?? 0) + 1
  const actorName = getCurrentUserName()

  const record = {
    id: existing?.id || buildCloseCycleId(employeeId, billingMonth, cycle),
    employeeId,
    employeeName: preview.employeeName,
    branchId: preview.branchId,
    branchName: preview.branchName || '',
    billingMonth,
    cycle,
    fromDate: preview.fromDate,
    toDate: preview.toDate,
    status: nextStatus,
    submissionVersion: nextVersion,
    snapshot,
    attendanceSnapshot: snapshot.attendance.days,
    submissionHistory,
    validation: {
      attendanceComplete: true,
      missingDays: 0,
      missingDates: [],
      checkedAt: now,
      fromDate: preview.fromDate,
      toDate: preview.toDate,
      branchId: preview.branchId,
    },
    ticketRevenue: salary.ticketRevenue,
    commission: salary.commission,
    tips: salary.tips,
    bonus: salary.bonus,
    penalty: salary.penalty,
    advance: salary.advance,
    reduction: salary.reduction,
    otherAdjustment: salary.otherAdjustment,
    baseSalary: salary.baseSalary,
    netSalary: salary.netSalary,
    submittedAt: existing?.submittedAt || now,
    submittedBy: existing?.submittedBy || actorId,
    submittedByName: existing?.submittedByName || actorName,
    returnedAt: existing?.returnedAt ?? null,
    returnedBy: existing?.returnedBy ?? '',
    returnedByName: existing?.returnedByName ?? '',
    returnReason: '',
    resubmittedAt: nextStatus === CLOSE_CYCLE_STATUS.RESUBMITTED ? now : (existing?.resubmittedAt ?? null),
    resubmittedBy: nextStatus === CLOSE_CYCLE_STATUS.RESUBMITTED ? actorId : (existing?.resubmittedBy ?? ''),
    resubmittedByName: nextStatus === CLOSE_CYCLE_STATUS.RESUBMITTED ? actorName : (existing?.resubmittedByName ?? ''),
    approvedAt: null,
    approvedBy: '',
    approvedByName: '',
    createdAt: existing?.createdAt,
  }

  // Cập nhật submitted_at mỗi lần gửi mới nếu lần đầu
  if (nextStatus === CLOSE_CYCLE_STATUS.SUBMITTED) {
    record.submittedAt = now
    record.submittedBy = actorId
    record.submittedByName = actorName
  }

  const saved = await upsertPayrollCycleClose(record)
  await insertPayrollCycleCloseEvent({
    id: `pcce_${saved.id}_${nextVersion}_${nextStatus}`,
    closeId: saved.id,
    employeeId,
    eventType: nextStatus,
    fromStatus: currentStatus || CLOSE_CYCLE_STATUS.DRAFT,
    toStatus: nextStatus,
    submissionVersion: nextVersion,
    snapshot,
    note: '',
    actorId,
    actorName,
  })

  return { record: saved, preview, snapshot }
}

function assertAdminOrManagerForBranch(branchId) {
  if (isAdmin()) return { actorId: 'admin', actorName: getCurrentUserName() }
  if (isBranchManager()) {
    const managed = getCurrentUserBranch()
    if (!branchId || branchId !== managed) {
      throw new Error('Bạn chỉ được duyệt phiếu nhân viên thuộc chi nhánh của mình.')
    }
    return { actorId: managed, actorName: getCurrentUserName() }
  }
  throw new Error('Không có quyền duyệt / trả lại phiếu chốt kỳ.')
}

export async function returnCloseCycle({
  employeeId,
  billingMonth,
  cycle,
  returnReason = '',
}) {
  const reason = String(returnReason || '').trim()
  if (!reason) throw new Error('Bắt buộc nhập lý do trả lại.')

  const existing = await fetchPayrollCycleClose({ employeeId, billingMonth, cycle })
  if (!existing) throw new Error('Không tìm thấy phiếu chốt kỳ.')
  if (existing.status === CLOSE_CYCLE_STATUS.APPROVED) {
    throw new Error('Không thể trả lại phiếu đã duyệt.')
  }
  if (
    existing.status !== CLOSE_CYCLE_STATUS.SUBMITTED
    && existing.status !== CLOSE_CYCLE_STATUS.RESUBMITTED
  ) {
    throw new Error('Chỉ trả lại được phiếu đang chờ duyệt.')
  }

  const { actorId, actorName } = assertAdminOrManagerForBranch(existing.branchId)
  if (actorId === existing.employeeId) {
    throw new Error('Nhân viên không được tự trả lại / duyệt phiếu của mình.')
  }

  const now = new Date().toISOString()
  const saved = await upsertPayrollCycleClose({
    ...existing,
    status: CLOSE_CYCLE_STATUS.RETURNED,
    returnReason: reason,
    returnedAt: now,
    returnedBy: actorId,
    returnedByName: actorName,
    approvedAt: null,
    approvedBy: '',
    approvedByName: '',
  })

  await insertPayrollCycleCloseEvent({
    id: `pcce_${saved.id}_${saved.submissionVersion || 0}_returned_${Date.now()}`,
    closeId: saved.id,
    employeeId,
    eventType: 'returned',
    fromStatus: existing.status,
    toStatus: CLOSE_CYCLE_STATUS.RETURNED,
    submissionVersion: saved.submissionVersion || 0,
    snapshot: existing.snapshot || {},
    note: reason,
    actorId,
    actorName,
  })

  return { record: saved }
}

export async function approveCloseCycle({
  employeeId,
  billingMonth,
  cycle,
}) {
  const existing = await fetchPayrollCycleClose({ employeeId, billingMonth, cycle })
  if (!existing) throw new Error('Không tìm thấy phiếu chốt kỳ.')
  if (existing.status === CLOSE_CYCLE_STATUS.APPROVED) {
    throw new Error('Phiếu đã được duyệt.')
  }
  if (
    existing.status !== CLOSE_CYCLE_STATUS.SUBMITTED
    && existing.status !== CLOSE_CYCLE_STATUS.RESUBMITTED
  ) {
    throw new Error('Chỉ duyệt được phiếu đang chờ duyệt.')
  }

  const { actorId, actorName } = assertAdminOrManagerForBranch(existing.branchId)
  if (actorId === existing.employeeId) {
    throw new Error('Nhân viên không được tự duyệt phiếu của mình.')
  }

  const now = new Date().toISOString()
  const saved = await upsertPayrollCycleClose({
    ...existing,
    status: CLOSE_CYCLE_STATUS.APPROVED,
    approvedAt: now,
    approvedBy: actorId,
    approvedByName: actorName,
    // Khóa snapshot hiện tại — không đụng snapshot
    snapshot: existing.snapshot,
    attendanceSnapshot: existing.attendanceSnapshot,
  })

  await insertPayrollCycleCloseEvent({
    id: `pcce_${saved.id}_${saved.submissionVersion || 0}_approved`,
    closeId: saved.id,
    employeeId,
    eventType: 'approved',
    fromStatus: existing.status,
    toStatus: CLOSE_CYCLE_STATUS.APPROVED,
    submissionVersion: saved.submissionVersion || 0,
    snapshot: existing.snapshot || {},
    note: '',
    actorId,
    actorName,
  })

  return { record: saved }
}
