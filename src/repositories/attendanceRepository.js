import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getEmployeeById } from '../utils/employeeStorage'
import { getTodayDate } from '../utils/invoiceStorage'
import { rowToCamel } from './caseUtils'

const ATTENDANCE_TABLE = 'attendance'
const LOG_TABLE = 'attendance_edit_logs'
const DATE_COLUMN = 'attendance_date'

function sortAttendanceDesc(rows) {
  return [...rows].sort((a, b) => {
    const dateCmp = (b.date ?? '').localeCompare(a.date ?? '')
    if (dateCmp !== 0) return dateCmp
    return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')
  })
}

/** Map DB row (attendance) → model JS dùng chung toàn app. */
export function normalizeAttendanceRow(row) {
  if (!row || typeof row !== 'object') return row
  const camel = rowToCamel(row)
  const employeeId = camel.employeeId ?? ''
  const employee = employeeId ? getEmployeeById(employeeId) : null

  return {
    id: camel.id ?? '',
    employeeId,
    branchId: camel.branchId ?? '',
    date: camel.attendanceDate ?? camel.date ?? '',
    status: camel.status ?? '',
    reason: camel.reason ?? '',
    note: camel.note ?? '',
    penaltyAmount: Number(camel.penaltyAmount ?? 0),
    submittedAt: camel.createdAt ?? camel.submittedAt ?? '',
    updatedAt: camel.updatedAt ?? camel.createdAt ?? camel.submittedAt ?? '',
    createdBy: camel.createdBy ?? '',
    submittedBy: camel.createdBy ?? camel.submittedBy ?? '',
    employeeName: camel.employeeName ?? employee?.name ?? '',
  }
}

function normalizeAttendanceRows(rows) {
  return sortAttendanceDesc((rows ?? []).map(normalizeAttendanceRow))
}

function buildAttendanceInsertRow(record) {
  const now = new Date().toISOString()
  return {
    id: record.id,
    employee_id: record.employeeId,
    branch_id: record.branchId ?? null,
    [DATE_COLUMN]: record.date,
    status: record.status ?? '',
    reason: record.reason ?? '',
    penalty_amount: Number(record.penaltyAmount ?? 0),
    created_at: record.submittedAt ?? now,
    updated_at: now,
    created_by: record.createdBy ?? record.employeeId ?? '',
  }
}

function buildAttendanceUpdateRow(record) {
  return {
    branch_id: record.branchId ?? null,
    status: record.status ?? '',
    reason: record.reason ?? '',
    penalty_amount: Number(record.penaltyAmount ?? 0),
    updated_at: new Date().toISOString(),
  }
}

async function runInsert(row) {
  return supabase.from(ATTENDANCE_TABLE).insert(row).select('*').single()
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
    .eq(DATE_COLUMN, date)
    .maybeSingle()
  if (error) throw error
  return data ? normalizeAttendanceRow(data) : null
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
    .order(DATE_COLUMN, { ascending: false })
    .order('created_at', { ascending: false })

  if (date) query = query.eq(DATE_COLUMN, date)
  if (fromDate) query = query.gte(DATE_COLUMN, fromDate)
  if (toDate) query = query.lte(DATE_COLUMN, toDate)
  if (branchId) query = query.eq('branch_id', branchId)
  if (employeeId) query = query.eq('employee_id', employeeId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return normalizeAttendanceRows(data ?? [])
}

export async function fetchAttendanceForEmployeeMonth(employeeId, monthPrefix) {
  if (!isSupabaseConfigured || !employeeId || !monthPrefix) return []
  const fromDate = `${monthPrefix}-01`
  const toDate = `${monthPrefix}-31`
  return fetchAttendanceFiltered({ fromDate, toDate, employeeId })
}

export async function insertAttendanceRecord(record, { onForeignKeyError } = {}) {
  if (!isSupabaseConfigured || !record?.id) {
    throw new Error('Supabase chưa cấu hình.')
  }
  if (!record.employeeId) {
    throw new Error('Thiếu employee_id khi lưu chấm công.')
  }
  if (!record.date) {
    throw new Error('Thiếu attendance_date khi lưu chấm công.')
  }

  const row = buildAttendanceInsertRow(record)
  let { data, error } = await runInsert(row)

  if (error && /foreign key|violates foreign key/i.test(error.message ?? '')) {
    if (typeof onForeignKeyError === 'function') {
      await onForeignKeyError()
      ;({ data, error } = await runInsert(row))
    }
  }

  if (error) throw error
  return normalizeAttendanceRow(data)
}

export async function updateAttendanceRecord(record) {
  if (!isSupabaseConfigured || !record?.id) {
    throw new Error('Supabase chưa cấu hình.')
  }
  const row = buildAttendanceUpdateRow(record)
  const { data, error } = await supabase
    .from(ATTENDANCE_TABLE)
    .update(row)
    .eq('id', record.id)
    .select('*')
    .single()
  if (error) throw error
  return normalizeAttendanceRow(data)
}

export async function insertAttendanceEditLogs(logs) {
  if (!isSupabaseConfigured || !Array.isArray(logs) || logs.length === 0) return []
  const rows = logs.map((log) => ({
    id: log.id,
    attendance_id: log.attendanceId,
    editor_id: log.editorId ?? '',
    editor_name: log.editorName ?? '',
    edited_at: log.editedAt ?? new Date().toISOString(),
    field_name: log.fieldName ?? '',
    old_value: log.oldValue ?? '',
    new_value: log.newValue ?? '',
    note: log.note ?? '',
  }))
  const { data, error } = await supabase.from(LOG_TABLE).insert(rows).select('*')
  if (error) throw error
  return (data ?? []).map(rowToCamel)
}

export async function fetchAttendanceEditLogs(attendanceId) {
  if (!isSupabaseConfigured || !attendanceId) return []
  const { data, error } = await supabase
    .from(LOG_TABLE)
    .select('*')
    .eq('attendance_id', attendanceId)
    .order('edited_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(rowToCamel)
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
