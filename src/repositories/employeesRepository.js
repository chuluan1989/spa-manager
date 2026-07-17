import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

/** Cột employees dùng cho upsert đầy đủ (addEmployee / bulk). */
const SUPABASE_EMPLOYEE_FIELDS = [
  'id', 'branchId', 'name', 'dateOfBirth', 'gender', 'phone', 'email', 'cccd',
  'cccdIssueDate', 'cccdIssuePlace', 'cccdAddress', 'currentAddress',
  'bankName', 'bankAccountHolder', 'bankAccount',
  'emergencyContactName', 'emergencyContactPhone',
  'position', 'startDate', 'commissionRate', 'salaryRate',
  'status', 'note', 'avatar',
  'cccdFrontImage', 'cccdBackImage', 'branchHistory', 'updatedAt',
]

/** Field nhân viên được tự sửa trên hồ sơ cá nhân. */
export const EMPLOYEE_PROFILE_EDITABLE_FIELDS = [
  'name',
  'gender',
  'dateOfBirth',
  'phone',
  'email',
  'cccd',
  'cccdIssueDate',
  'cccdIssuePlace',
  'cccdAddress',
  'currentAddress',
  'bankName',
  'bankAccountHolder',
  'bankAccount',
  'avatar',
  'cccdFrontImage',
  'cccdBackImage',
]

/** Field chỉ Admin được sửa — nhân viên không được gửi lên. */
export const ADMIN_ONLY_EMPLOYEE_FIELDS = [
  'branchId',
  'status',
  'commissionRate',
  'salaryRate',
  'endDate',
  'daysOff',
  'position',
  'startDate',
  'note',
  'branchHistory',
]

export const PROFILE_CONFLICT_MESSAGE =
  'Hồ sơ đã được cập nhật ở thiết bị khác. Vui lòng tải lại để tránh ghi đè dữ liệu.'

export class ProfileConflictError extends Error {
  constructor(message = PROFILE_CONFLICT_MESSAGE) {
    super(message)
    this.name = 'ProfileConflictError'
    this.code = 'PROFILE_CONFLICT'
  }
}

function toSupabaseEmployeePayload(employee) {
  const payload = {}
  for (const key of SUPABASE_EMPLOYEE_FIELDS) {
    if (employee[key] !== undefined) payload[key] = employee[key]
  }
  if (employee.endDate !== undefined || employee.daysOff !== undefined) {
    payload.daysOff = employee.endDate ?? employee.daysOff ?? ''
  }
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

/** Chuẩn hóa patch camelCase → snake_case (days_off từ endDate). */
export function buildEmployeePatchRow(patch) {
  if (!patch || typeof patch !== 'object') return {}
  const camel = { ...patch }
  if (Object.prototype.hasOwnProperty.call(camel, 'endDate')) {
    camel.daysOff = camel.endDate
    delete camel.endDate
  }
  delete camel.id
  delete camel.updatedAt
  delete camel.role
  const row = objectToSnakeRow(camel)
  delete row.id
  delete row.updated_at
  return row
}

const TABLE = 'employees'

/** Cột ảnh — lazy-load khi mở Hồ sơ, không kéo trong list/pullAll. */
export const EMPLOYEE_IMAGE_COLUMNS =
  'avatar,cccd_front_image,cccd_back_image'

/** Login: dropdown + verifyLogin — không cần ảnh hay PII. */
export const EMPLOYEE_LOGIN_COLUMNS =
  'id,name,branch_id,status,position,updated_at'

/** List/sync: toàn bộ text + metadata, không gồm ảnh base64. */
export const EMPLOYEE_LIST_COLUMNS = [
  'id',
  'branch_id',
  'name',
  'date_of_birth',
  'gender',
  'phone',
  'email',
  'cccd',
  'cccd_issue_date',
  'cccd_issue_place',
  'cccd_address',
  'current_address',
  'bank_name',
  'bank_account_holder',
  'bank_account',
  'emergency_contact_name',
  'emergency_contact_phone',
  'position',
  'start_date',
  'commission_rate',
  'salary_rate',
  'status',
  'note',
  'days_off',
  'branch_history',
  'updated_at',
].join(',')

export async function fetchEmployeesForLogin() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select(EMPLOYEE_LOGIN_COLUMNS)
    .order('branch_id', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return rowsToCamel(data ?? []).map(normalizeEmployeeFromDb)
}

export async function fetchEmployeesFiltered({ branchId } = {}) {
  if (!isSupabaseConfigured) return null
  let query = supabase
    .from(TABLE)
    .select(EMPLOYEE_LIST_COLUMNS)
    .order('name', { ascending: true })
  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  if (error) throw error
  return rowsToCamel(data ?? []).map(normalizeEmployeeFromDb)
}

export async function fetchEmployees() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select(EMPLOYEE_LIST_COLUMNS)
    .order('branch_id', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return rowsToCamel(data).map(normalizeEmployeeFromDb)
}

export async function fetchEmployeeProfileMediaById(id) {
  if (!isSupabaseConfigured || !id) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select(EMPLOYEE_IMAGE_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? normalizeEmployeeFromDb(rowsToCamel([data])[0]) : null
}

export async function fetchEmployeeById(id) {
  if (!isSupabaseConfigured || !id) return null
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? normalizeEmployeeFromDb(rowsToCamel([data])[0]) : null
}

/**
 * Partial update theo employee_id.
 * Chỉ ghi các cột trong `patch`. Chống ghi đè đa máy qua expectedUpdatedAt.
 */
export async function patchEmployeeProfile(id, patch, { expectedUpdatedAt } = {}) {
  if (!isSupabaseConfigured || !id) {
    throw new Error('Supabase chưa cấu hình. Không thể lưu hồ sơ nhân viên.')
  }
  const row = buildEmployeePatchRow(patch)
  const keys = Object.keys(row)
  if (keys.length === 0) {
    return fetchEmployeeById(id)
  }

  const nextUpdatedAt = new Date().toISOString()
  row.updated_at = nextUpdatedAt

  let query = supabase.from(TABLE).update(row).eq('id', id)
  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt)
  }

  const { data, error } = await query.select('*')
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) {
    if (expectedUpdatedAt) {
      throw new ProfileConflictError()
    }
    throw new Error('Supabase không xác nhận đã lưu hồ sơ nhân viên.')
  }
  return normalizeEmployeeFromDb(rowsToCamel(data)[0])
}

/** Upsert đầy đủ — chỉ dùng khi thêm nhân viên mới / migrate. */
export async function upsertEmployee(employee) {
  if (!isSupabaseConfigured || !employee?.id) {
    throw new Error('Supabase chưa cấu hình. Không thể lưu hồ sơ nhân viên.')
  }
  const row = objectToSnakeRow({
    ...toSupabaseEmployeePayload(employee),
    updatedAt: new Date().toISOString(),
  })
  if (employee.endDate !== undefined || employee.daysOff !== undefined) {
    row.days_off = employee.endDate ?? employee.daysOff ?? ''
  }
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
  const rows = employees.map((employee) => {
    const row = objectToSnakeRow({
      ...toSupabaseEmployeePayload(employee),
      updatedAt: new Date().toISOString(),
    })
    if (employee.endDate !== undefined || employee.daysOff !== undefined) {
      row.days_off = employee.endDate ?? employee.daysOff ?? ''
    }
    return row
  })
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
