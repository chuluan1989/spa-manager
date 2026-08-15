import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'
import { isMissingSchemaTableError } from './payrollRepository'

const TABLE = 'work_tasks'

export async function upsertWorkTaskRow(record) {
  if (!isSupabaseConfigured) return null
  const now = new Date().toISOString()
  const payload = {
    ...record,
    updatedAt: now,
    createdAt: record.createdAt ?? now,
  }
  const row = objectToSnakeRow(payload)
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'request_type,request_id' })
    .select('*')
    .single()
  if (error) {
    if (isMissingSchemaTableError(error)) {
      console.warn('[work_tasks] missing table — chạy migration 0040')
      return null
    }
    // Fallback: some projects use id conflict only
    if (error.code === '42P10' || /on conflict/i.test(error.message || '')) {
      const { data: byId, error: err2 } = await supabase
        .from(TABLE)
        .upsert(row, { onConflict: 'id' })
        .select('*')
        .single()
      if (err2) {
        if (isMissingSchemaTableError(err2)) return null
        throw err2
      }
      return rowsToCamel([byId])[0]
    }
    throw error
  }
  return data ? rowsToCamel([data])[0] : null
}

export async function fetchWorkTaskByRequest(requestType, requestId) {
  if (!isSupabaseConfigured || !requestType || !requestId) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('request_type', requestType)
    .eq('request_id', requestId)
    .maybeSingle()
  if (error) {
    if (isMissingSchemaTableError(error)) return null
    throw error
  }
  return data ? rowsToCamel([data])[0] : null
}

export async function fetchPendingWorkTasks({ branchId = '' } = {}) {
  if (!isSupabaseConfigured) return []
  let query = supabase
    .from(TABLE)
    .select('*')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false })
  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  if (error) {
    if (isMissingSchemaTableError(error)) return []
    throw error
  }
  return rowsToCamel(data ?? [])
}
