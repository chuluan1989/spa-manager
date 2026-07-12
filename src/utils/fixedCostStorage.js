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
