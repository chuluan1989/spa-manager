import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getTodayDate } from '../utils/invoiceStorage'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const ATTENDANCE_TABLE = 'employee_attendance'
const LOG_TABLE = 'attendance_edit_logs'

function sortAttendanceDesc(rows) {
  return [...rows].sort((a, b) => {
    const dateCmp = (b.date ?? '').localeCompare(a.date ?? '')
    if (dateCmp !== 0) return dateCmp
    return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')
  })
}

export async function fetchAttendanceServerDate() {
  if (!isSupabaseConfigured) {
    return { date: getTodayDate(), timestamp: new Date().toISOString() }
  }
  try {
    const { data, error } = await supabase.rpc('get_attendance_server_date')
    if (error) throw error
    const payload = data ?? {}
    return {
      date: payload.date ?? getTodayDate(),
      timestamp: payload.timestamp ?? new Date().toISOString(),
    }
  } catch {
    return { date: getTodayDate(), timestamp: new Date().toISOString() }
  }
}

export async function fetchAttendanceByEmployeeAndDate(employeeId, date) {
  if (!isSupabaseConfigured || !employeeId || !date) return null
  const { data, error } = await supabase
    .from(ATTENDANCE_TABLE)
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  return data ? rowsToCamel([data])[0] : null
}

export async function fetchAttendanceFiltered({
  fromDate = '',
  toDate = '',
  branchId = '',
  employeeId = '',
  date = '',
  status = '',
} = {}) {
  if (!isSupabaseConfigured) return []

  let query = supabase
    .from(ATTENDANCE_TABLE)
    .select('*')
    .order('date', { ascending: false })
    .order('submitted_at', { ascending: false })

  if (date) query = query.eq('date', date)
  if (fromDate) query = query.gte('date', fromDate)
  if (toDate) query = query.lte('date', toDate)
  if (branchId) query = query.eq('branch_id', branchId)
  if (employeeId) query = query.eq('employee_id', employeeId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return sortAttendanceDesc(rowsToCamel(data ?? []))
}

export async function fetchAttendanceForEmployeeMonth(employeeId, monthPrefix) {
  if (!isSupabaseConfigured || !employeeId || !monthPrefix) return []
  const fromDate = `${monthPrefix}-01`
  const toDate = `${monthPrefix}-31`
  return fetchAttendanceFiltered({ fromDate, toDate, employeeId })
}

export async function insertAttendanceRecord(record) {
  if (!isSupabaseConfigured || !record?.id) {
    throw new Error('Supabase chưa cấu hình.')
  }
  const { branchName: _branchName, ...rest } = record
  const row = objectToSnakeRow({
    ...rest,
    createdBy: rest.createdBy ?? rest.submittedBy ?? '',
    submittedAt: rest.submittedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  let { data, error } = await supabase
    .from(ATTENDANCE_TABLE)
    .insert(row)
    .select('*')
    .single()

  if (error && /branch_name|column/.test(error.message ?? '')) {
    delete row.branch_name
    const retry = await supabase.from(ATTENDANCE_TABLE).insert(row).select('*').single()
    data = retry.data
    error = retry.error
  }

  if (error && /created_by|column/.test(error.message ?? '')) {
    delete row.created_by
    const retry = await supabase.from(ATTENDANCE_TABLE).insert(row).select('*').single()
    data = retry.data
    error = retry.error
  }

  if (error) throw error
  return rowsToCamel([data])[0]
}

export async function updateAttendanceRecord(record) {
  if (!isSupabaseConfigured || !record?.id) {
    throw new Error('Supabase chưa cấu hình.')
  }
  const row = objectToSnakeRow({
    ...record,
    updatedAt: new Date().toISOString(),
  })
  const { data, error } = await supabase
    .from(ATTENDANCE_TABLE)
    .update(row)
    .eq('id', record.id)
    .select('*')
    .single()
  if (error) throw error
  return rowsToCamel([data])[0]
}

export async function insertAttendanceEditLogs(logs) {
  if (!isSupabaseConfigured || !Array.isArray(logs) || logs.length === 0) return []
  const rows = logs.map((log) => objectToSnakeRow({
    ...log,
    editedAt: log.editedAt ?? new Date().toISOString(),
  }))
  const { data, error } = await supabase.from(LOG_TABLE).insert(rows).select('*')
  if (error) throw error
  return rowsToCamel(data ?? [])
}

export async function fetchAttendanceEditLogs(attendanceId) {
  if (!isSupabaseConfigured || !attendanceId) return []
  const { data, error } = await supabase
    .from(LOG_TABLE)
    .select('*')
    .eq('attendance_id', attendanceId)
    .order('edited_at', { ascending: false })
  if (error) throw error
  return rowsToCamel(data ?? [])
}

export function subscribeAttendanceChanges(onChange) {
  if (!isSupabaseConfigured || typeof onChange !== 'function') {
    return () => {}
  }

  const channel = supabase
    .channel('spa-attendance-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: ATTENDANCE_TABLE },
      () => onChange(),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export function createAttendanceId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createAttendanceLogId() {
  return `attlog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
