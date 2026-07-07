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

import { ROLES } from '../constants/roles'

export const EMPLOYEE_STATUS = {
  ACTIVE: 'active',
  ON_LEAVE: 'on_leave',
  RESIGNED: 'resigned',
}

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
]

const STORAGE_KEY = 'spa-manager-employees'
const MAX_AVATAR_BYTES = 300 * 1024

const DEFAULT_EMPLOYEE_NAMES = {
  'vinh-long': ['Linh', 'Thơ', 'Bơ', 'Đậu', 'Diệu', 'Thảo', 'Trâm'],
  'tra-vinh': ['Mai Nhi', 'Nhật Hà', 'Trúc Trinh', 'Diễm Trinh', 'Trà My'],
  'bac-lieu': ['Thảo Cầm', 'Thu Hương', 'Thanh Thư', 'Mỹ Nhiên', 'Yến'],
  'soc-trang': ['Chị 7', 'Bảo Trân', 'Tịnh', 'Ly Ly', 'Quyên', 'An Nhỏ'],
  'tram-spa': ['Thanh', 'Nhu Hà', 'Trúc Ly', 'Cherry', 'Lan Anh'],
  'song-khoe-spa': ['Úc', 'Hải Anh', 'Di Di', 'Ngân', 'Ánh'],
}

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
  bankAccount: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  branchId: '',
  position: '',
  startDate: '',
  status: EMPLOYEE_STATUS.ACTIVE,
  note: '',
  avatar: '',
  cccdFrontImage: '',
  cccdBackImage: '',
}

/** Các trường nhân viên được tự cập nhật trong "Hồ sơ cá nhân". */
export const EMPLOYEE_SELF_SERVICE_FIELDS = [
  'name',
  'phone',
  'cccd',
  'cccdIssueDate',
  'cccdIssuePlace',
  'cccdAddress',
  'currentAddress',
  'bankName',
  'bankAccount',
  'emergencyContactName',
  'emergencyContactPhone',
  'avatar',
  'cccdFrontImage',
  'cccdBackImage',
]

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeStatus(status) {
  if (status === 'inactive') return EMPLOYEE_STATUS.RESIGNED
  if (Object.values(EMPLOYEE_STATUS).includes(status)) return status
  return EMPLOYEE_STATUS.ACTIVE
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
    bankAccount: employee.bankAccount ?? '',
    emergencyContactName: employee.emergencyContactName ?? '',
    emergencyContactPhone: employee.emergencyContactPhone ?? '',
    branchId: employee.branchId ?? '',
    position: employee.position ?? '',
    startDate: employee.startDate ?? '',
    status: normalizeStatus(employee.status),
    note: employee.note ?? '',
    avatar: employee.avatar ?? '',
    cccdFrontImage: employee.cccdFrontImage ?? '',
    cccdBackImage: employee.cccdBackImage ?? '',
  }
}

function buildDefaultEmployees() {
  const employees = []
  for (const [branchId, names] of Object.entries(DEFAULT_EMPLOYEE_NAMES)) {
    for (const name of names) {
      employees.push(normalizeEmployee({
        id: `${branchId}-${slugify(name)}`,
        name,
        branchId,
      }))
    }
  }
  return employees
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
    if (!raw) {
      const defaults = buildDefaultEmployees()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      return defaults
    }
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return buildDefaultEmployees()
    const normalized = data.map(normalizeEmployee)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    return normalized
  } catch {
    return buildDefaultEmployees()
  }
}

export function saveEmployees(employees) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(employees))
  return employees
}

export function getEmployeeById(id) {
  return loadEmployees().find((e) => e.id === id)
}

export function isEmployeeActive(employee) {
  return employee?.status === EMPLOYEE_STATUS.ACTIVE
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

/** Hồ sơ được xem là đầy đủ khi có tối thiểu Họ tên và SĐT hợp lệ. */
export function isEmployeeProfileComplete(employee) {
  if (!employee) return false
  return Boolean(employee.name?.trim()) && Boolean(employee.phone?.trim())
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
    bankAccount: data.bankAccount?.trim() ?? '',
    emergencyContactName: data.emergencyContactName?.trim() ?? '',
    emergencyContactPhone: data.emergencyContactPhone?.trim() ?? '',
    branchId: data.branchId ?? '',
    position: data.position?.trim() ?? '',
    startDate: data.startDate ?? '',
    status: normalizeStatus(data.status),
    note: data.note?.trim() ?? '',
    avatar: data.avatar ?? '',
    cccdFrontImage: data.cccdFrontImage ?? '',
    cccdBackImage: data.cccdBackImage ?? '',
  }
}

function pickFields(data, fields) {
  const picked = {}
  for (const key of fields) {
    if (data[key] !== undefined) picked[key] = data[key]
  }
  return picked
}

export function readAvatarFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('')
      return
    }
    if (!file.type.startsWith('image/')) {
      reject(new Error('Vui lòng chọn file ảnh'))
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      reject(new Error('Ảnh không được vượt quá 300KB'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'))
    reader.readAsDataURL(file)
  })
}

export function addEmployee(data) {
  if (!hasSessionPermission(PERMISSION_KEYS.MANAGE_EMPLOYEES)) {
    return denyAccess('Bạn không có quyền thêm nhân viên.')
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
  saveEmployees(employees)
  return { success: true, employee }
}

export function updateEmployee(id, data) {
  if (!hasSessionPermission(PERMISSION_KEYS.MANAGE_EMPLOYEES)) {
    return denyAccess('Bạn không có quyền sửa nhân viên.')
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
  saveEmployees(employees)
  return { success: true, employee: employees[index] }
}

/**
 * Nhân viên tự cập nhật hồ sơ cá nhân của chính mình. Chỉ được đổi các
 * trường trong EMPLOYEE_SELF_SERVICE_FIELDS — vai trò, chi nhánh, chức vụ,
 * ngày vào làm, trạng thái làm việc... không thể bị thay đổi qua đường này
 * dù dữ liệu gửi lên (qua code/browser) có cố tình chứa các trường đó.
 */
export function updateOwnEmployeeProfile(id, data) {
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
  employees[index] = updated
  saveEmployees(employees)
  return { success: true, employee: updated }
}

export function deleteEmployee(id) {
  if (!hasSessionPermission(PERMISSION_KEYS.DELETE_EMPLOYEE)) {
    return denyAccess('Chỉ Admin mới được xóa nhân viên.')
  }

  const employees = loadEmployees()
  const current = employees.find((e) => e.id === id)
  if (!current) {
    return denyAccess('Không tìm thấy nhân viên.')
  }

  const next = employees.filter((e) => e.id !== id)
  saveEmployees(next)
  return { success: true, employees: next }
}

export function transferEmployee(id, newBranchId) {
  if (!hasSessionPermission(PERMISSION_KEYS.TRANSFER_EMPLOYEE)) {
    return denyAccess('Chỉ Admin mới được chuyển chi nhánh nhân viên.')
  }

  const user = getSessionUser()
  if (user?.role !== ROLES.ADMIN) {
    return denyAccess('Chỉ Admin mới được chuyển chi nhánh nhân viên.')
  }

  return updateEmployee(id, { branchId: newBranchId })
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
    default:
      return 'Đang làm'
  }
}

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
