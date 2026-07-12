import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'expense_categories'

export async function fetchExpenseCategories() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return rowsToCamel(data ?? [])
}

export async function upsertExpenseCategory(category) {
  if (!isSupabaseConfigured || !category?.id) return
  const dbRow = objectToSnakeRow({
    id: category.id,
    label: category.label ?? '',
    sortOrder: Number(category.sortOrder ?? 0),
    isSystem: Boolean(category.isSystem),
    isFixed: Boolean(category.isFixed),
    createdAt: category.createdAt ?? new Date().toISOString(),
    updatedAt: category.updatedAt ?? new Date().toISOString(),
  })
  const { error } = await supabase.from(TABLE).upsert(dbRow, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteExpenseCategoryRow(id) {
  if (!isSupabaseConfigured || !id) return
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
