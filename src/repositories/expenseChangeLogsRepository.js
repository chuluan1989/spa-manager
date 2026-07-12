import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'expense_change_logs'

export async function insertExpenseChangeLog(entry) {
  if (!isSupabaseConfigured || !entry?.id) return
  const row = objectToSnakeRow({
    id: entry.id,
    entityType: entry.entityType ?? '',
    entityId: entry.entityId ?? '',
    branchId: entry.branchId ?? '',
    action: entry.action ?? 'update',
    changedBy: entry.changedBy ?? '',
    changedByRole: entry.changedByRole ?? '',
    oldValues: entry.oldValues ?? {},
    newValues: entry.newValues ?? {},
    changedAt: entry.changedAt ?? new Date().toISOString(),
  })
  const { error } = await supabase.from(TABLE).insert(row)
  if (error) throw error
}

export async function fetchExpenseChangeLogs({
  entityType = '',
  entityId = '',
  branchId = '',
  limit = 200,
} = {}) {
  if (!isSupabaseConfigured) return null
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(limit)
  if (entityType) query = query.eq('entity_type', entityType)
  if (entityId) query = query.eq('entity_id', entityId)
  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  if (error) throw error
  return rowsToCamel(data ?? [])
}
