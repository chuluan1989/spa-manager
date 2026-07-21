import { SALARY_ADVANCE_EXPENSE_TYPE, SALARY_ADVANCE_EXPENSE_LABEL } from '../../constants/salaryAdvanceTypes'
import { PAYROLL_ADJUSTMENT_TYPES } from '../../constants/payrollTypes'
import { getEmployeeById } from '../employeeStorage'
import { normalizeExpenseTypeId } from '../../constants/expenseTypes'
import {
  createExpenseId,
  loadExpenses,
  normalizeExpense,
  parseAmount,
  saveExpenses,
} from '../expenseStorage'
import { upsertExpense, deleteExpenseRow } from '../../repositories/expensesRepository'
import { notifyDataSynced } from '../dataSyncEvents'
import { getBranchName } from '../branchStorage'
import { getCurrentUserName } from '../../constants/auth'
import { getSessionUser, denyAccess } from '../storageAccess'
import {
  addPayrollAdjustment,
  editPayrollAdjustment,
  removePayrollAdjustment,
  loadPayrollLocks,
} from '../payrollService'
import { fetchPayrollAdjustments } from '../../repositories/payrollRepository'
import { insertExpenseChangeLog } from '../../repositories/expenseChangeLogsRepository'
import {
  assertSalaryAdvanceEmployeeScope,
  canAddSalaryAdvance,
  canDeleteSalaryAdvance,
  canEditSalaryAdvance,
} from './salaryAdvanceAccess'
import { resolveAdvanceTargetWithLock, resolvePayrollPeriodFromAdvanceDate } from './salaryAdvancePeriod'

export function isSalaryAdvanceExpense(expense) {
  return normalizeExpenseTypeId(expense?.expenseType) === SALARY_ADVANCE_EXPENSE_TYPE
}

function createAuditLogId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `ecl-${crypto.randomUUID()}`
  }
  return `ecl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

async function logSalaryAdvanceChange({ action, expense, oldValues = {}, newValues = {} }) {
  try {
    await insertExpenseChangeLog({
      id: createAuditLogId(),
      entityType: 'salary_advance',
      entityId: expense?.id ?? '',
      branchId: expense?.branchId ?? '',
      action,
      changedBy: getCurrentUserName(),
      changedByRole: getSessionUser()?.role ?? '',
      oldValues,
      newValues,
    })
  } catch {
    // audit best-effort
  }
}

function buildSalaryAdvanceExpensePayload(data, target, employee) {
  const amount = parseAmount(data.amount)
  return normalizeExpense({
    id: data.id ?? createExpenseId(),
    date: target.advanceDate,
    expenseTime: data.expenseTime?.trim() || '',
    branchId: data.branchId,
    branchName: getBranchName(data.branchId),
    expenseType: SALARY_ADVANCE_EXPENSE_TYPE,
    expenseTypeLabel: SALARY_ADVANCE_EXPENSE_LABEL,
    content: data.content?.trim() || `Ứng lương · ${employee.name}`,
    amount,
    paidBy: data.paidBy?.trim() || getCurrentUserName(),
    enteredBy: data.enteredBy?.trim() || getCurrentUserName(),
    enteredById: data.enteredById ?? getSessionUser()?.employeeId ?? '',
    note: data.note?.trim() || '',
    receiptImage: data.receiptImage ?? '',
    employeeId: employee.id,
    employeeName: employee.name,
    advanceDate: target.advanceDate,
    payrollMonth: target.month,
    payrollCycle: target.cycle,
    payrollPeriod: target.payrollPeriod,
    payrollAdjustmentId: data.payrollAdjustmentId ?? '',
    updatedAt: new Date().toISOString(),
  })
}

async function persistExpense(expense) {
  await upsertExpense(expense)
  const expenses = loadExpenses()
  const idx = expenses.findIndex((row) => row.id === expense.id)
  if (idx >= 0) expenses[idx] = expense
  else expenses.unshift(expense)
  saveExpenses(expenses)
  notifyDataSynced(['expenses', 'payroll'])
}

async function removeExpenseLocal(id) {
  await deleteExpenseRow(id)
  saveExpenses(loadExpenses().filter((row) => row.id !== id))
  notifyDataSynced(['expenses', 'payroll'])
}

async function findAdjustmentByExpenseId(expenseId) {
  const rows = await fetchPayrollAdjustments({})
  return rows.find((row) => row.expenseId === expenseId) ?? null
}

async function findAdjustmentById(id) {
  if (!id) return null
  const rows = await fetchPayrollAdjustments({})
  return rows.find((row) => row.id === id) ?? null
}

export async function createSalaryAdvance(data, { forceNextPeriod = false } = {}) {
  const user = getSessionUser()
  if (!canAddSalaryAdvance(user?.role, user?.branch)) {
    return denyAccess('Nhân viên không được nhập ứng lương.')
  }

  const employee = getEmployeeById(data.employeeId)
  if (!employee) return { success: false, error: 'Không tìm thấy nhân viên.' }

  try {
    assertSalaryAdvanceEmployeeScope(employee.id, employee.branchId, data.branchId || user?.branch)
  } catch (err) {
    return { success: false, error: err.message }
  }

  const advanceDate = data.advanceDate || data.date
  const locks = await loadPayrollLocks()
  const target = resolveAdvanceTargetWithLock(advanceDate, data.branchId, locks, { forceNextPeriod })
  if (target.blocked) {
    return {
      success: false,
      needsConfirmation: target.locked && !forceNextPeriod,
      error: target.message,
      suggestedNext: target.suggestedNext,
    }
  }

  const expenseDraft = buildSalaryAdvanceExpensePayload({ ...data, id: createExpenseId() }, target, employee)

  try {
    const adjustment = await addPayrollAdjustment({
      date: target.advanceDate,
      month: target.month,
      branchId: data.branchId,
      employeeId: employee.id,
      employeeName: employee.name,
      type: PAYROLL_ADJUSTMENT_TYPES.ADVANCE,
      amount: expenseDraft.amount,
      reason: expenseDraft.content,
      note: data.note?.trim() || '',
      expenseId: expenseDraft.id,
      payrollCycle: target.cycle,
    }, locks)

    const expense = { ...expenseDraft, payrollAdjustmentId: adjustment.id }
    await persistExpense(expense)
    await logSalaryAdvanceChange({
      action: 'create',
      expense,
      newValues: { expense, adjustmentId: adjustment.id, employeeId: employee.id },
    })

    return { success: true, expense, adjustment, shifted: target.shifted }
  } catch (err) {
    return { success: false, error: err?.message ?? 'Không thể tạo ứng lương.' }
  }
}

export async function updateSalaryAdvance(expenseId, data, { forceNextPeriod = false } = {}) {
  const user = getSessionUser()
  if (!canEditSalaryAdvance(user?.role, user?.branch)) {
    return denyAccess('Bạn không có quyền sửa ứng lương.')
  }

  const expenses = loadExpenses()
  const current = expenses.find((row) => row.id === expenseId)
  if (!current || !isSalaryAdvanceExpense(current)) {
    return { success: false, error: 'Không tìm thấy khoản ứng lương.' }
  }

  const employee = getEmployeeById(data.employeeId || current.employeeId)
  if (!employee) return { success: false, error: 'Không tìm thấy nhân viên.' }

  try {
    assertSalaryAdvanceEmployeeScope(employee.id, employee.branchId, data.branchId || current.branchId)
  } catch (err) {
    return { success: false, error: err.message }
  }

  const advanceDate = data.advanceDate || data.date || current.advanceDate || current.date
  const locks = await loadPayrollLocks()
  const target = resolveAdvanceTargetWithLock(advanceDate, data.branchId || current.branchId, locks, { forceNextPeriod })
  if (target.blocked) {
    return {
      success: false,
      needsConfirmation: target.locked && !forceNextPeriod,
      error: target.message,
      suggestedNext: target.suggestedNext,
    }
  }

  const oldAdjustment = await findAdjustmentById(current.payrollAdjustmentId)
    ?? await findAdjustmentByExpenseId(expenseId)

  const expenseNext = buildSalaryAdvanceExpensePayload({
    ...current,
    ...data,
    id: expenseId,
    payrollAdjustmentId: oldAdjustment?.id ?? current.payrollAdjustmentId,
  }, target, employee)

  try {
    let adjustment = oldAdjustment

    const needsRecreate = !adjustment
      || adjustment.employeeId !== employee.id
      || adjustment.month !== target.month
      || adjustment.date !== target.advanceDate

    if (needsRecreate && adjustment) {
      await removePayrollAdjustment(adjustment, 'Cập nhật khoản ứng lương', locks)
      adjustment = null
    }

    if (!adjustment) {
      adjustment = await addPayrollAdjustment({
        date: target.advanceDate,
        month: target.month,
        branchId: expenseNext.branchId,
        employeeId: employee.id,
        employeeName: employee.name,
        type: PAYROLL_ADJUSTMENT_TYPES.ADVANCE,
        amount: expenseNext.amount,
        reason: expenseNext.content,
        note: data.note?.trim() || expenseNext.note,
        expenseId,
        payrollCycle: target.cycle,
      }, locks)
    } else {
      adjustment = await editPayrollAdjustment(adjustment, {
        date: target.advanceDate,
        month: target.month,
        branchId: expenseNext.branchId,
        employeeId: employee.id,
        employeeName: employee.name,
        amount: expenseNext.amount,
        reason: expenseNext.content,
        note: data.note?.trim() || expenseNext.note,
        expenseId,
        payrollCycle: target.cycle,
      }, locks)
    }

    const expense = { ...expenseNext, payrollAdjustmentId: adjustment.id }
    await persistExpense(expense)
    await logSalaryAdvanceChange({
      action: 'update',
      expense,
      oldValues: { expense: current, adjustmentId: oldAdjustment?.id },
      newValues: { expense, adjustmentId: adjustment.id, employeeId: employee.id },
    })

    return { success: true, expense, adjustment, shifted: target.shifted }
  } catch (err) {
    return { success: false, error: err?.message ?? 'Không thể cập nhật ứng lương.' }
  }
}

export async function deleteSalaryAdvance(expenseId, reason = '') {
  const user = getSessionUser()
  if (!canDeleteSalaryAdvance(user?.role, user?.branch)) {
    return denyAccess('Chỉ Admin được xóa khoản ứng lương.')
  }

  const expenses = loadExpenses()
  const current = expenses.find((row) => row.id === expenseId)
  if (!current || !isSalaryAdvanceExpense(current)) {
    return { success: false, error: 'Không tìm thấy khoản ứng lương.' }
  }

  const locks = await loadPayrollLocks()
  const adjustment = await findAdjustmentById(current.payrollAdjustmentId)
    ?? await findAdjustmentByExpenseId(expenseId)

  try {
    if (adjustment) {
      await removePayrollAdjustment(adjustment, reason || 'Xóa khoản ứng lương', locks)
    }
    await removeExpenseLocal(expenseId)
    await logSalaryAdvanceChange({
      action: 'delete',
      expense: current,
      oldValues: { expense: current, adjustmentId: adjustment?.id },
      newValues: {},
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err?.message ?? 'Không thể xóa ứng lương.' }
  }
}

export function computeGrossBeforeDeduction(parts) {
  return (
    Number(parts.baseSalary ?? 0)
    + Number(parts.commission ?? 0)
    + Number(parts.tips ?? 0)
    + Number(parts.bonus ?? 0)
    - Number(parts.reduction ?? 0)
    - Number(parts.penalty ?? 0)
  )
}
