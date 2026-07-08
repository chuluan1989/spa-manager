import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const ADJUSTMENTS_TABLE = 'payroll_adjustments'
const LOCKS_TABLE = 'payroll_locks'
const AUDIT_TABLE = 'payroll_audit_logs'

export function isMissingSchemaTableError(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  const message = String(error.message ?? '')
  return (
    code === 'PGRST205'
    || /could not find the table/i.test(message)
    || /relation .* does not exist/i.test(message)
  )
}

async function fetchPayrollTableRows(table, buildQuery) {
  if (!isSupabaseConfigured) return []
  const { data, error } = await buildQuery(supabase.from(table))
  if (error) {
    if (isMissingSchemaTableError(error)) return []
    throw error
  }
  return rowsToCamel(data ?? [])
}

export async function fetchPayrollAdjustments({ month = '', branchId = '', employeeId = '' } = {}) {
  return fetchPayrollTableRows(ADJUSTMENTS_TABLE, (query) => {
    let next = query
      .select('*')
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
    if (month) next = next.eq('month', month)
    if (branchId) next = next.eq('branch_id', branchId)
    if (employeeId) next = next.eq('employee_id', employeeId)
    return next
  })
}

export async function insertPayrollAdjustment(record) {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa cấu hình.')
  const row = objectToSnakeRow({
    ...record,
    createdAt: record.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  const { data, error } = await supabase.from(ADJUSTMENTS_TABLE).insert(row).select('*').single()
  if (error) throw error
  return rowsToCamel([data])[0]
}

export async function updatePayrollAdjustment(record) {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa cấu hình.')
  const row = objectToSnakeRow({ ...record, updatedAt: new Date().toISOString() })
  const { data, error } = await supabase.from(ADJUSTMENTS_TABLE).update(row).eq('id', record.id).select('*').single()
  if (error) throw error
  return rowsToCamel([data])[0]
}

export async function deletePayrollAdjustment(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa cấu hình.')
  const { error } = await supabase.from(ADJUSTMENTS_TABLE).delete().eq('id', id)
  if (error) throw error
}

export async function fetchPayrollLocks({ month = '' } = {}) {
  return fetchPayrollTableRows(LOCKS_TABLE, (query) => {
    let next = query.select('*').order('locked_at', { ascending: false })
    if (month) next = next.eq('month', month)
    return next
  })
}

export async function upsertPayrollLock(record) {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa cấu hình.')
  const row = objectToSnakeRow(record)
  const { data, error } = await supabase.from(LOCKS_TABLE).upsert(row, { onConflict: 'id' }).select('*').single()
  if (error) throw error
  return rowsToCamel([data])[0]
}

export async function fetchPayrollAuditLogs({ limit = 200, entityType = '', entityId = '' } = {}) {
  return fetchPayrollTableRows(AUDIT_TABLE, (query) => {
    let next = query.select('*').order('created_at', { ascending: false }).limit(limit)
    if (entityType) next = next.eq('entity_type', entityType)
    if (entityId) next = next.eq('entity_id', entityId)
    return next
  })
}

export async function insertPayrollAuditLog(log) {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa cấu hình.')
  const row = objectToSnakeRow({ ...log, createdAt: log.createdAt ?? new Date().toISOString() })
  const { data, error } = await supabase.from(AUDIT_TABLE).insert(row).select('*').single()
  if (error) throw error
  return rowsToCamel([data])[0]
}

export function subscribePayrollChanges(onChange) {
  if (!isSupabaseConfigured || typeof onChange !== 'function') return () => {}
  const channel = supabase
    .channel('spa-payroll-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: ADJUSTMENTS_TABLE }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: LOCKS_TABLE }, () => onChange())
    .subscribe()
  return () => supabase.removeChannel(channel)
}

export function createPayrollAdjustmentId() {
  return `payadj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createPayrollAuditId() {
  return `payaudit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createPayrollLockId(month, branchId = '') {
  return `paylock-${month}-${branchId || 'all'}`
}
