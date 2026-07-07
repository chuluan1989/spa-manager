import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'expenses'

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
    .order('expense_time', { ascending: false })

  if (fromDate) query = query.gte('date', fromDate)
  if (toDate) query = query.lte('date', toDate)
  if (branchId) query = query.eq('branch_id', branchId)
  if (expenseType) query = query.eq('expense_type', expenseType)

  const { data, error } = await query
  if (error) throw error
  return rowsToCamel(data ?? [])
}

export async function fetchExpenses() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from(TABLE).select('*')
  if (error) throw error
  return rowsToCamel(data)
}

export async function upsertExpense(expense) {
  if (!isSupabaseConfigured || !expense?.id) return
  const row = objectToSnakeRow({ ...expense, updatedAt: new Date().toISOString() })
  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'id' })
  if (error) throw error
}

export async function upsertExpenses(expenses) {
  if (!isSupabaseConfigured || !Array.isArray(expenses) || expenses.length === 0) return
  const rows = expenses.map((expense) =>
    objectToSnakeRow({ ...expense, updatedAt: new Date().toISOString() }),
  )
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteExpenseRow(id) {
  if (!isSupabaseConfigured || !id) return
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
