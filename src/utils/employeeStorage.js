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
// Ảnh vượt quá ngưỡng này (2MB) sẽ được tự động nén (resize + giảm chất
// lượng JPEG) trước khi lưu, thay vì bị từ chối như trước đây.
const COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024
// Kích thước Base64 mong muốn sau khi nén, để tránh làm đầy localStorage.
const TARGET_COMPRESSED_BYTES = 1.5 * 1024 * 1024
// Chặn hẳn các file quá khổ (ảnh RAW/scan cực lớn) mà nén cũng khó xử lý mượt.
const HARD_MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1920
const MIN_IMAGE_DIMENSION = 640
const MIN_JPEG_QUALITY = 0.4

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
  bankAccountHolder: '',
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
    bankAccountHolder: employee.bankAccountHolder ?? '',
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

/** Hồ sơ được xem là đầy đủ khi có tối thiểu Họ tên, SĐT và CCCD. */
export function isEmployeeProfileComplete(employee) {
  if (!employee) return false
  return (
    Boolean(employee.name?.trim())
    && Boolean(employee.phone?.trim())
    && Boolean(employee.cccd?.trim())
  )
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('File ảnh bị lỗi hoặc không đúng định dạng'))
    img.src = dataUrl
  })
}

function estimateDataUrlBytes(dataUrl) {
  const commaIndex = dataUrl.indexOf(',')
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
  return Math.ceil((base64.length * 3) / 4)
}

function drawToDataUrl(img, width, height, quality) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Resize + giảm chất lượng JPEG cho tới khi đạt dung lượng mục tiêu. */
function compressImageElement(img) {
  let width = img.naturalWidth || img.width
  let height = img.naturalHeight || img.height

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    if (width >= height) {
      height = Math.round((height * MAX_IMAGE_DIMENSION) / width)
      width = MAX_IMAGE_DIMENSION
    } else {
      width = Math.round((width * MAX_IMAGE_DIMENSION) / height)
      height = MAX_IMAGE_DIMENSION
    }
  }

  let quality = 0.85
  let output = drawToDataUrl(img, width, height, quality)

  let guard = 0
  while (
    estimateDataUrlBytes(output) > TARGET_COMPRESSED_BYTES
    && (quality > MIN_JPEG_QUALITY || width > MIN_IMAGE_DIMENSION)
    && guard < 20
  ) {
    if (quality > MIN_JPEG_QUALITY) {
      quality = Math.max(MIN_JPEG_QUALITY, quality - 0.1)
    } else {
      width = Math.round(width * 0.85)
      height = Math.round(height * 0.85)
    }
    output = drawToDataUrl(img, width, height, quality)
    guard += 1
  }

  return output
}

/**
 * Đọc file ảnh (avatar, CCCD mặt trước/sau...) và trả về chuỗi Base64
 * (Data URL) để lưu trực tiếp vào localStorage — không bao giờ lưu File
 * object. Ảnh lớn hơn 2MB sẽ được tự động nén (resize + giảm chất lượng
 * JPEG) trước khi lưu để tránh mất dữ liệu hoặc vượt hạn mức localStorage.
 */
export async function readAvatarFile(file) {
  if (!file) return ''
  if (!file.type?.startsWith('image/')) {
    throw new Error('Vui lòng chọn file ảnh (JPG, PNG...)')
  }
  if (file.size > HARD_MAX_UPLOAD_BYTES) {
    throw new Error('Ảnh quá lớn (tối đa 15MB), vui lòng chọn ảnh khác')
  }

  const dataUrl = await readFileAsDataUrl(file)

  if (file.size <= COMPRESS_THRESHOLD_BYTES) {
    return dataUrl
  }

  try {
    const img = await loadImageElement(dataUrl)
    return compressImageElement(img)
  } catch {
    // Nếu nén thất bại vì lý do bất kỳ, vẫn dùng ảnh gốc thay vì chặn người dùng.
    return dataUrl
  }
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
  try {
    saveEmployees(employees)
  } catch (error) {
    return denyAccess(error.message)
  }
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
  try {
    saveEmployees(employees)
  } catch (error) {
    return denyAccess(error.message)
  }
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
  try {
    saveEmployees(employees)
  } catch (error) {
    return { success: false, error: error.message }
  }
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
