import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { rowsToCamel } from './caseUtils'
import {
  expenseToDbRow,
  isMissingColumnError,
} from './expenseSchema'

const TABLE = 'expenses'

/** Cột extended có thể thiếu trên DB cũ — KHÔNG gồm status/void_* (migration 0045 bắt buộc). */
const OPTIONAL_LEGACY_COLUMNS = [
  'expense_time',
  'paid_by',
  'receipt_image',
  'entered_by_id',
  'employee_id',
  'payroll_adjustment_id',
  'payroll_month',
  'payroll_cycle',
]

/** List/sync — không kéo receipt_image (blob). */
export const EXPENSE_LIST_COLUMNS = [
  'id',
  'date',
  'branch_id',
  'branch_name',
  'expense_type',
  'expense_type_label',
  'content',
  'amount',
  'entered_by',
  'note',
  'updated_at',
  'expense_time',
  'paid_by',
  'entered_by_id',
  'employee_id',
  'payroll_adjustment_id',
  'payroll_month',
  'payroll_cycle',
  'status',
  'voided_at',
  'voided_by',
  'void_reason',
].join(',')

export const EXPENSE_SCOPE_REQUIRED_MESSAGE =
  'Cần phạm vi ngày hoặc chi nhánh khi tải chi phí.'

export function hasExpenseFetchScope(filters = {}) {
  return Boolean(filters.fromDate || filters.toDate || filters.branchId || filters.expenseType)
}

/** Bỏ đúng 1 cột khỏi SELECT list — dùng khi Production thiếu cột optional. */
export function stripExpenseSelectColumn(selectColumns, column) {
  const drop = String(column || '').trim()
  if (!drop) return selectColumns
  return String(selectColumns || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && part !== drop)
    .join(',')
}

function findMissingOptionalExpenseColumn(error, alreadyStripped = new Set()) {
  return OPTIONAL_LEGACY_COLUMNS.find(
    (col) => !alreadyStripped.has(col) && isMissingColumnError(error, col),
  ) ?? null
}

/**
 * SELECT với retry: Production có thể thiếu expense_time / paid_by / entered_by_id.
 * Lọc ngày luôn dùng cột `date` (cột thật trên Production).
 */
export async function fetchExpenseRowsWithOptionalColumnRetry(buildQuery, selectColumns = EXPENSE_LIST_COLUMNS) {
  let select = selectColumns
  const stripped = new Set()
  const maxAttempts = OPTIONAL_LEGACY_COLUMNS.length + 1

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await buildQuery(select)
    if (!error) return data ?? []

    const missing = findMissingOptionalExpenseColumn(error, stripped)
    if (!missing) throw error
    stripped.add(missing)
    select = stripExpenseSelectColumn(select, missing)
    if (!select) throw error
  }

  throw new Error('Expense fetch: quá nhiều cột optional bị thiếu.')
}

function sortExpensesDesc(rows) {
  return [...rows].sort((a, b) => {
    const dateCmp = (b.date ?? '').localeCompare(a.date ?? '')
    if (dateCmp !== 0) return dateCmp
    const timeCmp = (b.expenseTime ?? '').localeCompare(a.expenseTime ?? '')
    if (timeCmp !== 0) return timeCmp
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  })
}

function buildScopedExpenseQuery(selectColumns, { fromDate, toDate, branchId, expenseType }) {
  let query = supabase
    .from(TABLE)
    .select(selectColumns)
    .order('date', { ascending: false })
    .order('updated_at', { ascending: false })

  if (fromDate) query = query.gte('date', fromDate)
  if (toDate) query = query.lte('date', toDate)
  if (branchId) query = query.eq('branch_id', branchId)
  if (expenseType) query = query.eq('expense_type', expenseType)
  return query
}

export async function fetchExpensesFiltered({
  fromDate = '',
  toDate = '',
  branchId = '',
  expenseType = '',
} = {}) {
  if (!isSupabaseConfigured) return null
  if (!hasExpenseFetchScope({ fromDate, toDate, branchId, expenseType })) {
    throw new Error(EXPENSE_SCOPE_REQUIRED_MESSAGE)
  }

  const rows = await fetchExpenseRowsWithOptionalColumnRetry(
    (selectColumns) => buildScopedExpenseQuery(selectColumns, {
      fromDate, toDate, branchId, expenseType,
    }),
  )
  return sortExpensesDesc(rowsToCamel(rows))
}

/** Recovery / migrate / verify only — UI list không được gọi. */
export async function fetchExpenses() {
  if (!isSupabaseConfigured) return null
  const rows = await fetchExpenseRowsWithOptionalColumnRetry((selectColumns) => (
    supabase
      .from(TABLE)
      .select(selectColumns)
      .order('date', { ascending: false })
      .order('updated_at', { ascending: false })
  ))
  return sortExpensesDesc(rowsToCamel(rows))
}

export async function fetchExpenseReceiptImage(id) {
  if (!isSupabaseConfigured || !id) return ''
  const { data, error } = await supabase
    .from(TABLE)
    .select('receipt_image')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if (isMissingColumnError(error, 'receipt_image')) return ''
    throw error
  }
  return data?.receipt_image ?? ''
}

async function upsertExpenseRow(row) {
  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'id' })
  if (error) throw error
}

export async function upsertExpense(expense) {
  if (!isSupabaseConfigured || !expense?.id) return

  const row = expenseToDbRow(expense, { includeExtended: true })
  for (let attempt = 0; attempt < OPTIONAL_LEGACY_COLUMNS.length + 1; attempt += 1) {
    try {
      await upsertExpenseRow(row)
      return
    } catch (error) {
      const missing = OPTIONAL_LEGACY_COLUMNS.find((col) => isMissingColumnError(error, col) && col in row)
      if (!missing) throw error
      delete row[missing]
    }
  }
}

export async function upsertExpenses(expenses) {
  if (!isSupabaseConfigured || !Array.isArray(expenses) || expenses.length === 0) return
  for (const expense of expenses) {
    await upsertExpense(expense)
  }
}

export async function deleteExpenseRow(id) {
  if (!isSupabaseConfigured || !id) return
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
