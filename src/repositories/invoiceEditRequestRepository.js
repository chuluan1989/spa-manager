import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'
import { isMissingSchemaTableError } from './payrollRepository'

const TABLE = 'invoice_edit_requests'
const EVENTS = 'invoice_edit_events'

export async function fetchInvoiceEditRequestById(id) {
  if (!isSupabaseConfigured || !id) return null
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
  if (error) {
    if (isMissingSchemaTableError(error)) return null
    throw error
  }
  return data ? rowsToCamel([data])[0] : null
}

export async function fetchPendingInvoiceEditForInvoice(invoiceId) {
  if (!isSupabaseConfigured || !invoiceId) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('status', 'pending')
    .maybeSingle()
  if (error) {
    if (isMissingSchemaTableError(error)) return null
    throw error
  }
  return data ? rowsToCamel([data])[0] : null
}

export async function fetchInvoiceEditRequestsFiltered({
  branchId = '',
  employeeId = '',
  status = '',
} = {}) {
  if (!isSupabaseConfigured) return []
  let query = supabase.from(TABLE).select('*').order('requested_at', { ascending: false })
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

export async function upsertInvoiceEditRequest(record) {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa cấu hình.')
  const now = new Date().toISOString()
  const row = objectToSnakeRow({
    ...record,
    updatedAt: now,
    createdAt: record.createdAt ?? now,
  })
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) {
    if (isMissingSchemaTableError(error)) {
      throw new Error('Bảng invoice_edit_requests chưa có. Cần chạy migration 0040.')
    }
    if (error.code === '23505') {
      throw new Error('Hóa đơn này đang có yêu cầu chờ duyệt.')
    }
    throw error
  }
  return rowsToCamel([data])[0]
}

export async function insertInvoiceEditEvent(event) {
  if (!isSupabaseConfigured) return null
  const row = objectToSnakeRow({
    ...event,
    createdAt: event.createdAt ?? new Date().toISOString(),
  })
  const { data, error } = await supabase.from(EVENTS).insert(row).select('*').single()
  if (error) {
    if (isMissingSchemaTableError(error)) {
      console.warn('[invoice_edit_events]', error.message)
      return null
    }
    throw error
  }
  return rowsToCamel([data])[0]
}
