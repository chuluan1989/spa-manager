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
    isHidden: Boolean(row.isHidden),
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
    return { success: false, error: 'Không thể xóa nhóm chi phí hệ thống mặc định. Hãy ẩn nhóm nếu không dùng.' }
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

/** Ẩn/hiện nhóm — nhóm hệ thống không xóa được nhưng được ẩn. */
export async function setExpenseCategoryHidden(id, isHidden) {
  if (!isAdmin()) {
    return { success: false, error: 'Chỉ Admin được ẩn/hiện nhóm chi phí.' }
  }
  const existing = await loadExpenseCategories()
  const current = existing.find((item) => item.id === id)
  if (!current) {
    return { success: false, error: 'Không tìm thấy nhóm chi phí.' }
  }
  if (current.isFixed) {
    return { success: false, error: 'Không thể ẩn nhóm chi phí cố định.' }
  }
  const updated = {
    ...current,
    isHidden: Boolean(isHidden),
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
      oldValues: { isHidden: current.isHidden },
      newValues: { isHidden: updated.isHidden, label: current.label },
    })
    notifyDataSynced('expense_categories')
    return { success: true, data: updated }
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể cập nhật trạng thái nhóm.' }
  }
}

/** Đổi thứ tự nhóm (±1 trong danh sách phát sinh). */
export async function moveExpenseCategory(id, direction) {
  if (!isAdmin()) {
    return { success: false, error: 'Chỉ Admin được sắp xếp nhóm chi phí.' }
  }
  const existing = await loadExpenseCategories()
  const variable = existing
    .filter((item) => !item.isFixed)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const index = variable.findIndex((item) => item.id === id)
  if (index < 0) {
    return { success: false, error: 'Không tìm thấy nhóm chi phí.' }
  }
  const swapWith = direction < 0 ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= variable.length) {
    return { success: true, data: existing }
  }

  const a = variable[index]
  const b = variable[swapWith]
  const nextA = { ...a, sortOrder: b.sortOrder, updatedAt: new Date().toISOString() }
  const nextB = { ...b, sortOrder: a.sortOrder, updatedAt: new Date().toISOString() }

  try {
    await upsertExpenseCategory(nextA)
    await upsertExpenseCategory(nextB)
    await insertExpenseChangeLog({
      id: createId('ecl'),
      entityType: 'category',
      entityId: id,
      branchId: '',
      action: 'update',
      changedBy: getCurrentUserName(),
      changedByRole: getCurrentUserRole() ?? '',
      oldValues: { sortOrder: a.sortOrder, label: a.label },
      newValues: { sortOrder: nextA.sortOrder, label: a.label },
    })
    notifyDataSynced('expense_categories')
    return { success: true }
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể sắp xếp nhóm chi phí.' }
  }
}
