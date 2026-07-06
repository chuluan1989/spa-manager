import { getBranchName as resolveBranchName } from './branchStorage'
import { getExpenseTypeLabel } from '../constants/expenseTypes'
import { getMonthStartDate, getTodayDate } from './invoiceStorage'
import {
  canAccessSessionBranch,
  denyAccess,
  getSessionUser,
  isSessionAdmin,
} from './storageAccess'

import { ROLES } from '../constants/roles'

const STORAGE_KEY = 'spa-manager-expenses'

export const EMPTY_EXPENSE_FORM = {
  date: getTodayDate(),
  branchId: '',
  expenseType: '',
  content: '',
  amount: '',
  enteredBy: '',
  note: '',
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

function normalizeExpense(expense) {
  return {
    id: expense.id,
    date: expense.date ?? '',
    branchId: expense.branchId ?? '',
    branchName: expense.branchName ?? resolveBranchName(expense.branchId),
    expenseType: expense.expenseType ?? '',
    expenseTypeLabel: expense.expenseTypeLabel ?? getExpenseTypeLabel(expense.expenseType),
    content: expense.content ?? '',
    amount: parseAmount(expense.amount),
    enteredBy: expense.enteredBy ?? '',
    note: expense.note ?? '',
  }
}

function sanitizeExpenseData(data) {
  const amount = parseAmount(data.amount)
  return {
    date: data.date ?? '',
    branchId: data.branchId ?? '',
    branchName: resolveBranchName(data.branchId),
    expenseType: data.expenseType ?? '',
    expenseTypeLabel: getExpenseTypeLabel(data.expenseType),
    content: data.content?.trim() ?? '',
    amount,
    enteredBy: data.enteredBy?.trim() ?? '',
    note: data.note?.trim() ?? '',
  }
}

export function getBranchName(branchId) {
  return resolveBranchName(branchId)
}

function canManageExpenses() {
  const user = getSessionUser()
  return user?.role === ROLES.ADMIN || user?.role === ROLES.BRANCH_MANAGER
}

function assertExpenseWriteAccess(expense) {
  if (!canManageExpenses()) {
    return denyAccess('Bạn không có quyền quản lý chi phí.')
  }
  if (!canAccessSessionBranch(expense.branchId)) {
    return denyAccess('Bạn không có quyền thao tác chi phí chi nhánh này.')
  }
  return { success: true }
}

export function addExpense(data) {
  const sanitized = sanitizeExpenseData(data)
  const access = assertExpenseWriteAccess(sanitized)
  if (!access.success) return access

  const expenses = loadExpenses()
  const expense = normalizeExpense({
    id: createExpenseId(),
    ...sanitized,
  })
  expenses.unshift(expense)
  saveExpenses(expenses)
  return { success: true, expense }
}

export function updateExpense(id, data) {
  const expenses = loadExpenses()
  const index = expenses.findIndex((exp) => exp.id === id)
  if (index === -1) {
    return denyAccess('Không tìm thấy khoản chi.')
  }

  const merged = sanitizeExpenseData({ ...expenses[index], ...data })
  const access = assertExpenseWriteAccess(merged)
  if (!access.success) return access

  if (!isSessionAdmin()) {
    const currentAccess = assertExpenseWriteAccess(expenses[index])
    if (!currentAccess.success) return currentAccess
  }

  expenses[index] = normalizeExpense({
    ...expenses[index],
    ...merged,
  })
  saveExpenses(expenses)
  return { success: true, expense: expenses[index] }
}

export function deleteExpense(id) {
  const expenses = loadExpenses()
  const current = expenses.find((exp) => exp.id === id)
  if (!current) {
    return denyAccess('Không tìm thấy khoản chi.')
  }

  const access = assertExpenseWriteAccess(current)
  if (!access.success) return access

  const next = expenses.filter((exp) => exp.id !== id)
  saveExpenses(next)
  return { success: true, expenses: next }
}

export function filterExpenses(expenses, { fromDate, toDate, branchId } = {}) {
  return expenses.filter((exp) => {
    if (fromDate && exp.date < fromDate) return false
    if (toDate && exp.date > toDate) return false
    if (branchId && exp.branchId !== branchId) return false
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
