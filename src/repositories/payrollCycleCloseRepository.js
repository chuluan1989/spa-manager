import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'
import { isMissingSchemaTableError } from './payrollRepository'

const TABLE = 'payroll_cycle_closes'
const EVENTS_TABLE = 'payroll_cycle_close_events'

export async function fetchPayrollCycleClose({ employeeId, billingMonth, cycle }) {
  if (!isSupabaseConfigured || !employeeId || !billingMonth || !cycle) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('employee_id', employeeId)
    .eq('billing_month', billingMonth)
    .eq('cycle', cycle)
    .maybeSingle()
  if (error) {
    if (isMissingSchemaTableError(error)) return null
    throw error
  }
  return data ? rowsToCamel([data])[0] : null
}

export async function fetchPayrollCycleClosesFiltered({
  billingMonth = '',
  cycle = '',
  branchId = '',
  employeeId = '',
  status = '',
} = {}) {
  if (!isSupabaseConfigured) return []
  let query = supabase.from(TABLE).select('*').order('updated_at', { ascending: false })
  if (billingMonth) query = query.eq('billing_month', billingMonth)
  if (cycle) query = query.eq('cycle', cycle)
  if (branchId) query = query.eq('branch_id', branchId)
  if (employeeId) query = query.eq('employee_id', employeeId)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) {
    if (isMissingSchemaTableError(error)) return []
    throw error
  }
  return rowsToCamel(data ?? [])
}

export async function upsertPayrollCycleClose(record) {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa cấu hình.')
  const now = new Date().toISOString()
  const payload = { ...record, updatedAt: now, createdAt: record.createdAt ?? now }
  const row = objectToSnakeRow(payload)
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) {
    if (isMissingSchemaTableError(error)) {
      throw new Error(
        'Bảng payroll_cycle_closes chưa có trên Supabase. Cần chạy migration 0037_payroll_cycle_closes.sql.',
      )
    }
    if (error.code === '23505') {
      throw new Error('Phiếu chốt kỳ này đã tồn tại (chống gửi trùng).')
    }
    throw error
  }
  return rowsToCamel([data])[0]
}

export async function insertPayrollCycleCloseEvent(event) {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa cấu hình.')
  const row = objectToSnakeRow({
    ...event,
    createdAt: event.createdAt ?? new Date().toISOString(),
  })
  const { data, error } = await supabase.from(EVENTS_TABLE).insert(row).select('*').single()
  if (error) {
    if (isMissingSchemaTableError(error)) {
      // Events table optional if migration partial — không chặn submit chính
      console.warn('[payroll_cycle_close_events]', error.message)
      return null
    }
    throw error
  }
  return rowsToCamel([data])[0]
}

export async function fetchPayrollCycleCloseEvents(closeId) {
  if (!isSupabaseConfigured || !closeId) return []
  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .select('*')
    .eq('close_id', closeId)
    .order('created_at', { ascending: true })
  if (error) {
    if (isMissingSchemaTableError(error)) return []
    throw error
  }
  return rowsToCamel(data ?? [])
}
