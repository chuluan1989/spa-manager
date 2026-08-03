import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'service_change_logs'

function createLogId() {
  return `svclog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function insertServiceChangeLog(entry) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể ghi nhật ký dịch vụ.')
  }

  const reason = String(entry.changeReason ?? entry.reason ?? '').trim()
  const base = {
    id: entry.id ?? createLogId(),
    branchId: entry.branchId ?? '',
    serviceId: entry.serviceId ?? '',
    durationId: entry.durationId ?? '',
    action: entry.action ?? 'update',
    oldValues: entry.oldValues ?? {},
    newValues: {
      ...(entry.newValues ?? {}),
      ...(reason ? { reason, note: reason } : {}),
    },
    changedBy: entry.changedBy ?? '',
    changedByName: entry.changedByName ?? '',
    createdAt: entry.createdAt ?? new Date().toISOString(),
  }

  const withReason = objectToSnakeRow({ ...base, changeReason: reason })
  let { error } = await supabase.from(TABLE).insert(withReason)

  // Schema chưa có change_reason: fallback — lý do vẫn nằm trong new_values.
  if (error && /change_reason/i.test(error.message || '')) {
    const fallback = objectToSnakeRow(base)
    const retry = await supabase.from(TABLE).insert(fallback)
    error = retry.error
  }

  if (error) throw error
  return withReason.id
}

export async function fetchServiceChangeLogs({
  branchId = '',
  durationId = '',
  serviceId = '',
  limit = 100,
} = {}) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể tải nhật ký dịch vụ.')
  }

  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (branchId) query = query.eq('branch_id', branchId)
  if (durationId) query = query.eq('duration_id', durationId)
  if (serviceId) query = query.eq('service_id', serviceId)

  const { data, error } = await query
  if (error) throw error
  return rowsToCamel(data ?? [])
}

export async function fetchLatestServiceChangeMeta(branchId, durationId) {
  const logs = await fetchServiceChangeLogs({ branchId, durationId, limit: 1 })
  if (!logs.length) return null
  const latest = logs[0]
  return {
    updatedAt: latest.createdAt ?? '',
    updatedBy: latest.changedByName || latest.changedBy || '—',
  }
}
