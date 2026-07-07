import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'employee_audit_logs'

export async function insertEmployeeAuditLog(entry) {
  if (!isSupabaseConfigured || !entry?.id) return
  const row = objectToSnakeRow({
    id: entry.id,
    employeeId: entry.employeeId ?? '',
    employeeName: entry.employeeName ?? '',
    action: entry.action ?? '',
    details: entry.details ?? '',
    meta: entry.meta ?? {},
    actorName: entry.actorName ?? '',
    actorRole: entry.actorRole ?? '',
    createdAt: entry.createdAt ?? new Date().toISOString(),
  })
  const { error } = await supabase.from(TABLE).insert(row)
  if (error) throw error
}

export async function fetchEmployeeAuditLogs({ employeeId = '', limit = 500 } = {}) {
  if (!isSupabaseConfigured) return null
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (employeeId) query = query.eq('employee_id', employeeId)
  const { data, error } = await query
  if (error) throw error
  return rowsToCamel(data ?? [])
}
