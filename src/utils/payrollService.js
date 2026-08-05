import { getCurrentUser, getCurrentUserEmployeeId, getCurrentUserName, isAdmin, isEmployee } from '../constants/auth'
import { PAYROLL_ADJUSTMENT_TYPES, normalizePayrollAdjustmentAmount } from '../constants/payrollTypes'
import { isPayrollMonthLocked } from './payrollEngine'
import { buildPayrollFieldAuditValues } from './payrollFieldAudit'
import { notifyDataSynced } from './dataSyncEvents'
import { invalidateCloseAfterSourceChange } from './payrollCycleClose/approvedCloseLock'
import {
  createPayrollAdjustmentId,
  createPayrollAuditId,
  createPayrollLockId,
  deletePayrollAdjustment,
  fetchPayrollAdjustments,
  fetchPayrollAuditLogs,
  fetchPayrollLocks,
  insertPayrollAdjustment,
  insertPayrollAuditLog,
  updatePayrollAdjustment,
  upsertPayrollLock,
} from '../repositories/payrollRepository'

async function afterPayrollAdjustmentSourceChanged(record) {
  if (!record?.employeeId) return
  const date = String(record.date || '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await invalidateCloseAfterSourceChange(record.employeeId, date).catch((err) => {
      console.warn('[payroll-adjustment] invalidate close:', err?.message)
    })
  }
  notifyDataSynced(['payroll', 'payroll-adjustments', 'payroll-cycle-closes'])
}

function currentEditor() {
  const user = getCurrentUser()
  return {
    editorId: user?.employeeId ?? user?.username ?? user?.role ?? '',
    editorName: getCurrentUserName(),
  }
}

async function writeAuditLog({ entityType, entityId, action, oldValue, newValue, reason }) {
  const { editorId, editorName } = currentEditor()
  return insertPayrollAuditLog({
    id: createPayrollAuditId(),
    entityType,
    entityId,
    action,
    editorId,
    editorName,
    oldValue: oldValue ?? {},
    newValue: newValue ?? {},
    reason: reason ?? '',
  })
}

/** Re-export helper thuần (dùng chung UI + script). */
export { buildPayrollFieldAuditValues } from './payrollFieldAudit'

export async function loadPayrollAuditLogs(filters = {}) {
  return fetchPayrollAuditLogs(filters)
}

export async function loadPayrollLocks(month = '') {
  return fetchPayrollLocks({ month })
}

export function assertCanManagePayroll(employeeBranchId = '') {
  if (isAdmin()) return true
  if (isEmployee()) {
    throw new Error('Nhân viên không được thêm hoặc sửa khoản lương.')
  }
  const userBranch = getCurrentUser()?.branch ?? ''
  if (employeeBranchId && userBranch && employeeBranchId !== userBranch) {
    throw new Error('Chỉ được thao tác nhân viên thuộc chi nhánh của bạn.')
  }
  return true
}

export function assertCanAdminEditPayroll() {
  if (!isAdmin()) {
    throw new Error('Chỉ Admin được dùng KPI / Sửa bảng lương.')
  }
  return true
}

export async function assertMonthEditable(month, branchId, locks) {
  const rows = locks ?? await fetchPayrollLocks({ month })
  if (isPayrollMonthLocked(month, branchId, rows)) {
    throw new Error('Tháng lương đã chốt. Admin cần mở khóa trước khi sửa.')
  }
}

export async function addPayrollAdjustment(payload, locks = null) {
  assertCanManagePayroll(payload.branchId)
  await assertMonthEditable(payload.month, payload.branchId, locks)

  const { editorId, editorName } = currentEditor()
  const record = {
    id: createPayrollAdjustmentId(),
    date: payload.date,
    month: payload.month,
    branchId: payload.branchId ?? '',
    employeeId: payload.employeeId,
    employeeName: payload.employeeName ?? '',
    type: payload.type,
    amount: normalizePayrollAdjustmentAmount(payload.type, payload.amount),
    reason: payload.reason?.trim?.() ?? payload.reason ?? '',
    note: payload.note?.trim?.() ?? payload.note ?? '',
    expenseId: payload.expenseId ?? '',
    payrollCycle: payload.payrollCycle ?? '',
    createdBy: editorId,
    createdByName: editorName,
  }

  const saved = await insertPayrollAdjustment(record)
  await writeAuditLog({
    entityType: 'payroll_adjustment',
    entityId: saved.id,
    action: 'create',
    oldValue: {},
    newValue: saved,
    reason: payload.reason ?? '',
  })
  await afterPayrollAdjustmentSourceChanged(saved)
  return saved
}

export async function editPayrollAdjustment(record, updates, locks = null) {
  assertCanManagePayroll(record.branchId)
  await assertMonthEditable(record.month, record.branchId, locks)

  const nextType = updates.type ?? record.type
  const next = {
    ...record,
    ...updates,
    amount: updates.amount !== undefined
      ? normalizePayrollAdjustmentAmount(nextType, updates.amount)
      : record.amount,
    updatedAt: new Date().toISOString(),
  }

  const saved = await updatePayrollAdjustment(next)
  await writeAuditLog({
    entityType: 'payroll_adjustment',
    entityId: saved.id,
    action: 'update',
    oldValue: record,
    newValue: saved,
    reason: updates.reason ?? record.reason ?? '',
  })
  await afterPayrollAdjustmentSourceChanged(saved)
  if (record.employeeId !== saved.employeeId || record.date !== saved.date || record.month !== saved.month) {
    await afterPayrollAdjustmentSourceChanged(record)
  }
  return saved
}

export async function removePayrollAdjustment(record, reason = '', locks = null) {
  if (!isAdmin()) {
    throw new Error('Chỉ Admin được xóa khoản lương.')
  }
  await assertMonthEditable(record.month, record.branchId, locks)
  await deletePayrollAdjustment(record.id)
  await writeAuditLog({
    entityType: 'payroll_adjustment',
    entityId: record.id,
    action: 'delete',
    oldValue: record,
    newValue: {},
    reason,
  })
  await afterPayrollAdjustmentSourceChanged(record)
}

/**
 * Admin — lưu hàng loạt chỉnh sửa bảng lương (có lý do bắt buộc, audit từng khoản).
 * Không hard-delete: dòng bỏ / số 0 → cập nhật amount = 0 để giữ lịch sử.
 */
export async function saveAdminPayrollBoardEdits({
  reason,
  lines = [],
  existing = [],
  employeeId,
  employeeName,
  branchId,
  month,
  cycle = '',
  locks = null,
}) {
  assertCanAdminEditPayroll()
  if (!String(reason || '').trim()) {
    throw new Error('Lý do chỉnh sửa là bắt buộc.')
  }
  await assertMonthEditable(month, branchId, locks)

  const keptIds = new Set(lines.filter((line) => line.id).map((line) => line.id))
  const results = []

  for (const record of existing) {
    if (!record?.id || keptIds.has(record.id)) continue
    const oldAmount = Number(record.amount ?? 0)
    if (oldAmount === 0) {
      results.push({ action: 'skip', id: record.id })
      continue
    }
    const saved = await editPayrollAdjustment(record, {
      amount: 0,
      note: record.note,
      reason,
    }, locks)
    const field = buildPayrollFieldAuditValues({
      employeeId,
      employeeName,
      branchId,
      month,
      cycle,
      fieldChanged: record.type,
      oldValue: oldAmount,
      newValue: 0,
      difference: -oldAmount,
      extra: { adjustmentId: saved.id },
    })
    await writeAuditLog({
      entityType: 'payroll_field',
      entityId: employeeId,
      action: 'zero_adjustment',
      ...field,
      reason,
    })
    results.push({ action: 'zero', id: saved.id })
  }

  for (const line of lines) {
    if (line.id && line.original) {
      const oldAmount = Number(line.original.amount ?? 0)
      const nextAmount = Number(line.amount)
      const nextNote = String(line.note ?? '')
      const oldNote = String(line.original.note ?? '')
      const typeChanged = line.type !== line.original.type
      const amountChanged = oldAmount !== nextAmount
      const noteChanged = nextNote !== oldNote
      // Không ghi đè hàng loạt dòng không đổi (tránh race/chậm khi nhiều dòng KPI lịch sử).
      if (!typeChanged && !amountChanged && !noteChanged) {
        results.push({ action: 'unchanged', id: line.id })
        continue
      }
      const saved = await editPayrollAdjustment(line.original, {
        type: line.type,
        amount: nextAmount,
        note: line.note,
        reason,
      }, locks)
      const field = buildPayrollFieldAuditValues({
        employeeId,
        employeeName,
        branchId,
        month,
        cycle,
        fieldChanged: line.type,
        oldValue: oldAmount,
        newValue: nextAmount,
        difference: nextAmount - oldAmount,
        extra: { adjustmentId: saved.id, note: line.note || '' },
      })
      await writeAuditLog({
        entityType: 'payroll_field',
        entityId: employeeId,
        action: 'update_field',
        ...field,
        reason,
      })
      results.push({ action: 'update', id: saved.id })
      continue
    }

    // Dòng mới amount = 0: không tạo bản ghi rỗng.
    if (Number(line.amount) === 0) continue
    const saved = await addPayrollAdjustment({
      type: line.type,
      amount: line.amount,
      note: line.note,
      reason,
      date: line.date,
      month,
      branchId,
      employeeId,
      employeeName,
      payrollCycle: cycle,
    }, locks)
    const field = buildPayrollFieldAuditValues({
      employeeId,
      employeeName,
      branchId,
      month,
      cycle,
      fieldChanged: line.type,
      oldValue: 0,
      newValue: Number(line.amount),
      difference: Number(line.amount),
      extra: { adjustmentId: saved.id, note: line.note || '' },
    })
    await writeAuditLog({
      entityType: 'payroll_field',
      entityId: employeeId,
      action: 'create_field',
      ...field,
      reason,
    })
    results.push({ action: 'create', id: saved.id })
  }

  await writeAuditLog({
    entityType: 'payroll_board',
    entityId: employeeId,
    action: 'admin_edit_board',
    oldValue: { existingIds: existing.map((row) => row.id) },
    newValue: { results },
    reason,
  })

  return results
}

/**
 * Admin — đặt tổng KPI kỳ về một giá trị (dương / âm / 0).
 * Không xóa lịch sử: nếu cần, thêm dòng KPI bù (delta) để tổng = target.
 */
export async function setAdminKpiAmount(payload, locks = null) {
  assertCanAdminEditPayroll()
  const target = Number(payload.amount)
  if (!Number.isFinite(target)) {
    throw new Error('Số KPI không hợp lệ.')
  }
  if (!String(payload.reason || '').trim()) {
    throw new Error('Lý do là bắt buộc.')
  }
  await assertMonthEditable(payload.month, payload.branchId, locks)

  const fromDate = payload.fromDate || ''
  const toDate = payload.toDate || ''
  const rows = (payload.existingAdjustments ?? await fetchPayrollAdjustments({
    month: payload.month,
    employeeId: payload.employeeId,
  })).filter((row) => {
    if (row.employeeId !== payload.employeeId) return false
    if (row.type !== PAYROLL_ADJUSTMENT_TYPES.KPI) return false
    if (fromDate && row.date < fromDate) return false
    if (toDate && row.date > toDate) return false
    return true
  })

  const oldKpi = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const difference = target - oldKpi
  let adjustment = null

  if (difference !== 0) {
    adjustment = await addPayrollAdjustment({
      type: PAYROLL_ADJUSTMENT_TYPES.KPI,
      amount: difference,
      note: payload.note?.trim?.() || (target === 0 ? 'Đưa KPI về 0' : ''),
      reason: payload.reason,
      date: payload.date || toDate || `${payload.month}-15`,
      month: payload.month,
      branchId: payload.branchId,
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      payrollCycle: payload.payrollCycle || payload.cycle || '',
    }, locks)
  }

  const field = buildPayrollFieldAuditValues({
    employeeId: payload.employeeId,
    employeeName: payload.employeeName,
    branchId: payload.branchId,
    month: payload.month,
    cycle: payload.payrollCycle || payload.cycle || '',
    fieldChanged: 'kpi',
    oldValue: oldKpi,
    newValue: target,
    difference,
    extra: { adjustmentId: adjustment?.id || null, note: payload.note || '' },
  })
  await writeAuditLog({
    entityType: 'payroll_field',
    entityId: payload.employeeId,
    action: 'set_kpi',
    ...field,
    reason: payload.reason,
  })

  return { oldKpi, newKpi: target, difference, adjustment }
}

/** @deprecated Dùng setAdminKpiAmount — giữ alias để không gãy import cũ. */
export async function addAdminKpiAdjustment(payload, locks = null) {
  return setAdminKpiAmount(payload, locks)
}

export async function lockPayrollMonth({ month, branchId = '', note = '' }) {
  if (!isAdmin()) throw new Error('Chỉ Admin được chốt lương.')
  const { editorId, editorName } = currentEditor()
  const record = {
    id: createPayrollLockId(month, branchId),
    month,
    branchId: branchId ?? '',
    isLocked: true,
    lockedAt: new Date().toISOString(),
    lockedBy: editorId,
    lockedByName: editorName,
    unlockedAt: null,
    unlockedBy: '',
    unlockedByName: '',
    note: note ?? '',
  }
  const saved = await upsertPayrollLock(record)
  await writeAuditLog({
    entityType: 'payroll_lock',
    entityId: saved.id,
    action: 'lock',
    oldValue: { isLocked: false },
    newValue: saved,
    reason: note,
  })
  return saved
}

export async function unlockPayrollMonth({ month, branchId = '', reason = '' }) {
  if (!isAdmin()) throw new Error('Chỉ Admin được mở khóa lương.')
  const { editorId, editorName } = currentEditor()
  const record = {
    id: createPayrollLockId(month, branchId),
    month,
    branchId: branchId ?? '',
    isLocked: false,
    unlockedAt: new Date().toISOString(),
    unlockedBy: editorId,
    unlockedByName: editorName,
    note: reason ?? '',
  }
  const saved = await upsertPayrollLock(record)
  await writeAuditLog({
    entityType: 'payroll_lock',
    entityId: saved.id,
    action: 'unlock',
    oldValue: { isLocked: true },
    newValue: saved,
    reason,
  })
  return saved
}

export async function recordPayrollPayment({ month, branchId, employeeId, employeeName, amount, date, note = '' }, locks = null) {
  return addPayrollAdjustment({
    month,
    branchId,
    employeeId,
    employeeName,
    type: PAYROLL_ADJUSTMENT_TYPES.PAYMENT,
    amount,
    date: date ?? `${month}-28`,
    reason: 'Thanh toán lương',
    note,
  }, locks)
}

export function canViewEmployeePayroll(employeeId, employeeBranchId) {
  if (isAdmin()) return true
  if (isEmployee()) return employeeId === getCurrentUserEmployeeId()
  const userBranch = getCurrentUser()?.branch ?? ''
  return employeeBranchId === userBranch
}

export async function fetchAdjustmentsForMonth(month, branchId = '', employeeId = '') {
  return fetchPayrollAdjustments({ month, branchId, employeeId })
}
