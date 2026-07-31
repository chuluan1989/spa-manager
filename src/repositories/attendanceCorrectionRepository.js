import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'
import { isMissingSchemaTableError } from './payrollRepository'

const TABLE = 'attendance_correction_requests'
const EVENTS_TABLE = 'attendance_change_events'

export const CORRECTION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
}

export function createCorrectionRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `acr-${crypto.randomUUID()}`
  }
  return `acr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createAttendanceChangeEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `ace-${crypto.randomUUID()}`
  }
  return `ace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function fetchCorrectionRequestById(id) {
  if (!isSupabaseConfigured || !id) return null
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
  if (error) {
    if (isMissingSchemaTableError(error)) return null
    throw error
  }
  return data ? rowsToCamel([data])[0] : null
}

export async function fetchCorrectionRequestsFiltered({
  employeeId = '',
  branchId = '',
  status = '',
  fromDate = '',
  toDate = '',
  attendanceDate = '',
} = {}) {
  if (!isSupabaseConfigured) return []
  let query = supabase.from(TABLE).select('*').order('requested_at', { ascending: false })
  if (employeeId) query = query.eq('employee_id', employeeId)
  if (branchId) query = query.eq('branch_id', branchId)
  if (status) query = query.eq('status', status)
  if (attendanceDate) query = query.eq('attendance_date', attendanceDate)
  if (fromDate) query = query.gte('attendance_date', fromDate)
  if (toDate) query = query.lte('attendance_date', toDate)
  const { data, error } = await query
  if (error) {
    if (isMissingSchemaTableError(error)) return []
    throw error
  }
  return rowsToCamel(data ?? [])
}

export async function fetchPendingCorrectionForDay(employeeId, attendanceDate) {
  if (!isSupabaseConfigured || !employeeId || !attendanceDate) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('employee_id', employeeId)
    .eq('attendance_date', attendanceDate)
    .eq('status', CORRECTION_STATUS.PENDING)
    .maybeSingle()
  if (error) {
    if (isMissingSchemaTableError(error)) return null
    throw error
  }
  return data ? rowsToCamel([data])[0] : null
}

export async function upsertCorrectionRequest(record) {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa cấu hình.')
  const now = new Date().toISOString()
  const payload = {
    ...record,
    id: record.id || createCorrectionRequestId(),
    updatedAt: now,
    createdAt: record.createdAt ?? now,
  }
  const row = objectToSnakeRow(payload)
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) {
    if (isMissingSchemaTableError(error)) {
      throw new Error(
        'Bảng attendance_correction_requests chưa có trên Supabase. Cần chạy migration 0038_attendance_correction_requests.sql.',
      )
    }
    if (error.code === '23505') {
      throw new Error('Ngày này đang có yêu cầu chờ duyệt. Không tạo trùng.')
    }
    throw error
  }
  return rowsToCamel([data])[0]
}

export async function insertAttendanceChangeEvent(event) {
  if (!isSupabaseConfigured) return null
  const row = objectToSnakeRow({
    ...event,
    id: event.id || createAttendanceChangeEventId(),
    createdAt: event.createdAt ?? new Date().toISOString(),
  })
  const { data, error } = await supabase.from(EVENTS_TABLE).insert(row).select('*').single()
  if (error) {
    if (isMissingSchemaTableError(error)) {
      console.warn('[attendance_change_events]', error.message)
      return null
    }
    throw error
  }
  return rowsToCamel([data])[0]
}

export async function fetchAttendanceChangeEvents({
  requestId = '',
  employeeId = '',
  attendanceDate = '',
} = {}) {
  if (!isSupabaseConfigured) return []
  let query = supabase.from(EVENTS_TABLE).select('*').order('created_at', { ascending: false })
  if (requestId) query = query.eq('request_id', requestId)
  if (employeeId) query = query.eq('employee_id', employeeId)
  if (attendanceDate) query = query.eq('attendance_date', attendanceDate)
  const { data, error } = await query
  if (error) {
    if (isMissingSchemaTableError(error)) return []
    throw error
  }
  return rowsToCamel(data ?? [])
}
