import { getBranchName as resolveBranchName, getSupportBranchIds } from './branchStorage'
import {
  canAccessSessionBranch,
  denyAccess,
  getSessionUser,
  hasSessionPermission,
  isSessionAdmin,
  PERMISSION_KEYS,
} from './storageAccess'
import { validateEmployeeSelfProfile } from './validators'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { deleteEmployeeRow, upsertEmployee } from '../repositories/employeesRepository'
import { upsertBranchMinimal } from '../repositories/branchesRepository'
import { getBranchById } from '../constants/branches'
import { syncEmployeeCredentialForEmployee, removeEmployeeCredential, pruneInactiveEmployeeCredentials } from './credentialsStorage'

import { appendEmployeeAuditLog, EMPLOYEE_AUDIT_ACTIONS } from './employeeAuditLog'
import { canPermanentDeleteEmployee, canPermanentDeleteEmployeeRemote, PERMANENT_DELETE_BLOCKED_MESSAGE } from './employeeDeleteGuard'
import { resolveCanonicalBranchId } from '../constants/canonicalBranches'
import { ROLES } from '../constants/roles'
import { IMAGE_CATEGORIES, uploadImageFile } from './imageStorage'
import { notifyDataSynced } from './dataSyncEvents'

export { IMAGE_CATEGORIES }

/** Các cột employees đã có trên Supabase — field ERP mới chỉ lưu local cho tới khi migrate. */
export const SUPABASE_EMPLOYEE_FIELDS = [
  'id', 'branchId', 'name', 'dateOfBirth', 'gender', 'phone', 'email', 'cccd',
  'cccdIssueDate', 'cccdIssuePlace', 'cccdAddress', 'currentAddress',
  'bankName', 'bankAccountHolder', 'bankAccount',
  'emergencyContactName', 'emergencyContactPhone',
  'position', 'startDate', 'endDate', 'commissionRate', 'salaryRate',
  'status', 'note', 'avatar',
  'cccdFrontImage', 'cccdBackImage', 'branchHistory', 'updatedAt',
]

const SUPABASE_REQUIRED_ERROR = 'Supabase chưa cấu hình. Không thể lưu dữ liệu nhân viên.'

/** Ghi lên Supabase khi đã cấu hình; nếu chưa cấu hình chỉ lưu local (dev/test). */
async function pushEmployeeToSupabase(employee) {
  if (!employee) {
    throw new Error(SUPABASE_REQUIRED_ERROR)
  }
  if (!isSupabaseConfigured) {
    return
  }
  const branch = getBranchById(employee.branchId ?? '')
  if (!branch?.id) {
    throw new Error('Không tìm thấy chi nhánh.')
  }
  await upsertBranchMinimal(branch)
  await upsertEmployee({
    ...employee,
    updatedAt: new Date().toISOString(),
  })
}

async function pushEmployeeDeletionToSupabase(id) {
  if (!id) {
    throw new Error(SUPABASE_REQUIRED_ERROR)
  }
  if (!isSupabaseConfigured) {
    return
  }
  await deleteEmployeeRow(id)
}

export const EMPLOYEE_STATUS = {
  ACTIVE: 'active',
  ON_LEAVE: 'on_leave',
  RESIGNED: 'resigned',
  ARCHIVED: 'archived',
}

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
]

const STORAGE_KEY = 'spa-manager-employees'

export const EMPTY_EMPLOYEE_FORM = {
  name: '',
  dateOfBirth: '',
  gender: '',
  phone: '',
  email: '',
  cccd: '',
  cccdIssueDate: '',
  cccdIssuePlace: '',
  cccdAddress: '',
  currentAddress: '',
  bankName: '',
  bankAccountHolder: '',
  bankAccount: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  branchId: '',
  position: '',
  startDate: '',
  endDate: '',
  commissionRate: '',
  salaryRate: '',
  status: EMPLOYEE_STATUS.ACTIVE,
  note: '',
  avatar: '',
  cccdFrontImage: '',
  cccdBackImage: '',
  branchHistory: [],
}

export const PROFILE_STATUS = {
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
  MISSING_CCCD: 'missing_cccd',
  MISSING_BANK: 'missing_bank',
}

/** Các trường nhân viên được tự cập nhật trong "Hồ sơ cá nhân". */
export const EMPLOYEE_SELF_SERVICE_FIELDS = [
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
  'emergencyContactName',
  'emergencyContactPhone',
  'bankName',
  'bankAccountHolder',
  'bankAccount',
  'avatar',
  'cccdFrontImage',
  'cccdBackImage',
]

function normalizeStatus(status) {
  if (status === 'inactive') return EMPLOYEE_STATUS.RESIGNED
  if (status === 'archived') return EMPLOYEE_STATUS.ARCHIVED
  if (Object.values(EMPLOYEE_STATUS).includes(status)) return status
  return EMPLOYEE_STATUS.ACTIVE
}

export function isEmployeeArchived(employee) {
  return employee?.status === EMPLOYEE_STATUS.ARCHIVED
}

export function isEmployeeResigned(employee) {
  return employee?.status === EMPLOYEE_STATUS.RESIGNED
}

/** Danh sách mặc định — nhân viên đang làm + nghỉ phép. */
export function isDefaultListEmployee(employee) {
  return employee?.status === EMPLOYEE_STATUS.ACTIVE
    || employee?.status === EMPLOYEE_STATUS.ON_LEAVE
}

export function isEmployeeLoginEligible(employee) {
  return employee?.status === EMPLOYEE_STATUS.ACTIVE
}

export function isEmployeeInvoiceEligible(employee) {
  return employee?.status === EMPLOYEE_STATUS.ACTIVE
}

export function normalizeEmployee(employee) {
  return {
    id: employee.id,
    name: employee.name ?? '',
    dateOfBirth: employee.dateOfBirth ?? '',
    gender: employee.gender ?? '',
    phone: employee.phone ?? '',
    email: employee.email ?? '',
    cccd: employee.cccd ?? '',
    cccdIssueDate: employee.cccdIssueDate ?? '',
    cccdIssuePlace: employee.cccdIssuePlace ?? '',
    cccdAddress: employee.cccdAddress ?? '',
    currentAddress: employee.currentAddress ?? '',
    bankName: employee.bankName ?? '',
    bankAccountHolder: employee.bankAccountHolder ?? '',
    bankAccount: employee.bankAccount ?? '',
    emergencyContactName: employee.emergencyContactName ?? '',
    emergencyContactPhone: employee.emergencyContactPhone ?? '',
    branchId: resolveCanonicalBranchId(employee.branchId ?? ''),
    position: employee.position ?? '',
    startDate: employee.startDate ?? '',
    endDate: employee.endDate ?? '',
    commissionRate: employee.commissionRate ?? '',
    salaryRate: employee.salaryRate ?? '',
    status: normalizeStatus(employee.status),
    note: employee.note ?? '',
    avatar: employee.avatar ?? '',
    cccdFrontImage: employee.cccdFrontImage ?? '',
    cccdBackImage: employee.cccdBackImage ?? '',
    branchHistory: Array.isArray(employee.branchHistory) ? employee.branchHistory : [],
    updatedAt: employee.updatedAt ?? '',
  }
}

export function createEmployeeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `emp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function loadEmployees() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    const normalized = data.map(normalizeEmployee)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    return normalized
  } catch {
    return []
  }
}

export function saveEmployees(employees) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(employees))
  } catch (error) {
    if (error?.name === 'QuotaExceededError' || error?.code === 22) {
      throw new Error(
        'Dung lượng lưu trữ của trình duyệt đã đầy. Vui lòng xoá bớt ảnh cũ hoặc chọn ảnh nhỏ hơn rồi thử lại.',
      )
    }
    throw error
  }
  return employees
}

/** @deprecated Không còn tự sinh nhân viên — giữ API để tránh crash caller cũ. */
export function syncMissingDefaultEmployees() {
  return false
}

export function getEmployeeById(id) {
  return loadEmployees().find((e) => e.id === id)
}

export function isEmployeeActive(employee) {
  return isEmployeeLoginEligible(employee)
}

export function getEmployeesByBranch(branchId, { activeOnly = false } = {}) {
  if (!branchId) return []
  return loadEmployees().filter((e) => {
    if (e.branchId !== branchId) return false
    if (activeOnly && !isEmployeeActive(e)) return false
    return true
  })
}

export function getActiveEmployeesByBranch(branchId) {
  return getEmployeesByBranch(branchId, { activeOnly: true })
}

export function getAllActiveEmployees() {
  return loadEmployees().filter(isEmployeeActive)
}

export function getSupportEligibleEmployees(excludeEmployeeId = '') {
  return loadEmployees().filter(
    (e) =>
      isEmployeeActive(e)
      && getSupportBranchIds().includes(e.branchId)
      && e.id !== excludeEmployeeId,
  )
}

export function isSupportEligibleEmployee(employeeId) {
  const employee = getEmployeeById(employeeId)
  return Boolean(
    employee
    && isEmployeeActive(employee)
    && getSupportBranchIds().includes(employee.branchId),
  )
}

export function isEmployeeInBranch(employeeId, branchId) {
  const employee = getEmployeeById(employeeId)
  return Boolean(
    employee
    && employee.branchId === branchId
    && isEmployeeActive(employee),
  )
}

/** Hồ sơ được xem là đầy đủ khi có tối thiểu Họ tên, SĐT và CCCD. */
export function isEmployeeProfileComplete(employee) {
  if (!employee) return false
  return (
    Boolean(employee.name?.trim())
    && Boolean(employee.phone?.trim())
    && Boolean(employee.cccd?.trim())
  )
}

const RECOMMENDED_PROFILE_FIELDS = [
  'phone',
  'email',
  'dateOfBirth',
  'gender',
  'currentAddress',
  'position',
  'startDate',
  'emergencyContactName',
  'emergencyContactPhone',
  'cccdIssueDate',
  'cccdIssuePlace',
  'cccdAddress',
  'bankName',
  'bankAccountHolder',
]

/**
 * Trạng thái hồ sơ dùng để hiển thị badge cho Admin trong màn quản lý
 * nhân viên. Thứ tự ưu tiên: thiếu CCCD > thiếu ngân hàng > thiếu thông
 * tin khác > đầy đủ.
 */
export function getEmployeeProfileStatus(employee) {
  if (!employee) {
    return { key: PROFILE_STATUS.INCOMPLETE, label: 'Thiếu thông tin' }
  }

  if (!employee.cccd?.trim()) {
    return { key: PROFILE_STATUS.MISSING_CCCD, label: 'Chưa có CCCD' }
  }

  if (!employee.bankAccount?.trim()) {
    return { key: PROFILE_STATUS.MISSING_BANK, label: 'Chưa có ngân hàng' }
  }

  const hasMissingField = RECOMMENDED_PROFILE_FIELDS.some((field) => !employee[field]?.trim?.())
  if (hasMissingField) {
    return { key: PROFILE_STATUS.INCOMPLETE, label: 'Thiếu thông tin' }
  }

  return { key: PROFILE_STATUS.COMPLETE, label: 'Đầy đủ' }
}

export function getProfileStatusLabel(key) {
  switch (key) {
    case PROFILE_STATUS.COMPLETE:
      return 'Đầy đủ'
    case PROFILE_STATUS.MISSING_CCCD:
      return 'Chưa có CCCD'
    case PROFILE_STATUS.MISSING_BANK:
      return 'Chưa có ngân hàng'
    default:
      return 'Thiếu thông tin'
  }
}

function sanitizeEmployeeData(data) {
  return {
    name: data.name?.trim() ?? '',
    dateOfBirth: data.dateOfBirth ?? '',
    gender: data.gender ?? '',
    phone: data.phone?.trim() ?? '',
    email: data.email?.trim() ?? '',
    cccd: data.cccd?.trim() ?? '',
    cccdIssueDate: data.cccdIssueDate ?? '',
    cccdIssuePlace: data.cccdIssuePlace?.trim() ?? '',
    cccdAddress: data.cccdAddress ?? '',
    currentAddress: data.currentAddress ?? '',
    bankName: data.bankName?.trim() ?? '',
    bankAccountHolder: data.bankAccountHolder?.trim() ?? '',
    bankAccount: data.bankAccount?.trim() ?? '',
    emergencyContactName: data.emergencyContactName?.trim() ?? '',
    emergencyContactPhone: data.emergencyContactPhone?.trim() ?? '',
    branchId: data.branchId ?? '',
    position: data.position?.trim() ?? '',
    startDate: data.startDate ?? '',
    endDate: data.endDate ?? '',
    commissionRate: data.commissionRate?.trim?.() ?? data.commissionRate ?? '',
    salaryRate: data.salaryRate?.trim?.() ?? data.salaryRate ?? '',
    status: normalizeStatus(data.status),
    note: data.note?.trim() ?? '',
    avatar: data.avatar ?? '',
    cccdFrontImage: data.cccdFrontImage ?? '',
    cccdBackImage: data.cccdBackImage ?? '',
    branchHistory: Array.isArray(data.branchHistory) ? data.branchHistory : [],
  }
}

function pickFields(data, fields) {
  const picked = {}
  for (const key of fields) {
    if (data[key] !== undefined) picked[key] = data[key]
  }
  return picked
}

/**
 * Upload ảnh nhân viên (avatar, CCCD...) lên Supabase Storage.
 * Trả về public URL — không lưu Base64 vào LocalStorage.
 */
export async function readAvatarFile(file, options = {}) {
  const category = options.category ?? IMAGE_CATEGORIES.AVATAR
  const entityId = options.entityId ?? 'employee'
  return uploadImageFile(file, { ...options, category, entityId })
}

export async function addEmployee(data) {
  if (!isSessionAdmin()) {
    return denyAccess('Chỉ Admin mới được thêm nhân viên.')
  }
  if (!isSupabaseConfigured) {
    return { success: false, error: SUPABASE_REQUIRED_ERROR }
  }

  const sanitized = sanitizeEmployeeData(data)
  if (!canAccessSessionBranch(sanitized.branchId)) {
    return denyAccess('Bạn không có quyền thêm nhân viên chi nhánh này.')
  }

  const employees = loadEmployees()
  const employee = normalizeEmployee({
    id: createEmployeeId(),
    ...sanitized,
  })
  employees.push(employee)
  try {
    await pushEmployeeToSupabase(employee)
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể lưu hồ sơ nhân viên lên máy chủ.' }
  }
  try {
    saveEmployees(employees)
  } catch (error) {
    return denyAccess(error.message)
  }
  notifyDataSynced(['employees'])
  return { success: true, employee }
}

export async function updateEmployee(id, data) {
  if (!isSessionAdmin()) {
    return denyAccess('Chỉ Admin mới được sửa nhân viên.')
  }

  const employees = loadEmployees()
  const index = employees.findIndex((e) => e.id === id)
  if (index === -1) {
    return denyAccess('Không tìm thấy nhân viên.')
  }

  const current = employees[index]
  if (!canAccessSessionBranch(current.branchId)) {
    return denyAccess('Bạn không có quyền sửa nhân viên này.')
  }

  const sanitized = sanitizeEmployeeData({ ...current, ...data })
  if (sanitized.branchId !== current.branchId && !isSessionAdmin()) {
    return denyAccess('Chỉ Admin mới được đổi chi nhánh nhân viên.')
  }
  if (!canAccessSessionBranch(sanitized.branchId)) {
    return denyAccess('Bạn không có quyền chuyển nhân viên sang chi nhánh này.')
  }

  employees[index] = normalizeEmployee({
    ...current,
    ...sanitized,
  })
  try {
    await pushEmployeeToSupabase(employees[index])
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể lưu hồ sơ nhân viên lên máy chủ.' }
  }
  try {
    saveEmployees(employees)
  } catch (error) {
    return denyAccess(error.message)
  }
  notifyDataSynced(['employees'])

  if (sanitized.branchId !== current.branchId || sanitized.name !== current.name) {
    syncEmployeeCredentialForEmployee(id).catch((error) => {
      console.warn('[Credentials] Không thể đồng bộ tài khoản nhân viên:', error?.message)
    })
  }

  if (sanitized.status !== current.status) {
    appendEmployeeAuditLog({
      employeeId: id,
      employeeName: employees[index].name,
      action: EMPLOYEE_AUDIT_ACTIONS.STATUS_CHANGE,
      details: `${getStatusLabel(current.status)} → ${getStatusLabel(sanitized.status)}`,
    })
  } else if (sanitized.branchId === current.branchId) {
    appendEmployeeAuditLog({
      employeeId: id,
      employeeName: employees[index].name,
      action: EMPLOYEE_AUDIT_ACTIONS.PROFILE_UPDATE,
      details: 'Cập nhật hồ sơ nhân viên',
    })
  }

  return { success: true, employee: employees[index] }
}

/**
 * Nhân viên tự cập nhật hồ sơ cá nhân của chính mình. Chỉ được đổi các
 * trường trong EMPLOYEE_SELF_SERVICE_FIELDS. Không đổi: mã NV, chi nhánh,
 * chức vụ, ngày vào làm, trạng thái, vai trò (dù payload cố tình gửi lên).
 */
export async function updateOwnEmployeeProfile(id, data) {
  const user = getSessionUser()
  if (user?.role !== ROLES.EMPLOYEE || user.employeeId !== id) {
    return denyAccess('Bạn chỉ được sửa hồ sơ của chính mình.')
  }

  const employees = loadEmployees()
  const index = employees.findIndex((e) => e.id === id)
  if (index === -1) {
    return denyAccess('Không tìm thấy hồ sơ nhân viên.')
  }

  const current = employees[index]
  const picked = pickFields(data, EMPLOYEE_SELF_SERVICE_FIELDS)
  const errors = validateEmployeeSelfProfile({ ...current, ...picked })
  if (Object.keys(errors).length > 0) {
    return { success: false, errors, error: Object.values(errors)[0] }
  }

  const sanitized = sanitizeEmployeeData({ ...current, ...picked })
  const updated = normalizeEmployee({
    ...current,
    ...pickFields(sanitized, EMPLOYEE_SELF_SERVICE_FIELDS),
  })
  try {
    await pushEmployeeToSupabase(updated)
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể lưu hồ sơ lên máy chủ. Vui lòng thử lại.' }
  }
  employees[index] = updated
  try {
    saveEmployees(employees)
  } catch (error) {
    return { success: false, error: error.message }
  }
  notifyDataSynced(['employees'])
  return { success: true, employee: updated }
}

export async function deleteEmployee(id) {
  if (!hasSessionPermission(PERMISSION_KEYS.DELETE_EMPLOYEE)) {
    return denyAccess('Chỉ Admin mới được xóa nhân viên.')
  }

  const user = getSessionUser()
  if (user?.role !== ROLES.ADMIN) {
    return denyAccess('Chỉ Admin mới được xóa vĩnh viễn nhân viên.')
  }
  if (!isSupabaseConfigured) {
    return { success: false, error: SUPABASE_REQUIRED_ERROR }
  }

  const employees = loadEmployees()
  const current = employees.find((e) => e.id === id)
  if (!current) {
    return denyAccess('Không tìm thấy nhân viên.')
  }

  const guard = await canPermanentDeleteEmployeeRemote(id)
  if (!guard.allowed) {
    appendEmployeeAuditLog({
      employeeId: id,
      employeeName: current.name,
      action: EMPLOYEE_AUDIT_ACTIONS.PERMANENT_DELETE_BLOCKED,
      details: guard.reason,
    })
    return { success: false, error: guard.reason ?? PERMANENT_DELETE_BLOCKED_MESSAGE }
  }

  try {
    await pushEmployeeDeletionToSupabase(id)
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể xoá nhân viên trên máy chủ.' }
  }

  const next = employees.filter((e) => e.id !== id)
  saveEmployees(next)
  removeEmployeeCredential(id)
  pruneInactiveEmployeeCredentials().catch((error) => {
    console.warn('[Credentials] Không thể dọn credential nhân viên:', error?.message)
  })
  notifyDataSynced(['employees'])
  appendEmployeeAuditLog({
    employeeId: id,
    employeeName: current.name,
    action: EMPLOYEE_AUDIT_ACTIONS.PERMANENT_DELETE,
    details: 'Xóa vĩnh viễn nhân viên chưa phát sinh dữ liệu',
  })
  return { success: true, employees: next }
}

export async function transferEmployee(id, newBranchId, options = {}) {
  if (!hasSessionPermission(PERMISSION_KEYS.TRANSFER_EMPLOYEE)) {
    return denyAccess('Chỉ Admin mới được chuyển chi nhánh nhân viên.')
  }

  const user = getSessionUser()
  if (user?.role !== ROLES.ADMIN) {
    return denyAccess('Chỉ Admin mới được chuyển chi nhánh nhân viên.')
  }

  const { transferDate, note = '', approver = '', reason = '' } = options
  const current = getEmployeeById(id)
  if (current && current.branchId && current.branchId !== newBranchId) {
    const effectiveDate = transferDate || new Date().toISOString().slice(0, 10)
    const historyEntry = {
      fromBranchId: current.branchId,
      fromBranchName: resolveBranchName(current.branchId),
      toBranchId: newBranchId,
      toBranchName: resolveBranchName(newBranchId),
      branchId: current.branchId,
      branchName: resolveBranchName(current.branchId),
      transferDate: effectiveDate,
      effectiveDate,
      note: note.trim(),
      reason: reason.trim() || note.trim(),
      approver: approver.trim(),
      changedAt: new Date().toISOString(),
    }
    const result = await updateEmployee(id, {
      branchId: newBranchId,
      branchHistory: [...(current.branchHistory ?? []), historyEntry],
    })
    if (result.success) {
      appendEmployeeAuditLog({
        employeeId: id,
        employeeName: current.name,
        action: EMPLOYEE_AUDIT_ACTIONS.TRANSFER,
        details: `${resolveBranchName(current.branchId)} → ${resolveBranchName(newBranchId)} (hiệu lực ${effectiveDate})`,
        meta: { approver: approver.trim(), reason: reason.trim() || note.trim() },
      })
    }
    return result
  }

  return updateEmployee(id, { branchId: newBranchId })
}

/** Đặt trạng thái làm việc — nghỉ việc tự ghi ngày nghỉ. */
export async function setEmployeeStatus(id, status, options = {}) {
  if (!isSessionAdmin()) {
    return denyAccess('Chỉ Admin mới được đổi trạng thái nhân viên.')
  }

  const current = getEmployeeById(id)
  if (!current) {
    return denyAccess('Không tìm thấy nhân viên.')
  }

  const nextStatus = normalizeStatus(status)
  const patch = { status: nextStatus }
  if (nextStatus === EMPLOYEE_STATUS.RESIGNED) {
    patch.endDate = options.endDate || new Date().toISOString().slice(0, 10)
  }
  if (nextStatus === EMPLOYEE_STATUS.ACTIVE) {
    patch.endDate = ''
  }

  const result = await updateEmployee(id, patch)
  if (result.success && !isEmployeeLoginEligible(result.employee)) {
    removeEmployeeCredential(id)
    pruneInactiveEmployeeCredentials().catch((error) => {
      console.warn('[Credentials] Không thể dọn credential nhân viên:', error?.message)
    })
  }
  return result
}

/** Lưu trữ — ẩn khỏi danh sách mặc định, giữ toàn bộ dữ liệu lịch sử. */
export async function archiveEmployee(id) {
  if (!isSessionAdmin()) {
    return denyAccess('Chỉ Admin mới được lưu trữ nhân viên.')
  }

  const current = getEmployeeById(id)
  if (!current) {
    return denyAccess('Không tìm thấy nhân viên.')
  }

  const result = await setEmployeeStatus(id, EMPLOYEE_STATUS.ARCHIVED)
  return result
}

/** @deprecated Dùng archiveEmployee hoặc setEmployeeStatus(RESIGNED). */
export async function softDeleteEmployee(id) {
  return setEmployeeStatus(id, EMPLOYEE_STATUS.RESIGNED)
}

/**
 * Xác định chi nhánh của nhân viên tại một ngày (phục vụ đối soát sau chuyển CN).
 * Doanh thu trên hóa đ đơn vẫn gắn branch_id lúc tạo — hàm này dùng cho hiển thị/lịch sử.
 */
export function getEmployeeBranchAtDate(employee, date) {
  if (!employee) return ''
  const history = [...(employee.branchHistory ?? [])]
    .filter((entry) => entry.effectiveDate || entry.transferDate)
    .sort((a, b) => String(a.effectiveDate || a.transferDate).localeCompare(String(b.effectiveDate || b.transferDate)))

  let branchId = employee.branchId
  for (const entry of history) {
    const effective = entry.effectiveDate || entry.transferDate
    if (date >= effective && entry.toBranchId) {
      branchId = entry.toBranchId
    }
  }
  return branchId
}

export function toSupabaseEmployeePayload(employee) {
  const payload = {}
  for (const key of SUPABASE_EMPLOYEE_FIELDS) {
    if (employee[key] !== undefined) payload[key] = employee[key]
  }
  return payload
}

export function getBranchName(branchId) {
  return resolveBranchName(branchId)
}

export function getStatusLabel(status) {
  switch (normalizeStatus(status)) {
    case EMPLOYEE_STATUS.ON_LEAVE:
      return 'Nghỉ phép'
    case EMPLOYEE_STATUS.RESIGNED:
      return 'Nghỉ việc'
    case EMPLOYEE_STATUS.ARCHIVED:
      return 'Lưu trữ'
    default:
      return 'Đang làm'
  }
}

export const EMPLOYEE_STATUS_OPTIONS = [
  { value: EMPLOYEE_STATUS.ACTIVE, label: 'Đang làm' },
  { value: EMPLOYEE_STATUS.ON_LEAVE, label: 'Nghỉ phép' },
  { value: EMPLOYEE_STATUS.RESIGNED, label: 'Nghỉ việc' },
  { value: EMPLOYEE_STATUS.ARCHIVED, label: 'Lưu trữ' },
]

export function getGenderLabel(gender) {
  return GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? '—'
}

export function groupEmployeesByBranch(employees) {
  const groups = new Map()
  for (const employee of employees) {
    const key = employee.branchId
    if (!groups.has(key)) {
      groups.set(key, {
        branchId: key,
        branchName: getBranchName(key),
        employees: [],
      })
    }
    groups.get(key).employees.push(employee)
  }
  return [...groups.values()].sort((a, b) =>
    a.branchName.localeCompare(b.branchName, 'vi'),
  )
}
