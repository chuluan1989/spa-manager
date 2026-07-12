import {
  DEFAULT_VARIABLE_EXPENSE_TYPES,
  FIXED_EXPENSE_TYPE_ID,
  getExpenseTypeLabel,
} from '../constants/expenseTypes'
import {
  getCurrentUserName,
  getCurrentUserRole,
  isAdmin,
} from '../constants/auth'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  deleteExpenseCategoryRow,
  fetchExpenseCategories,
  upsertExpenseCategory,
} from '../repositories/expenseCategoriesRepository'
import { insertExpenseChangeLog } from '../repositories/expenseChangeLogsRepository'
import { notifyDataSynced } from './dataSyncEvents'

function createId(prefix = 'cat') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function slugifyLabel(label) {
  return String(label ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `nhom-${Date.now()}`
}

export function buildDefaultExpenseCategories() {
  return [
    {
      id: FIXED_EXPENSE_TYPE_ID,
      label: getExpenseTypeLabel(FIXED_EXPENSE_TYPE_ID),
      sortOrder: 1,
      isSystem: true,
      isFixed: true,
    },
    ...DEFAULT_VARIABLE_EXPENSE_TYPES.map((item, index) => ({
      id: item.id,
      label: item.label,
      sortOrder: (index + 1) * 10,
      isSystem: true,
      isFixed: false,
    })),
  ]
}

export function normalizeExpenseCategory(row) {
  return {
    id: row.id,
    label: row.label ?? '',
    sortOrder: Number(row.sortOrder ?? 0),
    isSystem: Boolean(row.isSystem),
    isFixed: Boolean(row.isFixed),
    createdAt: row.createdAt ?? '',
    updatedAt: row.updatedAt ?? '',
  }
}

export async function loadExpenseCategories() {
  if (!isSupabaseConfigured) {
    return buildDefaultExpenseCategories()
  }
  try {
    const rows = await fetchExpenseCategories()
    if (!rows || rows.length === 0) {
      const defaults = buildDefaultExpenseCategories()
      await Promise.all(defaults.map((row) => upsertExpenseCategory(row)))
      return defaults
    }
    return rows.map(normalizeExpenseCategory)
  } catch {
    return buildDefaultExpenseCategories()
  }
}

export async function addExpenseCategory(label) {
  if (!isAdmin()) {
    return { success: false, error: 'Chỉ Admin được thêm nhóm chi phí.' }
  }
  const trimmed = String(label ?? '').trim()
  if (!trimmed) {
    return { success: false, error: 'Tên nhóm chi phí không được trống.' }
  }

  const existing = await loadExpenseCategories()
  if (existing.some((item) => item.label.toLowerCase() === trimmed.toLowerCase())) {
    return { success: false, error: 'Nhóm chi phí đã tồn tại.' }
  }

  const category = {
    id: createId(slugifyLabel(trimmed)),
    label: trimmed,
    sortOrder: (existing.reduce((max, item) => Math.max(max, item.sortOrder), 0) || 0) + 10,
    isSystem: false,
    isFixed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  try {
    await upsertExpenseCategory(category)
    await insertExpenseChangeLog({
      id: createId('ecl'),
      entityType: 'category',
      entityId: category.id,
      branchId: '',
      action: 'create',
      changedBy: getCurrentUserName(),
      changedByRole: getCurrentUserRole() ?? '',
      oldValues: {},
      newValues: { label: category.label },
    })
    notifyDataSynced('expense_categories')
    return { success: true, data: category }
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể thêm nhóm chi phí.' }
  }
}

export async function renameExpenseCategory(id, label) {
  if (!isAdmin()) {
    return { success: false, error: 'Chỉ Admin được sửa nhóm chi phí.' }
  }
  const trimmed = String(label ?? '').trim()
  if (!trimmed) {
    return { success: false, error: 'Tên nhóm chi phí không được trống.' }
  }

  const existing = await loadExpenseCategories()
  const current = existing.find((item) => item.id === id)
  if (!current) {
    return { success: false, error: 'Không tìm thấy nhóm chi phí.' }
  }
  if (current.isFixed) {
    return { success: false, error: 'Không thể đổi tên nhóm chi phí cố định.' }
  }

  const updated = {
    ...current,
    label: trimmed,
    updatedAt: new Date().toISOString(),
  }

  try {
    await upsertExpenseCategory(updated)
    await insertExpenseChangeLog({
      id: createId('ecl'),
      entityType: 'category',
      entityId: id,
      branchId: '',
      action: 'update',
      changedBy: getCurrentUserName(),
      changedByRole: getCurrentUserRole() ?? '',
      oldValues: { label: current.label },
      newValues: { label: trimmed },
    })
    notifyDataSynced('expense_categories')
    return { success: true, data: updated }
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể sửa nhóm chi phí.' }
  }
}

export async function removeExpenseCategory(id) {
  if (!isAdmin()) {
    return { success: false, error: 'Chỉ Admin được xóa nhóm chi phí.' }
  }
  const existing = await loadExpenseCategories()
  const current = existing.find((item) => item.id === id)
  if (!current) {
    return { success: false, error: 'Không tìm thấy nhóm chi phí.' }
  }
  if (current.isFixed) {
    return { success: false, error: 'Không thể xóa nhóm chi phí cố định.' }
  }
  if (current.isSystem) {
    return { success: false, error: 'Không thể xóa nhóm chi phí hệ thống mặc định.' }
  }

  try {
    await deleteExpenseCategoryRow(id)
    await insertExpenseChangeLog({
      id: createId('ecl'),
      entityType: 'category',
      entityId: id,
      branchId: '',
      action: 'delete',
      changedBy: getCurrentUserName(),
      changedByRole: getCurrentUserRole() ?? '',
      oldValues: { label: current.label },
      newValues: {},
    })
    notifyDataSynced('expense_categories')
    return { success: true }
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể xóa nhóm chi phí.' }
  }
}
