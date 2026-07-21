import { getCurrentUser, getCurrentUserEmployeeId, getCurrentUserName, isAdmin, isEmployee } from '../constants/auth'
import { PAYROLL_ADJUSTMENT_TYPES } from '../constants/payrollTypes'
import { isPayrollMonthLocked } from './payrollEngine'
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
    amount: Math.abs(Number(payload.amount ?? 0)),
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
  return saved
}

export async function editPayrollAdjustment(record, updates, locks = null) {
  assertCanManagePayroll(record.branchId)
  await assertMonthEditable(record.month, record.branchId, locks)

  const next = {
    ...record,
    ...updates,
    amount: updates.amount !== undefined ? Math.abs(Number(updates.amount)) : record.amount,
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
