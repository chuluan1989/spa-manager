import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const SUPABASE_EMPLOYEE_FIELDS = [
  'id', 'branchId', 'name', 'dateOfBirth', 'gender', 'phone', 'email', 'cccd',
  'cccdIssueDate', 'cccdIssuePlace', 'cccdAddress', 'currentAddress',
  'bankName', 'bankAccountHolder', 'bankAccount',
  'emergencyContactName', 'emergencyContactPhone',
  'position', 'startDate', 'commissionRate', 'salaryRate',
  'status', 'note', 'avatar',
  'cccdFrontImage', 'cccdBackImage', 'branchHistory', 'updatedAt',
]

function textOrEmpty(value) {
  return value == null ? '' : String(value)
}

/** Giữ giá trị cũ khi payload gửi chuỗi rỗng (tránh ghi đè ERP nếu không sửa). */
function preserveText(nextValue, previousValue) {
  const next = textOrEmpty(nextValue).trim()
  if (next) return textOrEmpty(nextValue).trim()
  const prev = textOrEmpty(previousValue).trim()
  return prev || ''
}

function toSupabaseEmployeePayload(employee, previous = null) {
  const payload = {}
  for (const key of SUPABASE_EMPLOYEE_FIELDS) {
    if (employee[key] !== undefined) payload[key] = employee[key]
  }
  // UI/local: endDate / commissionRate / salaryRate → Postgres: days_off / commission_rate / salary_rate
  payload.commissionRate = preserveText(employee.commissionRate, previous?.commissionRate)
  payload.salaryRate = preserveText(employee.salaryRate, previous?.salaryRate)
  payload.daysOff = preserveText(
    employee.endDate ?? employee.daysOff,
    previous?.endDate || previous?.daysOff,
  )
  return payload
}

function normalizeEmployeeFromDb(employee) {
  if (!employee) return employee
  return {
    ...employee,
    endDate: employee.endDate || employee.daysOff || '',
    commissionRate: employee.commissionRate ?? '',
    salaryRate: employee.salaryRate ?? '',
  }
}

const TABLE = 'employees'

export async function fetchEmployeesFiltered({ branchId } = {}) {
  if (!isSupabaseConfigured) return null
  let query = supabase.from(TABLE).select('*').order('name', { ascending: true })
  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  if (error) throw error
  return rowsToCamel(data ?? []).map(normalizeEmployeeFromDb)
}

export async function fetchEmployees() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('branch_id', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return rowsToCamel(data).map(normalizeEmployeeFromDb)
}

export async function fetchEmployeeById(id) {
  if (!isSupabaseConfigured || !id) return null
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? normalizeEmployeeFromDb(rowsToCamel([data])[0]) : null
}

export async function upsertEmployee(employee, options = {}) {
  if (!isSupabaseConfigured || !employee?.id) {
    throw new Error('Supabase chưa cấu hình. Không thể lưu hồ sơ nhân viên.')
  }
  let previous = null
  if (options.preserveErpIfEmpty) {
    try {
      previous = await fetchEmployeeById(employee.id)
    } catch {
      previous = null
    }
  }
  const row = objectToSnakeRow({
    ...toSupabaseEmployeePayload(employee, previous),
    updatedAt: new Date().toISOString(),
  })
  const { data, error } = await supabase.from(TABLE).upsert(row, { onConflict: 'id' }).select('id')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Supabase không xác nhận đã lưu hồ sơ nhân viên.')
  }
  return data
}

/** Chỉ đủ FK cho chấm công — không gửi ảnh/json lớn (tránh treo khi điểm danh). */
export async function upsertEmployeeMinimal({ id, branchId, name, status = 'active' }) {
  if (!isSupabaseConfigured || !id) return
  const row = objectToSnakeRow({
    id,
    branchId: branchId ?? '',
    name: name ?? '',
    status: status ?? 'active',
    updatedAt: new Date().toISOString(),
  })
  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'id' })
  if (error) throw error
}

export async function upsertEmployees(employees) {
  if (!isSupabaseConfigured || !Array.isArray(employees) || employees.length === 0) return
  const rows = employees.map((employee) =>
    objectToSnakeRow({ ...toSupabaseEmployeePayload(employee, null), updatedAt: new Date().toISOString() }),
  )
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteEmployeeRow(id) {
  if (!isSupabaseConfigured || !id) return
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

export function subscribeEmployeesChanges(onChange) {
  if (!isSupabaseConfigured || typeof onChange !== 'function') {
    return () => {}
  }

  const channel = supabase
    .channel('spa-employees-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      () => onChange(),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export async function countEmployees() {
  if (!isSupabaseConfigured) return 0
  const { count, error } = await supabase.from(TABLE).select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}
