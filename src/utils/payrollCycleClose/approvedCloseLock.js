import { CLOSE_CYCLES, getCloseCycleRange } from './payCycleCalendar'
import { CLOSE_CYCLE_STATUS, isCloseCyclePendingReview } from './closeCycleStatus'
import {
  fetchPayrollCycleClose,
  fetchPayrollCycleClosesFiltered,
  insertPayrollCycleCloseEvent,
  upsertPayrollCycleClose,
} from '../../repositories/payrollCycleCloseRepository'
import { notifyDataSynced } from '../dataSyncEvents'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import {
  createPayrollAuditId,
  insertPayrollAuditLog,
} from '../../repositories/payrollRepository'

/**
 * Map ngày HĐ / chấm công → kỳ chốt (chỉ để tìm phiếu / invalidate).
 * Khóa dữ liệu KHÔNG dựa hàm này — chỉ dựa fromDate–toDate của phiếu approved.
 */
export function resolveCloseCycleForRecordDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const month = dateStr.slice(0, 7)
  const day = Number(dateStr.slice(8, 10))
  if (!Number.isFinite(day)) return null
  if (day <= 15) {
    return { billingMonth: month, cycle: CLOSE_CYCLES.PERIOD_1 }
  }
  return {
    billingMonth: month,
    cycle: CLOSE_CYCLES.PERIOD_2,
  }
}

/** @deprecated Dùng resolveCloseCycleForRecordDate */
export function resolveCloseCycleForAttendanceDate(dateStr) {
  return resolveCloseCycleForRecordDate(dateStr)
}

/**
 * Khoảng ngày khóa của một phiếu close.
 * Ưu tiên fromDate/toDate đã lưu trên phiếu; thiếu thì suy từ billingMonth+cycle của phiếu
 * (KHÔNG suy từ recordDate — tránh khóa nhầm kỳ kế tiếp).
 */
export function getApprovedCloseDateRange(close) {
  if (!close) return { fromDate: '', toDate: '' }
  const from = String(close.fromDate || '').slice(0, 10)
  const to = String(close.toDate || '').slice(0, 10)
  if (from && to) return { fromDate: from, toDate: to }
  if (close.billingMonth && close.cycle) {
    const range = getCloseCycleRange(close.billingMonth, close.cycle)
    return { fromDate: range.fromDate || '', toDate: range.toDate || '' }
  }
  return { fromDate: '', toDate: '' }
}

export function isRecordDateInApprovedCloseRange(dateStr, close) {
  if (!dateStr || !close) return false
  if (close.status && close.status !== CLOSE_CYCLE_STATUS.APPROVED) return false
  const { fromDate, toDate } = getApprovedCloseDateRange(close)
  if (!fromDate || !toDate) return false
  return dateStr >= fromDate && dateStr <= toDate
}

/** Cache sync cho UI — chỉ các phiếu approved, khóa theo from–to. */
let approvedCloseCache = []

export function getApprovedCloseCache() {
  return approvedCloseCache
}

export function seedApprovedCloseCache(rows = []) {
  approvedCloseCache = (rows || [])
    .filter((row) => row?.status === CLOSE_CYCLE_STATUS.APPROVED && row.employeeId)
    .map((row) => {
      const range = getApprovedCloseDateRange(row)
      return {
        employeeId: row.employeeId,
        billingMonth: row.billingMonth,
        cycle: row.cycle,
        fromDate: range.fromDate,
        toDate: range.toDate,
        status: CLOSE_CYCLE_STATUS.APPROVED,
        approvedByName: row.approvedByName || '',
        approvedAt: row.approvedAt || '',
        netSalary: row.netSalary ?? row.snapshot?.netSalary ?? null,
      }
    })
    .filter((row) => row.fromDate && row.toDate)
}

export async function refreshApprovedCloseCache({ employeeId = '', branchId = '' } = {}) {
  const rows = await fetchPayrollCycleClosesFiltered({
    employeeId,
    branchId,
    status: CLOSE_CYCLE_STATUS.APPROVED,
  }).catch(() => [])
  if (employeeId || branchId) {
    const keep = approvedCloseCache.filter((row) => {
      if (employeeId && row.employeeId === employeeId) return false
      if (branchId && !employeeId) return false
      return true
    })
    seedApprovedCloseCache([...keep, ...(rows || [])])
  } else {
    seedApprovedCloseCache(rows)
  }
  return approvedCloseCache
}

/**
 * Sync: employeeId + date nằm trong fromDate–toDate của phiếu approved (cache).
 * Không dùng ngày hôm nay / khóa lịch.
 */
export function isEmployeeDateLockedByApprovedCloseSync(employeeId, dateStr) {
  if (!employeeId || !dateStr) return false
  return approvedCloseCache.some(
    (row) => (
      row.employeeId === employeeId
      && row.status === CLOSE_CYCLE_STATUS.APPROVED
      && isRecordDateInApprovedCloseRange(dateStr, row)
    ),
  )
}

/**
 * Async nguồn chuẩn: duyệt mọi phiếu approved của NV, khóa nếu date ∈ [from, to].
 * Không khóa vì submitted; không khóa kỳ khác / NV khác / tháng 8 khi duyệt Kỳ 2/7.
 */
export async function isEmployeeRecordLockedByApprovedClose(employeeId, dateStr) {
  if (!employeeId || !dateStr) return false

  const rows = await fetchPayrollCycleClosesFiltered({
    employeeId,
    status: CLOSE_CYCLE_STATUS.APPROVED,
  }).catch(() => [])

  const hit = (rows || []).find((row) => isRecordDateInApprovedCloseRange(dateStr, row))
  if (!hit) return false

  // Warm cache entry
  if (!isEmployeeDateLockedByApprovedCloseSync(employeeId, dateStr)) {
    seedApprovedCloseCache([...approvedCloseCache, hit])
  }
  return true
}

/** @deprecated alias */
export async function isAttendanceDateLockedByApprovedClose(employeeId, dateStr) {
  return isEmployeeRecordLockedByApprovedClose(employeeId, dateStr)
}

export function getApprovedCloseLockMessage(dateStr, { employeeName = '', close } = {}) {
  const range = close ? getApprovedCloseDateRange(close) : null
  const info = resolveCloseCycleForRecordDate(dateStr)
  const label = close?.cycle === CLOSE_CYCLES.PERIOD_1 || info?.cycle === CLOSE_CYCLES.PERIOD_1
    ? 'Kỳ 1'
    : 'Kỳ 2'
  const billingMonth = close?.billingMonth || info?.billingMonth || ''
  const [y, m] = billingMonth ? billingMonth.split('-') : ['', '']
  const who = employeeName ? ` của ${employeeName}` : ''
  const rangeLabel = range?.fromDate && range?.toDate
    ? ` (${range.fromDate} → ${range.toDate})`
    : ''
  return (
    `${label}${m ? ` tháng ${Number(m)}/${y}` : ''}${who} đã được Admin duyệt${rangeLabel}. `
    + 'Không sửa trực tiếp dữ liệu trong khoảng ngày này — vui lòng gửi yêu cầu sửa hoặc nhờ Admin xử lý.'
  )
}

/**
 * Admin bổ sung/sửa nguồn sau khi phiếu đã approved:
 * - Đánh dấu validation.postApprovalAdjustment (không đổi snapshot / net / status)
 * - Ghi audit payroll
 * Snapshot lương đã duyệt giữ nguyên.
 */
export async function markPostApprovalSourceAdjustment(employeeId, recordDate, {
  reason = '',
  sourceType = 'invoice',
  sourceId = '',
  action = 'post_approval_adjustment',
  oldValue = {},
  newValue = {},
  actorId = '',
  actorName = '',
} = {}) {
  if (!employeeId || !recordDate) return null

  const rows = await fetchPayrollCycleClosesFiltered({
    employeeId,
    status: CLOSE_CYCLE_STATUS.APPROVED,
  }).catch(() => [])
  const close = (rows || []).find((row) => isRecordDateInApprovedCloseRange(recordDate, row))
  if (!close) return null

  const now = new Date().toISOString()
  const resolvedActorId = actorId || 'admin'
  const resolvedActorName = actorName || 'Admin'
  const entry = {
    at: now,
    recordDate,
    sourceType,
    sourceId: sourceId || '',
    reason: String(reason || '').trim(),
    actorId: resolvedActorId,
    actorName: resolvedActorName,
  }
  const prevValidation = (
    close.validation && typeof close.validation === 'object'
      ? close.validation
      : {}
  )
  const prevEntries = Array.isArray(prevValidation.postApprovalAdjustments)
    ? prevValidation.postApprovalAdjustments
    : []

  // Giữ nguyên snapshot + số liệu đã duyệt — chỉ gắn cờ / nhật ký bổ sung.
  const saved = await upsertPayrollCycleClose({
    ...close,
    status: CLOSE_CYCLE_STATUS.APPROVED,
    snapshot: close.snapshot,
    attendanceSnapshot: close.attendanceSnapshot,
    netSalary: close.netSalary,
    ticketRevenue: close.ticketRevenue,
    commission: close.commission,
    tips: close.tips,
    bonus: close.bonus,
    penalty: close.penalty,
    advance: close.advance,
    reduction: close.reduction,
    otherAdjustment: close.otherAdjustment,
    baseSalary: close.baseSalary,
    validation: {
      ...prevValidation,
      postApprovalAdjustment: true,
      postApprovalAdjustedAt: now,
      postApprovalAdjustments: [...prevEntries, entry],
    },
  }).catch((err) => {
    console.warn('[close-post-approval] validation mark:', err?.message)
    return null
  })

  if (isSupabaseConfigured) {
    await insertPayrollAuditLog({
      id: createPayrollAuditId(),
      entityType: 'payroll_cycle_close',
      entityId: close.id,
      action,
      editorId: resolvedActorId,
      editorName: resolvedActorName,
      oldValue: {
        ...(oldValue && typeof oldValue === 'object' ? oldValue : {}),
        snapshotNetSalary: close.netSalary ?? close.snapshot?.netSalary ?? null,
        status: CLOSE_CYCLE_STATUS.APPROVED,
      },
      newValue: {
        ...(newValue && typeof newValue === 'object' ? newValue : {}),
        postApprovalAdjustment: true,
        recordDate,
        sourceType,
        sourceId: sourceId || '',
        snapshotUnchanged: true,
      },
      reason: entry.reason || `Bổ sung/sửa ${sourceType} sau duyệt kỳ`,
    }).catch((err) => console.warn('[close-post-approval] audit:', err?.message))
  }

  if (saved) notifyDataSynced(['payroll-cycle-closes', 'payroll'])
  return saved || close
}

/**
 * Sau khi NV sửa HĐ/chấm công khi phiếu đang submitted/resubmitted:
 * chuyển returned + đánh dấu cần gửi lại (không đụng phiếu approved).
 */
export async function invalidateCloseAfterSourceChange(employeeId, recordDate) {
  if (!employeeId || !recordDate) return null
  const info = resolveCloseCycleForRecordDate(recordDate)
  if (!info) return null

  const existing = await fetchPayrollCycleClose({
    employeeId,
    billingMonth: info.billingMonth,
    cycle: info.cycle,
  }).catch(() => null)

  if (!existing) return null
  if (existing.status === CLOSE_CYCLE_STATUS.APPROVED) return null
  if (!isCloseCyclePendingReview(existing.status)) return null

  // Chỉ invalidate nếu ngày sửa thuộc khoảng của phiếu đó
  const range = getApprovedCloseDateRange({
    ...existing,
    status: CLOSE_CYCLE_STATUS.APPROVED, // chỉ để đọc range
  })
  if (!range.fromDate || !range.toDate) return null
  if (recordDate < range.fromDate || recordDate > range.toDate) return null

  const now = new Date().toISOString()
  const reason = 'Dữ liệu đã thay đổi sau khi gửi. Vui lòng kiểm tra và gửi lại.'
  const saved = await upsertPayrollCycleClose({
    ...existing,
    status: CLOSE_CYCLE_STATUS.RETURNED,
    returnReason: reason,
    returnedAt: now,
    returnedBy: 'system',
    returnedByName: 'Hệ thống',
    approvedAt: null,
    approvedBy: '',
    approvedByName: '',
    validation: {
      ...(existing.validation && typeof existing.validation === 'object' ? existing.validation : {}),
      dataChangedAfterSubmit: true,
      dataChangedAt: now,
      dataChangedDate: recordDate,
    },
  })

  await insertPayrollCycleCloseEvent({
    id: `pcce_${saved.id}_${saved.submissionVersion || 0}_data_changed_${Date.now()}`,
    closeId: saved.id,
    employeeId,
    eventType: 'returned',
    fromStatus: existing.status,
    toStatus: CLOSE_CYCLE_STATUS.RETURNED,
    submissionVersion: saved.submissionVersion || 0,
    snapshot: existing.snapshot || {},
    note: reason,
    actorId: 'system',
    actorName: 'Hệ thống',
  }).catch(() => null)

  notifyDataSynced(['payroll-cycle-closes', 'payroll'])
  return saved
}
