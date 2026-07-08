import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const SUPABASE_EMPLOYEE_FIELDS = [
  'id', 'branchId', 'name', 'dateOfBirth', 'gender', 'phone', 'email', 'cccd',
  'cccdIssueDate', 'cccdIssuePlace', 'cccdAddress', 'currentAddress',
  'bankName', 'bankAccountHolder', 'bankAccount',
  'emergencyContactName', 'emergencyContactPhone',
  'position', 'startDate', 'endDate', 'commissionRate', 'salaryRate',
  'status', 'note', 'avatar',
  'cccdFrontImage', 'cccdBackImage', 'branchHistory', 'updatedAt',
]

function toSupabaseEmployeePayload(employee) {
  const payload = {}
  for (const key of SUPABASE_EMPLOYEE_FIELDS) {
    if (employee[key] !== undefined) payload[key] = employee[key]
  }
  return payload
}

const TABLE = 'employees'

export async function fetchEmployeesFiltered({ branchId } = {}) {
  if (!isSupabaseConfigured) return null
  let query = supabase.from(TABLE).select('*').order('name', { ascending: true })
  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  if (error) throw error
  return rowsToCamel(data ?? [])
}

export async function fetchEmployees() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('branch_id', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return rowsToCamel(data)
}

export async function upsertEmployee(employee) {
  if (!isSupabaseConfigured || !employee?.id) return
  const row = objectToSnakeRow({ ...toSupabaseEmployeePayload(employee), updatedAt: new Date().toISOString() })
  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'id' })
  if (error) throw error
}

export async function upsertEmployees(employees) {
  if (!isSupabaseConfigured || !Array.isArray(employees) || employees.length === 0) return
  const rows = employees.map((employee) =>
    objectToSnakeRow({ ...toSupabaseEmployeePayload(employee), updatedAt: new Date().toISOString() }),
  )
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteEmployeeRow(id) {
  if (!isSupabaseConfigured || !id) return
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

export async function countEmployees() {
  if (!isSupabaseConfigured) return 0
  const { count, error } = await supabase.from(TABLE).select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}
