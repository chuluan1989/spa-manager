import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'branch_fixed_costs'

export async function fetchBranchFixedCosts({ branchId = '' } = {}) {
  if (!isSupabaseConfigured) return null
  let query = supabase.from(TABLE).select('*').order('branch_id', { ascending: true })
  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  if (error) throw error
  return rowsToCamel(data ?? [])
}

export async function upsertBranchFixedCost(row) {
  if (!isSupabaseConfigured || !row?.id) return
  const dbRow = objectToSnakeRow({
    id: row.id,
    branchId: row.branchId,
    expenseType: row.expenseType ?? 'mat-bang',
    expenseTypeLabel: row.expenseTypeLabel ?? 'Mặt bằng',
    amount: Number(row.amount ?? 0),
    updatedBy: row.updatedBy ?? '',
    updatedAt: row.updatedAt ?? new Date().toISOString(),
  })
  const { error } = await supabase.from(TABLE).upsert(dbRow, { onConflict: 'id' })
  if (error) throw error
}

export async function upsertBranchFixedCosts(rows) {
  if (!isSupabaseConfigured || !Array.isArray(rows) || rows.length === 0) return
  for (const row of rows) {
    await upsertBranchFixedCost(row)
  }
}
