import { getBranchName as resolveBranchName } from './branchStorage'
import {
  getExpenseTypeLabel,
  normalizeExpenseTypeId,
} from '../constants/expenseTypes'
import { deriveExpenseTimeFromTimestamp } from '../repositories/expenseSchema'
import { IMAGE_CATEGORIES, uploadImageFile } from './imageStorage'
import { getMonthStartDate, getTodayDate } from './invoiceStorage'
import {
  canAccessSessionBranch,
  denyAccess,
  getSessionUser,
  isSessionAdmin,
} from './storageAccess'
import { getCurrentUserName } from '../constants/auth'
import {
  canAddExpense as authCanAddExpense,
  canDeleteExpense as authCanDeleteExpense,
  canEditExpense as authCanEditExpense,
  canViewExpense as authCanViewExpense,
} from '../constants/auth'
import { checkPermission, PERMISSION_KEYS } from './permissionsStorage'
import { ROLES } from '../constants/roles'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { deleteExpenseRow, upsertExpense } from '../repositories/expensesRepository'
import { notifyDataSynced } from './dataSyncEvents'

const STORAGE_KEY = 'spa-manager-expenses'

async function pushExpenseToSupabase(expense) {
  if (!isSupabaseConfigured || !expense) {
    throw new Error('Supabase chưa cấu hình. Không thể lưu chi phí.')
  }
  await upsertExpense(expense)
}

async function pushExpenseDeletionToSupabase(id) {
  if (!isSupabaseConfigured || !id) {
    throw new Error('Supabase chưa cấu hình. Không thể xoá chi phí.')
  }
  await deleteExpenseRow(id)
}

export const EMPTY_EXPENSE_FORM = {
  date: getTodayDate(),
  expenseTime: '',
  branchId: '',
  expenseType: '',
  content: '',
  amount: '',
  paidBy: '',
  enteredBy: '',
  note: '',
  receiptImage: '',
}

export function parseAmount(value) {
  if (value === '' || value === null || value === undefined) return 0
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(num) || num < 0) return 0
  return num
}

export function createExpenseId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getCurrentTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data.map(normalizeExpense) : []
  } catch {
    return []
  }
}

export function saveExpenses(expenses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses))
  return expenses
}

export function normalizeExpense(expense) {
  const expenseType = normalizeExpenseTypeId(expense.expenseType)
  const updatedAt = expense.updatedAt ?? ''
  return {
    id: expense.id,
    date: expense.date ?? '',
    expenseTime: expense.expenseTime ?? deriveExpenseTimeFromTimestamp(updatedAt) ?? '',
    branchId: expense.branchId ?? '',
    branchName: expense.branchName ?? resolveBranchName(expense.branchId),
    expenseType,
    expenseTypeLabel: expense.expenseTypeLabel ?? getExpenseTypeLabel(expenseType),
    content: expense.content ?? '',
    amount: parseAmount(expense.amount),
    paidBy: expense.paidBy ?? '',
    enteredBy: expense.enteredBy ?? '',
    enteredById: expense.enteredById ?? '',
    note: expense.note ?? '',
    receiptImage: expense.receiptImage ?? '',
    updatedAt: expense.updatedAt ?? '',
  }
}

function sanitizeExpenseData(data) {
  const amount = parseAmount(data.amount)
  const expenseType = normalizeExpenseTypeId(data.expenseType)
  return {
    date: data.date ?? '',
    expenseTime: data.expenseTime?.trim() || getCurrentTime(),
    branchId: data.branchId ?? '',
    branchName: resolveBranchName(data.branchId),
    expenseType,
    expenseTypeLabel: getExpenseTypeLabel(expenseType),
    content: data.content?.trim() ?? '',
    amount,
    paidBy: data.paidBy?.trim() ?? '',
    enteredBy: data.enteredBy?.trim() ?? getCurrentUserName(),
    enteredById: data.enteredById ?? getSessionUser()?.employeeId ?? '',
    note: data.note?.trim() ?? '',
    receiptImage: data.receiptImage ?? '',
  }
}

export function getBranchName(branchId) {
  return resolveBranchName(branchId)
}

function canManageExpenses() {
  const user = getSessionUser()
  if (!user?.role) return false
  return authCanViewExpense(user.role, user.branch)
    || authCanAddExpense(user.role, user.branch)
    || checkPermission(PERMISSION_KEYS.MANAGE_EXPENSES, user.role, user.branch)
}

function canModifyExpenses() {
  const user = getSessionUser()
  if (!user?.role) return false
  return authCanAddExpense(user.role, user.branch)
    || authCanEditExpense(user.role, user.branch)
    || checkPermission(PERMISSION_KEYS.MANAGE_EXPENSES, user.role, user.branch)
}

function canRemoveExpenses() {
  const user = getSessionUser()
  if (!user?.role) return false
  return authCanDeleteExpense(user.role, user.branch)
}

export function isExpensePeriodLocked(expense) {
  if (isSessionAdmin()) return false
  const monthStart = getMonthStartDate()
  return expense.date < monthStart
}

export function canDeleteExpenseRecord(expense) {
  if (!canRemoveExpenses()) {
    return { allowed: false, reason: 'Bạn không có quyền xóa chi phí.' }
  }
  if (!canAccessSessionBranch(expense.branchId)) {
    return { allowed: false, reason: 'Bạn không có quyền thao tác chi phí chi nhánh này.' }
  }
  return { allowed: true }
}

export function canEditExpenseRecord(expense) {
  if (!canModifyExpenses()) {
    return { allowed: false, reason: 'Bạn không có quyền sửa chi phí.' }
  }
  if (!canAccessSessionBranch(expense.branchId)) {
    return { allowed: false, reason: 'Bạn không có quyền thao tác chi phí chi nhánh này.' }
  }
  if (isSessionAdmin()) return { allowed: true }
  if (isExpensePeriodLocked(expense)) {
    return { allowed: false, reason: 'Kỳ này đã khóa — không thể sửa chi phí tháng trước.' }
  }
  const currentName = getCurrentUserName()
  if (expense.enteredBy && expense.enteredBy !== currentName) {
    return { allowed: false, reason: 'Chỉ được sửa chi phí do chính bạn nhập.' }
  }
  return { allowed: true }
}

function assertExpenseWriteAccess(expense) {
  if (!canModifyExpenses()) {
    return denyAccess('Bạn không có quyền quản lý chi phí.')
  }
  if (!canAccessSessionBranch(expense.branchId)) {
    return denyAccess('Bạn không có quyền thao tác chi phí chi nhánh này.')
  }
  return { success: true }
}

export async function addExpense(data) {
  const sanitized = sanitizeExpenseData(data)
  const access = assertExpenseWriteAccess(sanitized)
  if (!access.success) return access

  const expense = normalizeExpense({
    id: createExpenseId(),
    ...sanitized,
    updatedAt: new Date().toISOString(),
  })

  try {
    await pushExpenseToSupabase(expense)
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể lưu chi phí lên máy chủ.' }
  }

  const expenses = loadExpenses()
  expenses.unshift(expense)
  saveExpenses(expenses)
  notifyDataSynced(['expenses'])
  return { success: true, expense }
}

export async function updateExpense(id, data) {
  const expenses = loadExpenses()
  const index = expenses.findIndex((exp) => exp.id === id)
  if (index === -1) {
    return denyAccess('Không tìm thấy khoản chi.')
  }

  const editCheck = canEditExpenseRecord(expenses[index])
  if (!editCheck.allowed) {
    return denyAccess(editCheck.reason)
  }

  const merged = sanitizeExpenseData({ ...expenses[index], ...data })
  const access = assertExpenseWriteAccess(merged)
  if (!access.success) return access

  expenses[index] = normalizeExpense({
    ...expenses[index],
    ...merged,
    updatedAt: new Date().toISOString(),
  })

  try {
    await pushExpenseToSupabase(expenses[index])
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể cập nhật chi phí lên máy chủ.' }
  }

  saveExpenses(expenses)
  notifyDataSynced(['expenses'])
  return { success: true, expense: expenses[index] }
}

export async function deleteExpense(id) {
  const expenses = loadExpenses()
  const current = expenses.find((exp) => exp.id === id)
  if (!current) {
    return denyAccess('Không tìm thấy khoản chi.')
  }

  const deleteCheck = canDeleteExpenseRecord(current)
  if (!deleteCheck.allowed) {
    return denyAccess(deleteCheck.reason)
  }

  const next = expenses.filter((exp) => exp.id !== id)

  try {
    await pushExpenseDeletionToSupabase(id)
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể xoá chi phí trên máy chủ.' }
  }

  saveExpenses(next)
  notifyDataSynced(['expenses'])
  return { success: true, expenses: next }
}

export function filterExpenses(expenses, { fromDate, toDate, branchId, expenseType } = {}) {
  return expenses.filter((exp) => {
    if (fromDate && exp.date < fromDate) return false
    if (toDate && exp.date > toDate) return false
    if (branchId && exp.branchId !== branchId) return false
    if (expenseType && normalizeExpenseTypeId(exp.expenseType) !== normalizeExpenseTypeId(expenseType)) {
      return false
    }
    return true
  })
}

export function sumExpenseAmount(expenses) {
  return expenses.reduce((sum, exp) => sum + parseAmount(exp.amount), 0)
}

export function computeExpenseTotals(expenses) {
  const today = getTodayDate()
  const monthStart = getMonthStartDate()

  const todayExpenses = expenses.filter((exp) => exp.date === today)
  const monthExpenses = expenses.filter((exp) => exp.date >= monthStart && exp.date <= today)

  const byBranchMap = new Map()
  for (const exp of monthExpenses) {
    const key = exp.branchId || 'unknown'
    const current = byBranchMap.get(key) ?? {
      branchId: exp.branchId,
      branchName: exp.branchName || getBranchName(exp.branchId),
      total: 0,
    }
    current.total += parseAmount(exp.amount)
    byBranchMap.set(key, current)
  }

  return {
    today: sumExpenseAmount(todayExpenses),
    month: sumExpenseAmount(monthExpenses),
    byBranch: [...byBranchMap.values()].sort((a, b) =>
      a.branchName.localeCompare(b.branchName, 'vi'),
    ),
  }
}

export function computeExpenseSummary(expenses) {
  return {
    total: sumExpenseAmount(expenses),
    count: expenses.length,
  }
}

export function computeExpenseByBranch(expenses) {
  const map = new Map()

  for (const exp of expenses) {
    const key = exp.branchId || 'unknown'
    const current = map.get(key) ?? {
      branchId: exp.branchId,
      branchName: exp.branchName || getBranchName(exp.branchId),
      total: 0,
      count: 0,
    }
    current.total += parseAmount(exp.amount)
    current.count += 1
    map.set(key, current)
  }

  return [...map.values()].sort((a, b) => b.total - a.total)
}

export async function readReceiptImage(file, entityId = 'expense') {
  if (!file) return { success: false, error: 'Không có file.' }
  if (!file.type.startsWith('image/')) {
    return { success: false, error: 'Chỉ chấp nhận file ảnh.' }
  }

  try {
    const dataUrl = await uploadImageFile(file, {
      category: IMAGE_CATEGORIES.RECEIPT,
      entityId,
      maxBytes: 5 * 1024 * 1024,
    })
    return { success: true, dataUrl }
  } catch (error) {
    return { success: false, error: error?.message ?? 'Upload ảnh thất bại.' }
  }
}
