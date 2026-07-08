import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getEmployeeById } from '../utils/employeeStorage'
import { getTodayDate } from '../utils/invoiceStorage'
import { rowToCamel } from './caseUtils'

const LOG_TABLE = 'attendance_edit_logs'

const TABLE_MODERN = {
  name: 'attendance',
  dateColumn: 'attendance_date',
  sortColumn: 'created_at',
}

const TABLE_LEGACY = {
  name: 'employee_attendance',
  dateColumn: 'date',
  sortColumn: 'submitted_at',
}

const MISSING_TABLE_MESSAGE =
  'Bảng chấm công chưa có trên Supabase. Admin vào SQL Editor và chạy file supabase/RUN_ATTENDANCE_SETUP.sql rồi thử lại.'

let resolvedTable = null

function isMissingTableError(error) {
  const message = error?.message ?? String(error ?? '')
  return /schema cache|PGRST205|Could not find the table|does not exist/i.test(message)
}

function sortAttendanceDesc(rows) {
  return [...rows].sort((a, b) => {
    const dateCmp = (b.date ?? '').localeCompare(a.date ?? '')
    if (dateCmp !== 0) return dateCmp
    return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')
  })
}

/** Map DB row → model JS dùng chung toàn app. */
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

async function resolveAttendanceTable(force = false) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình.')
  }
  if (resolvedTable && !force) return resolvedTable

  for (const candidate of [TABLE_MODERN, TABLE_LEGACY]) {
    const { error } = await supabase.from(candidate.name).select('id').limit(1)
    if (!error || !isMissingTableError(error)) {
      resolvedTable = candidate
      return candidate
    }
  }

  throw new Error(MISSING_TABLE_MESSAGE)
}

function buildInsertRow(record, table) {
  const now = new Date().toISOString()
  const employee = getEmployeeById(record.employeeId)

  if (table.name === TABLE_MODERN.name) {
    return {
      id: record.id,
      employee_id: record.employeeId,
      branch_id: record.branchId ?? null,
      attendance_date: record.date,
      status: record.status ?? '',
      reason: record.reason ?? '',
      penalty_amount: Number(record.penaltyAmount ?? 0),
      created_at: record.submittedAt ?? now,
      updated_at: now,
      created_by: record.createdBy ?? record.employeeId ?? '',
    }
  }

  return {
    id: record.id,
    employee_id: record.employeeId,
    branch_id: record.branchId ?? null,
    date: record.date,
    employee_name: record.employeeName ?? employee?.name ?? '',
    status: record.status ?? '',
    reason: record.reason ?? '',
    note: record.note ?? '',
    penalty_amount: Number(record.penaltyAmount ?? 0),
    submitted_at: record.submittedAt ?? now,
    submitted_by: record.createdBy ?? record.employeeId ?? '',
    updated_at: now,
    created_by: record.createdBy ?? record.employeeId ?? '',
  }
}

function buildUpdateRow(record) {
  return {
    branch_id: record.branchId ?? null,
    status: record.status ?? '',
    reason: record.reason ?? '',
    penalty_amount: Number(record.penaltyAmount ?? 0),
    updated_at: new Date().toISOString(),
  }
}

async function fromAttendanceTable() {
  const table = await resolveAttendanceTable()
  return supabase.from(table.name)
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
  const table = await resolveAttendanceTable()
  const { data, error } = await supabase
    .from(table.name)
    .select('*')
    .eq('employee_id', employeeId)
    .eq(table.dateColumn, date)
    .maybeSingle()
  if (error) {
    if (isMissingTableError(error)) throw new Error(MISSING_TABLE_MESSAGE)
    throw error
  }
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

  const table = await resolveAttendanceTable()
  let query = supabase
    .from(table.name)
    .select('*')
    .order(table.dateColumn, { ascending: false })
    .order(table.sortColumn, { ascending: false })

  if (date) query = query.eq(table.dateColumn, date)
  if (fromDate) query = query.gte(table.dateColumn, fromDate)
  if (toDate) query = query.lte(table.dateColumn, toDate)
  if (branchId) query = query.eq('branch_id', branchId)
  if (employeeId) query = query.eq('employee_id', employeeId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    if (isMissingTableError(error)) throw new Error(MISSING_TABLE_MESSAGE)
    throw error
  }
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
    throw new Error('Thiếu ngày chấm công.')
  }

  const table = await resolveAttendanceTable()
  const row = buildInsertRow(record, table)
  let { data, error } = await supabase.from(table.name).insert(row).select('*').single()

  if (error && /foreign key|violates foreign key/i.test(error.message ?? '')) {
    if (typeof onForeignKeyError === 'function') {
      await onForeignKeyError()
      ;({ data, error } = await supabase.from(table.name).insert(row).select('*').single())
    }
  }

  if (error) {
    if (isMissingTableError(error)) throw new Error(MISSING_TABLE_MESSAGE)
    if (/created_by|column/.test(error.message ?? '')) {
      delete row.created_by
      const retry = await supabase.from(table.name).insert(row).select('*').single()
      data = retry.data
      error = retry.error
    }
  }

  if (error) throw error
  return normalizeAttendanceRow(data)
}

export async function updateAttendanceRecord(record) {
  if (!isSupabaseConfigured || !record?.id) {
    throw new Error('Supabase chưa cấu hình.')
  }
  const table = await resolveAttendanceTable()
  const row = buildUpdateRow(record)
  const { data, error } = await supabase
    .from(table.name)
    .update(row)
    .eq('id', record.id)
    .select('*')
    .single()
  if (error) {
    if (isMissingTableError(error)) throw new Error(MISSING_TABLE_MESSAGE)
    throw error
  }
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
  if (error && !isMissingTableError(error)) throw error
  if (error) return []
  return (data ?? []).map(rowToCamel)
}

export async function fetchAttendanceEditLogs(attendanceId) {
  if (!isSupabaseConfigured || !attendanceId) return []
  const { data, error } = await supabase
    .from(LOG_TABLE)
    .select('*')
    .eq('attendance_id', attendanceId)
    .order('edited_at', { ascending: false })
  if (error && !isMissingTableError(error)) throw error
  if (error) return []
  return (data ?? []).map(rowToCamel)
}

export function subscribeAttendanceChanges(onChange) {
  if (!isSupabaseConfigured || typeof onChange !== 'function') {
    return () => {}
  }

  let channel = null
  let cancelled = false

  resolveAttendanceTable()
    .then((table) => {
      if (cancelled) return
      channel = supabase
        .channel(`spa-attendance-realtime-${table.name}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: table.name },
          () => onChange(),
        )
        .subscribe()
    })
    .catch(() => {})

  return () => {
    cancelled = true
    if (channel) supabase.removeChannel(channel)
  }
}

export function createAttendanceId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createAttendanceLogId() {
  return `attlog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Cho smoke test / debug */
export function resetAttendanceTableCache() {
  resolvedTable = null
}

export async function getResolvedAttendanceTableName() {
  return (await resolveAttendanceTable()).name
}
