import { ROLES } from '../constants/roles'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertBranchPermissions } from '../repositories/branchPermissionsRepository'
import { upsertPermissions } from '../repositories/permissionsRepository'
import { loadBranches, sortBranchesForDisplay } from './branchStorage'

const STORAGE_KEY = 'spa-manager-permissions'
const BRANCH_STORAGE_KEY = 'spa-manager-branch-permissions'
const EMPLOYEE_STORAGE_KEY = 'spa-manager-employee-permissions'

function pushPermissionsToSupabase(permissions) {
  if (!isSupabaseConfigured) return
  upsertPermissions(permissions).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ phân quyền:', error?.message)
  })
}

function pushBranchPermissionsToSupabase(payload) {
  if (!isSupabaseConfigured) return
  upsertBranchPermissions(payload).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ phân quyền chi nhánh:', error?.message)
  })
}

export const PERMISSION_KEYS = {
  VIEW_INVOICE: 'viewInvoice',
  ADD_INVOICE: 'addInvoice',
  EDIT_INVOICE: 'editInvoice',
  DELETE_INVOICE: 'deleteInvoice',
  VIEW_REPORT: 'viewReport',
  EXPORT_EXCEL: 'exportExcel',
  VIEW_EXPENSE: 'viewExpense',
  ADD_EXPENSE: 'addExpense',
  EDIT_EXPENSE: 'editExpense',
  DELETE_EXPENSE: 'deleteExpense',
  VIEW_EMPLOYEE_PROFILE: 'viewEmployeeProfile',
  VIEW_SENSITIVE: 'viewSensitive',
  ADD_EMPLOYEE: 'addEmployee',
  EDIT_EMPLOYEE: 'editEmployee',
  TRANSFER_EMPLOYEE: 'transferEmployee',
  LOCK_EMPLOYEE: 'lockEmployee',
  VIEW_SALARY: 'viewSalary',
  VIEW_SYSTEM_WIDE: 'viewSystemWide',
  VIEW_CCCD: 'viewCccd',
  MANAGE_EMPLOYEES: 'manageEmployees',
  MANAGE_EXPENSES: 'manageExpenses',
  DELETE_EMPLOYEE: 'deleteEmployee',
  VIEW_CUSTOMERS: 'viewCustomers',
  EDIT_CUSTOMER: 'editCustomer',
  CARE_CUSTOMER: 'careCustomer',
  VIEW_ATTENDANCE: 'viewAttendance',
  EDIT_ATTENDANCE: 'editAttendance',
  MANAGE_PAYROLL: 'managePayroll',
  LOCK_PAYROLL: 'lockPayroll',
  DELETE_PAYROLL: 'deletePayroll',
}

export const PERMISSION_LABELS = {
  [PERMISSION_KEYS.VIEW_INVOICE]: 'Xem hóa đơn',
  [PERMISSION_KEYS.ADD_INVOICE]: 'Tạo hóa đơn',
  [PERMISSION_KEYS.EDIT_INVOICE]: 'Sửa hóa đơn',
  [PERMISSION_KEYS.DELETE_INVOICE]: 'Xóa hóa đơn',
  [PERMISSION_KEYS.VIEW_REPORT]: 'Xem báo cáo',
  [PERMISSION_KEYS.EXPORT_EXCEL]: 'Xuất Excel',
  [PERMISSION_KEYS.VIEW_EXPENSE]: 'Xem chi phí',
  [PERMISSION_KEYS.ADD_EXPENSE]: 'Thêm chi phí',
  [PERMISSION_KEYS.EDIT_EXPENSE]: 'Sửa chi phí',
  [PERMISSION_KEYS.DELETE_EXPENSE]: 'Xóa chi phí',
  [PERMISSION_KEYS.VIEW_EMPLOYEE_PROFILE]: 'Xem hồ sơ nhân viên',
  [PERMISSION_KEYS.VIEW_SENSITIVE]: 'Xem thông tin nhạy cảm',
  [PERMISSION_KEYS.ADD_EMPLOYEE]: 'Thêm nhân viên',
  [PERMISSION_KEYS.EDIT_EMPLOYEE]: 'Sửa nhân viên',
  [PERMISSION_KEYS.TRANSFER_EMPLOYEE]: 'Chuyển chi nhánh',
  [PERMISSION_KEYS.LOCK_EMPLOYEE]: 'Khóa nhân viên',
  [PERMISSION_KEYS.VIEW_SALARY]: 'Xem lương',
  [PERMISSION_KEYS.VIEW_SYSTEM_WIDE]: 'Xem toàn hệ thống',
  [PERMISSION_KEYS.VIEW_CUSTOMERS]: 'Xem khách hàng CRM',
  [PERMISSION_KEYS.EDIT_CUSTOMER]: 'Sửa hồ sơ khách',
  [PERMISSION_KEYS.CARE_CUSTOMER]: 'Chăm sóc khách hàng',
  [PERMISSION_KEYS.VIEW_ATTENDANCE]: 'Xem chấm công',
  [PERMISSION_KEYS.EDIT_ATTENDANCE]: 'Sửa điểm danh',
  [PERMISSION_KEYS.MANAGE_PAYROLL]: 'Quản lý lương (thưởng/phạt/ứng)',
  [PERMISSION_KEYS.LOCK_PAYROLL]: 'Chốt / mở khóa lương',
  [PERMISSION_KEYS.DELETE_PAYROLL]: 'Xóa khoản lương',
}

export const MATRIX_PERMISSION_KEYS = [
  PERMISSION_KEYS.VIEW_INVOICE,
  PERMISSION_KEYS.ADD_INVOICE,
  PERMISSION_KEYS.EDIT_INVOICE,
  PERMISSION_KEYS.DELETE_INVOICE,
  PERMISSION_KEYS.VIEW_REPORT,
  PERMISSION_KEYS.EXPORT_EXCEL,
  PERMISSION_KEYS.VIEW_EXPENSE,
  PERMISSION_KEYS.ADD_EXPENSE,
  PERMISSION_KEYS.EDIT_EXPENSE,
  PERMISSION_KEYS.DELETE_EXPENSE,
  PERMISSION_KEYS.VIEW_EMPLOYEE_PROFILE,
  PERMISSION_KEYS.VIEW_SENSITIVE,
  PERMISSION_KEYS.ADD_EMPLOYEE,
  PERMISSION_KEYS.EDIT_EMPLOYEE,
  PERMISSION_KEYS.TRANSFER_EMPLOYEE,
  PERMISSION_KEYS.LOCK_EMPLOYEE,
  PERMISSION_KEYS.VIEW_SALARY,
  PERMISSION_KEYS.VIEW_SYSTEM_WIDE,
  PERMISSION_KEYS.VIEW_CUSTOMERS,
  PERMISSION_KEYS.EDIT_CUSTOMER,
  PERMISSION_KEYS.CARE_CUSTOMER,
  PERMISSION_KEYS.VIEW_ATTENDANCE,
  PERMISSION_KEYS.EDIT_ATTENDANCE,
  PERMISSION_KEYS.MANAGE_PAYROLL,
  PERMISSION_KEYS.LOCK_PAYROLL,
  PERMISSION_KEYS.DELETE_PAYROLL,
]

/** Quyền chỉ Admin — không cho phép gỡ qua ma trận chi nhánh */
export const ADMIN_ONLY_PERMISSIONS = [
  PERMISSION_KEYS.DELETE_INVOICE,
  PERMISSION_KEYS.VIEW_SENSITIVE,
  PERMISSION_KEYS.VIEW_CCCD,
  PERMISSION_KEYS.TRANSFER_EMPLOYEE,
  PERMISSION_KEYS.DELETE_EMPLOYEE,
  PERMISSION_KEYS.VIEW_SYSTEM_WIDE,
]

export const DEFAULT_PERMISSIONS = {
  [PERMISSION_KEYS.VIEW_INVOICE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.EMPLOYEE],
  [PERMISSION_KEYS.ADD_INVOICE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.EMPLOYEE],
  [PERMISSION_KEYS.EDIT_INVOICE]: [ROLES.ADMIN],
  [PERMISSION_KEYS.DELETE_INVOICE]: [ROLES.ADMIN],
  [PERMISSION_KEYS.VIEW_REPORT]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.EMPLOYEE],
  [PERMISSION_KEYS.EXPORT_EXCEL]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.VIEW_EXPENSE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.ADD_EXPENSE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.EDIT_EXPENSE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.DELETE_EXPENSE]: [ROLES.ADMIN],
  [PERMISSION_KEYS.VIEW_EMPLOYEE_PROFILE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.VIEW_SENSITIVE]: [ROLES.ADMIN],
  [PERMISSION_KEYS.ADD_EMPLOYEE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.EDIT_EMPLOYEE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.TRANSFER_EMPLOYEE]: [ROLES.ADMIN],
  [PERMISSION_KEYS.LOCK_EMPLOYEE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.VIEW_SALARY]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.EMPLOYEE],
  [PERMISSION_KEYS.VIEW_SYSTEM_WIDE]: [ROLES.ADMIN],
  [PERMISSION_KEYS.VIEW_CCCD]: [ROLES.ADMIN],
  [PERMISSION_KEYS.MANAGE_EMPLOYEES]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.MANAGE_EXPENSES]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.DELETE_EMPLOYEE]: [ROLES.ADMIN],
  [PERMISSION_KEYS.VIEW_CUSTOMERS]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.EMPLOYEE],
  [PERMISSION_KEYS.EDIT_CUSTOMER]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.CARE_CUSTOMER]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.VIEW_ATTENDANCE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER, ROLES.EMPLOYEE],
  [PERMISSION_KEYS.EDIT_ATTENDANCE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.MANAGE_PAYROLL]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.LOCK_PAYROLL]: [ROLES.ADMIN],
  [PERMISSION_KEYS.DELETE_PAYROLL]: [ROLES.ADMIN],
}

function defaultBranchPermissionValue(permissionKey) {
  if (ADMIN_ONLY_PERMISSIONS.includes(permissionKey)) return false
  return (DEFAULT_PERMISSIONS[permissionKey] ?? []).includes(ROLES.BRANCH_MANAGER)
}

function defaultEmployeePermissionValue(permissionKey) {
  if (ADMIN_ONLY_PERMISSIONS.includes(permissionKey)) return false
  return (DEFAULT_PERMISSIONS[permissionKey] ?? []).includes(ROLES.EMPLOYEE)
}

export function getMatrixBranches() {
  return loadBranches()
}

function getAllMatrixBranches() {
  return sortBranchesForDisplay(loadBranches())
}

function normalizePermissions(data = {}) {
  const merged = { ...DEFAULT_PERMISSIONS, ...data }
  for (const key of ADMIN_ONLY_PERMISSIONS) {
    merged[key] = [ROLES.ADMIN]
  }
  if (!merged[PERMISSION_KEYS.MANAGE_EMPLOYEES]?.includes(ROLES.BRANCH_MANAGER)) {
    merged[PERMISSION_KEYS.MANAGE_EMPLOYEES] = [
      ...new Set([...(merged[PERMISSION_KEYS.MANAGE_EMPLOYEES] ?? []), ROLES.BRANCH_MANAGER]),
    ]
  }
  if (!merged[PERMISSION_KEYS.VIEW_ATTENDANCE]?.includes(ROLES.EMPLOYEE)) {
    merged[PERMISSION_KEYS.VIEW_ATTENDANCE] = [
      ...new Set([...(merged[PERMISSION_KEYS.VIEW_ATTENDANCE] ?? []), ROLES.EMPLOYEE]),
    ]
  }
  return merged
}

function normalizeBranchPermissions(data = {}) {
  const branches = getAllMatrixBranches()
  const normalized = { ...data }

  for (const branch of branches) {
    const current = { ...(normalized[branch.id] ?? {}) }
    for (const key of MATRIX_PERMISSION_KEYS) {
      if (current[key] === undefined) {
        current[key] = defaultBranchPermissionValue(key)
      }
    }
    normalized[branch.id] = current
  }

  return normalized
}

function normalizeEmployeePermissions(data = {}) {
  const normalized = { ...data }
  for (const key of MATRIX_PERMISSION_KEYS) {
    if (normalized[key] === undefined) {
      normalized[key] = defaultEmployeePermissionValue(key)
    }
  }
  return normalized
}

export function loadPermissions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const defaults = normalizePermissions()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      return defaults
    }
    return normalizePermissions(JSON.parse(raw))
  } catch {
    return normalizePermissions()
  }
}

export function loadBranchPermissions() {
  try {
    const raw = localStorage.getItem(BRANCH_STORAGE_KEY)
    if (!raw) {
      const defaults = normalizeBranchPermissions()
      localStorage.setItem(BRANCH_STORAGE_KEY, JSON.stringify(defaults))
      return defaults
    }
    return normalizeBranchPermissions(JSON.parse(raw))
  } catch {
    return normalizeBranchPermissions()
  }
}

export function loadEmployeePermissions() {
  try {
    const raw = localStorage.getItem(EMPLOYEE_STORAGE_KEY)
    if (!raw) {
      const defaults = normalizeEmployeePermissions()
      localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(defaults))
      return defaults
    }
    return normalizeEmployeePermissions(JSON.parse(raw))
  } catch {
    return normalizeEmployeePermissions()
  }
}

export function savePermissions(permissions, { skipRemoteSync = false } = {}) {
  const normalized = normalizePermissions(permissions)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushPermissionsToSupabase(normalized)
  return normalized
}

export function saveBranchPermissions(payload, { skipRemoteSync = false } = {}) {
  const normalized = normalizeBranchPermissions(payload)
  localStorage.setItem(BRANCH_STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushBranchPermissionsToSupabase(normalized)
  return normalized
}

export function saveEmployeePermissions(payload, { skipRemoteSync = false } = {}) {
  const normalized = normalizeEmployeePermissions(payload)
  localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function hasPermission(permissionKey, role) {
  if (!role) return false
  const permissions = loadPermissions()
  const allowed = permissions[permissionKey] ?? DEFAULT_PERMISSIONS[permissionKey] ?? []
  return allowed.includes(role)
}

export function checkPermission(permissionKey, role, branchId = null) {
  if (!role) return false
  if (role === ROLES.ADMIN) return true

  if (role === ROLES.BRANCH_MANAGER) {
    if (branchId) {
      const branchPerms = loadBranchPermissions()
      if (branchPerms[branchId] && permissionKey in branchPerms[branchId]) {
        return Boolean(branchPerms[branchId][permissionKey])
      }
    }
    return hasPermission(permissionKey, ROLES.BRANCH_MANAGER)
  }

  if (role === ROLES.EMPLOYEE) {
    const employeePerms = loadEmployeePermissions()
    if (permissionKey in employeePerms) {
      return Boolean(employeePerms[permissionKey])
    }
    return hasPermission(permissionKey, ROLES.EMPLOYEE)
  }

  return hasPermission(permissionKey, role)
}

export function getPermissionMatrix() {
  const permissions = loadPermissions()
  return Object.entries(PERMISSION_LABELS).map(([key, label]) => ({
    key,
    label,
    admin: permissions[key]?.includes(ROLES.ADMIN) ?? false,
    branchManager: permissions[key]?.includes(ROLES.BRANCH_MANAGER) ?? false,
    employee: permissions[key]?.includes(ROLES.EMPLOYEE) ?? false,
    adminOnly: ADMIN_ONLY_PERMISSIONS.includes(key),
  }))
}

export function getBranchPermissionMatrix() {
  const branchPerms = loadBranchPermissions()
  const employeePerms = loadEmployeePermissions()
  const branches = getMatrixBranches()

  return MATRIX_PERMISSION_KEYS.map((key) => ({
    key,
    label: PERMISSION_LABELS[key] ?? key,
    adminOnly: ADMIN_ONLY_PERMISSIONS.includes(key),
    admin: true,
    branches: Object.fromEntries(
      branches.map((branch) => [branch.id, Boolean(branchPerms[branch.id]?.[key])]),
    ),
    employee: Boolean(employeePerms[key]),
  }))
}

export function togglePermissionRole(permissionKey, role, enabled) {
  if (ADMIN_ONLY_PERMISSIONS.includes(permissionKey)) {
    return loadPermissions()
  }

  const permissions = loadPermissions()
  const current = new Set(permissions[permissionKey] ?? DEFAULT_PERMISSIONS[permissionKey] ?? [])

  if (enabled) current.add(role)
  else current.delete(role)

  permissions[permissionKey] = [...current]
  return savePermissions(permissions)
}

export function toggleBranchPermission(branchId, permissionKey, enabled) {
  if (ADMIN_ONLY_PERMISSIONS.includes(permissionKey)) {
    return loadBranchPermissions()
  }

  const branchPerms = loadBranchPermissions()
  branchPerms[branchId] = {
    ...(branchPerms[branchId] ?? {}),
    [permissionKey]: enabled,
  }
  return saveBranchPermissions(branchPerms)
}

export function toggleEmployeePermission(permissionKey, enabled) {
  if (ADMIN_ONLY_PERMISSIONS.includes(permissionKey)) {
    return loadEmployeePermissions()
  }

  const employeePerms = loadEmployeePermissions()
  employeePerms[permissionKey] = enabled
  return saveEmployeePermissions(employeePerms)
}

export function getBranchPermission(branchId, permissionKey) {
  const branchPerms = loadBranchPermissions()
  return Boolean(branchPerms[branchId]?.[permissionKey])
}

export function collectPermissionsSnapshot() {
  return {
    global: loadPermissions(),
    branch: loadBranchPermissions(),
    employee: loadEmployeePermissions(),
  }
}

export function applyPermissionsSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return
  if (snapshot.global) savePermissions(snapshot.global)
  if (snapshot.branch) saveBranchPermissions(snapshot.branch)
  if (snapshot.employee) saveEmployeePermissions(snapshot.employee)
}
