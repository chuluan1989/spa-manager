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

function sortExpensesDesc(rows) {
  return [...rows].sort((a, b) => {
    const dateCmp = (b.date ?? '').localeCompare(a.date ?? '')
    if (dateCmp !== 0) return dateCmp
    const timeCmp = (b.expenseTime ?? '').localeCompare(a.expenseTime ?? '')
    if (timeCmp !== 0) return timeCmp
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  })
}

export async function fetchExpensesFiltered({
  fromDate = '',
  toDate = '',
  branchId = '',
  expenseType = '',
} = {}) {
  if (!isSupabaseConfigured) return null

  let query = supabase
    .from(TABLE)
    .select('*')
    .order('date', { ascending: false })
    .order('updated_at', { ascending: false })

  if (fromDate) query = query.gte('date', fromDate)
  if (toDate) query = query.lte('date', toDate)
  if (branchId) query = query.eq('branch_id', branchId)
  if (expenseType) query = query.eq('expense_type', expenseType)

  const { data, error } = await query
  if (error) throw error
  return sortExpensesDesc(rowsToCamel(data ?? []))
}

export async function fetchExpenses() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('date', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw error
  return sortExpensesDesc(rowsToCamel(data ?? []))
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
