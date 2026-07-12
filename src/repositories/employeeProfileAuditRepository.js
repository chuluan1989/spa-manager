import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'employee_profile_audit_logs'

export async function insertEmployeeProfileAuditLog(entry) {
  if (!isSupabaseConfigured || !entry?.id) return
  const row = objectToSnakeRow({
    id: entry.id,
    employeeId: entry.employeeId ?? '',
    changedBy: entry.changedBy ?? '',
    changedByRole: entry.changedByRole ?? '',
    changedFields: entry.changedFields ?? [],
    oldValues: entry.oldValues ?? {},
    newValues: entry.newValues ?? {},
    changedAt: entry.changedAt ?? new Date().toISOString(),
    sourceDevice: entry.sourceDevice ?? '',
  })
  const { error } = await supabase.from(TABLE).insert(row)
  if (error) throw error
}

export async function fetchEmployeeProfileAuditLogs({ employeeId = '', limit = 200 } = {}) {
  if (!isSupabaseConfigured) return null
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(limit)
  if (employeeId) query = query.eq('employee_id', employeeId)
  const { data, error } = await query
  if (error) throw error
  return rowsToCamel(data ?? [])
}
