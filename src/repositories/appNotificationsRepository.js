import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'
import { isMissingSchemaTableError } from './payrollRepository'

const TABLE = 'app_notifications'

export async function insertAppNotificationRows(rows = []) {
  if (!isSupabaseConfigured || !rows.length) return []
  const now = new Date().toISOString()
  const payload = rows.map((row) => objectToSnakeRow({
    ...row,
    createdAt: row.createdAt ?? now,
    status: row.status || 'unread',
  }))
  const { data, error } = await supabase.from(TABLE).insert(payload).select('*')
  if (error) {
    if (isMissingSchemaTableError(error)) {
      console.warn('[app_notifications] missing table — chạy migration 0040')
      return []
    }
    throw error
  }
  return rowsToCamel(data ?? [])
}

export async function fetchAppNotificationsForRecipient({
  recipientRole,
  recipientId,
  status = '',
  limit = 40,
} = {}) {
  if (!isSupabaseConfigured || !recipientRole) return []
  let query = supabase
    .from(TABLE)
    .select('*')
    .eq('recipient_role', recipientRole)
    .eq('recipient_id', recipientId || '')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) {
    if (isMissingSchemaTableError(error)) return []
    throw error
  }
  return rowsToCamel(data ?? [])
}

export async function markAppNotificationsRead(ids = []) {
  if (!isSupabaseConfigured || !ids.length) return
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: 'read',
      read_at: new Date().toISOString(),
    })
    .in('id', ids)
  if (error && !isMissingSchemaTableError(error)) throw error
}
