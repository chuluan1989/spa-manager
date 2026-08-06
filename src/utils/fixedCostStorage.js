import {
  DEFAULT_BRANCH_FIXED_RENT,
  FIXED_EXPENSE_TYPE_ID,
  getExpenseTypeLabel,
} from '../constants/expenseTypes'
import { getCanonicalBranchName } from '../constants/canonicalBranches'
import {
  getCurrentUserName,
  getCurrentUserRole,
  isAdmin,
} from '../constants/auth'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  fetchBranchFixedCosts,
  upsertBranchFixedCost,
} from '../repositories/fixedCostsRepository'
import { insertExpenseChangeLog } from '../repositories/expenseChangeLogsRepository'
import { notifyDataSynced } from './dataSyncEvents'

function createId(prefix = 'fc') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function buildDefaultFixedCosts() {
  return Object.entries(DEFAULT_BRANCH_FIXED_RENT).map(([branchId, amount]) => ({
    id: `fc-${branchId}-${FIXED_EXPENSE_TYPE_ID}`,
    branchId,
    branchName: getCanonicalBranchName(branchId),
    expenseType: FIXED_EXPENSE_TYPE_ID,
    expenseTypeLabel: getExpenseTypeLabel(FIXED_EXPENSE_TYPE_ID),
    amount,
    updatedBy: 'system',
    updatedAt: '',
  }))
}

export function normalizeFixedCost(row) {
  const branchId = row.branchId ?? ''
  return {
    id: row.id || `fc-${branchId}-${FIXED_EXPENSE_TYPE_ID}`,
    branchId,
    branchName: row.branchName || getCanonicalBranchName(branchId),
    expenseType: row.expenseType || FIXED_EXPENSE_TYPE_ID,
    expenseTypeLabel: row.expenseTypeLabel || getExpenseTypeLabel(row.expenseType || FIXED_EXPENSE_TYPE_ID),
    amount: Number(row.amount ?? 0),
    status: row.status === 'paused' ? 'paused' : 'active',
    startDate: row.startDate ?? '',
    updatedBy: row.updatedBy ?? '',
    updatedAt: row.updatedAt ?? '',
  }
}

/**
 * Đếm số tháng lịch trong khoảng [fromDate, toDate] (YYYY-MM-DD).
 * Mỗi tháng chỉ tính 1 lần tiền thuê (không chia tỷ lệ ngày).
 */
export function countMonthsInDateRange(fromDate = '', toDate = '') {
  if (!fromDate && !toDate) return 1
  const start = fromDate || toDate
  const end = toDate || fromDate
  if (!start || !end) return 1

  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  if (!sy || !sm || !ey || !em) return 1

  const months = (ey - sy) * 12 + (em - sm) + 1
  return Math.max(1, months)
}

/**
 * Tổng chi phí cố định theo kỳ + Map theo branchId.
 * fixedCosts = settings (số tiền/tháng); nhân với số tháng trong kỳ.
 */
export function computeFixedCostTotals(fixedCosts = [], { fromDate = '', toDate = '', branchId = '' } = {}) {
  const monthCount = countMonthsInDateRange(fromDate, toDate)
  const byBranch = new Map()
  let total = 0

  for (const row of fixedCosts) {
    if (branchId && row.branchId !== branchId) continue
    if (row.status === 'paused') continue
    const amount = Number(row.amount ?? 0) * monthCount
    if (!row.branchId) continue
    byBranch.set(row.branchId, (byBranch.get(row.branchId) ?? 0) + amount)
    total += amount
  }

  return { total, byBranch, monthCount }
}

export async function loadBranchFixedCosts({ branchId = '' } = {}) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể tải chi phí cố định.')
  }
  const rows = await fetchBranchFixedCosts({ branchId })
  const normalized = (rows ?? []).map(normalizeFixedCost)

  if (normalized.length === 0 && !branchId) {
    const defaults = buildDefaultFixedCosts()
    await Promise.all(defaults.map((row) => upsertBranchFixedCost(row)))
    return defaults
  }

  // Bổ sung chi nhánh còn thiếu trong seed mặc định
  if (!branchId) {
    const existing = new Set(normalized.map((row) => `${row.branchId}:${row.expenseType}`))
    const missing = buildDefaultFixedCosts().filter(
      (row) => !existing.has(`${row.branchId}:${row.expenseType}`),
    )
    if (missing.length > 0) {
      await Promise.all(missing.map((row) => upsertBranchFixedCost(row)))
      return [...normalized, ...missing].sort((a, b) => a.branchName.localeCompare(b.branchName, 'vi'))
    }
  }

  return normalized.sort((a, b) => a.branchName.localeCompare(b.branchName, 'vi'))
}

export async function updateBranchFixedCostAmount(id, amount, { branchId = '' } = {}) {
  if (!isAdmin()) {
    return { success: false, error: 'Chỉ Admin được sửa chi phí cố định.' }
  }
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase chưa cấu hình.' }
  }

  const all = await loadBranchFixedCosts({ branchId: '' })
  const current = all.find((row) => row.id === id)
  if (!current) {
    return { success: false, error: 'Không tìm thấy chi phí cố định.' }
  }
  if (branchId && current.branchId !== branchId) {
    return { success: false, error: 'Chi nhánh không hợp lệ.' }
  }

  const nextAmount = Number(amount)
  if (!Number.isFinite(nextAmount) || nextAmount < 0) {
    return { success: false, error: 'Số tiền không hợp lệ.' }
  }

  const updated = {
    ...current,
    amount: nextAmount,
    updatedBy: getCurrentUserName(),
    updatedAt: new Date().toISOString(),
  }

  try {
    await upsertBranchFixedCost(updated)
    await insertExpenseChangeLog({
      id: createId('ecl'),
      entityType: 'fixed_cost',
      entityId: updated.id,
      branchId: updated.branchId,
      action: 'update',
      changedBy: getCurrentUserName(),
      changedByRole: getCurrentUserRole() ?? '',
      oldValues: { amount: current.amount, expenseType: current.expenseType },
      newValues: { amount: updated.amount, expenseType: updated.expenseType },
    })
    notifyDataSynced('fixed_costs')
    return { success: true, data: updated }
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể cập nhật chi phí cố định.' }
  }
}

export async function setBranchFixedCostStatus(id, status) {
  if (!isAdmin()) {
    return { success: false, error: 'Chỉ Admin được tạm ngưng / kích hoạt chi phí cố định.' }
  }
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase chưa cấu hình.' }
  }
  const all = await loadBranchFixedCosts({ branchId: '' })
  const current = all.find((row) => row.id === id)
  if (!current) {
    return { success: false, error: 'Không tìm thấy chi phí cố định.' }
  }
  const nextStatus = status === 'paused' ? 'paused' : 'active'
  const updated = {
    ...current,
    status: nextStatus,
    updatedBy: getCurrentUserName(),
    updatedAt: new Date().toISOString(),
  }
  try {
    await upsertBranchFixedCost(updated)
    await insertExpenseChangeLog({
      id: createId('ecl'),
      entityType: 'fixed_cost',
      entityId: updated.id,
      branchId: updated.branchId,
      action: 'update',
      changedBy: getCurrentUserName(),
      changedByRole: getCurrentUserRole() ?? '',
      oldValues: { status: current.status || 'active', amount: current.amount },
      newValues: { status: nextStatus, amount: updated.amount },
    })
    notifyDataSynced('fixed_costs')
    return { success: true, data: updated }
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể cập nhật trạng thái (cần migration 0045).' }
  }
}

export async function updateBranchFixedCostFields(id, { amount, startDate, expenseTypeLabel } = {}) {
  if (!isAdmin()) {
    return { success: false, error: 'Chỉ Admin được sửa chi phí cố định.' }
  }
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase chưa cấu hình.' }
  }
  const all = await loadBranchFixedCosts({ branchId: '' })
  const current = all.find((row) => row.id === id)
  if (!current) {
    return { success: false, error: 'Không tìm thấy chi phí cố định.' }
  }

  const nextAmount = amount == null ? current.amount : Number(amount)
  if (!Number.isFinite(nextAmount) || nextAmount < 0) {
    return { success: false, error: 'Số tiền không hợp lệ.' }
  }

  const updated = {
    ...current,
    amount: nextAmount,
    startDate: startDate == null ? current.startDate : String(startDate || ''),
    expenseTypeLabel: expenseTypeLabel?.trim() || current.expenseTypeLabel,
    updatedBy: getCurrentUserName(),
    updatedAt: new Date().toISOString(),
  }

  try {
    await upsertBranchFixedCost(updated)
    await insertExpenseChangeLog({
      id: createId('ecl'),
      entityType: 'fixed_cost',
      entityId: updated.id,
      branchId: updated.branchId,
      action: 'update',
      changedBy: getCurrentUserName(),
      changedByRole: getCurrentUserRole() ?? '',
      oldValues: {
        amount: current.amount,
        startDate: current.startDate || '',
        expenseTypeLabel: current.expenseTypeLabel,
      },
      newValues: {
        amount: updated.amount,
        startDate: updated.startDate || '',
        expenseTypeLabel: updated.expenseTypeLabel,
      },
    })
    notifyDataSynced('fixed_costs')
    return { success: true, data: updated }
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể cập nhật chi phí cố định.' }
  }
}

export async function addBranchFixedCost({ branchId, expenseTypeLabel, amount, startDate = '' }) {
  if (!isAdmin()) {
    return { success: false, error: 'Chỉ Admin được thêm chi phí cố định.' }
  }
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase chưa cấu hình.' }
  }
  const trimmedBranch = String(branchId ?? '').trim()
  const label = String(expenseTypeLabel ?? '').trim() || 'Chi phí cố định'
  const nextAmount = Number(amount)
  if (!trimmedBranch) {
    return { success: false, error: 'Chọn chi nhánh.' }
  }
  if (!Number.isFinite(nextAmount) || nextAmount < 0) {
    return { success: false, error: 'Số tiền không hợp lệ.' }
  }

  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'fixed'

  const row = normalizeFixedCost({
    id: createId(`fc-${trimmedBranch}-${slug}`),
    branchId: trimmedBranch,
    branchName: getCanonicalBranchName(trimmedBranch),
    expenseType: slug === 'mat-bang' ? FIXED_EXPENSE_TYPE_ID : `fixed-${slug}`,
    expenseTypeLabel: label,
    amount: nextAmount,
    status: 'active',
    startDate: startDate || '',
    updatedBy: getCurrentUserName(),
    updatedAt: new Date().toISOString(),
  })

  try {
    await upsertBranchFixedCost(row)
    await insertExpenseChangeLog({
      id: createId('ecl'),
      entityType: 'fixed_cost',
      entityId: row.id,
      branchId: row.branchId,
      action: 'create',
      changedBy: getCurrentUserName(),
      changedByRole: getCurrentUserRole() ?? '',
      oldValues: {},
      newValues: {
        amount: row.amount,
        expenseTypeLabel: row.expenseTypeLabel,
        startDate: row.startDate || '',
        status: row.status,
      },
    })
    notifyDataSynced('fixed_costs')
    return { success: true, data: row }
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể thêm chi phí cố định.' }
  }
}
