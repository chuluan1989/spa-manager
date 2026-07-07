import { ROLES } from '../constants/roles'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertPermissions } from '../repositories/permissionsRepository'

const STORAGE_KEY = 'spa-manager-permissions'

function pushPermissionsToSupabase(permissions) {
  if (!isSupabaseConfigured) return
  upsertPermissions(permissions).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ phân quyền:', error?.message)
  })
}

export const PERMISSION_KEYS = {
  VIEW_REPORT: 'viewReport',
  ADD_INVOICE: 'addInvoice',
  EDIT_INVOICE: 'editInvoice',
  DELETE_INVOICE: 'deleteInvoice',
  VIEW_CCCD: 'viewCccd',
  MANAGE_EMPLOYEES: 'manageEmployees',
  MANAGE_EXPENSES: 'manageExpenses',
  DELETE_EMPLOYEE: 'deleteEmployee',
  TRANSFER_EMPLOYEE: 'transferEmployee',
}

export const PERMISSION_LABELS = {
  [PERMISSION_KEYS.VIEW_REPORT]: 'Xem báo cáo',
  [PERMISSION_KEYS.ADD_INVOICE]: 'Thêm hóa đơn',
  [PERMISSION_KEYS.EDIT_INVOICE]: 'Sửa hóa đơn',
  [PERMISSION_KEYS.DELETE_INVOICE]: 'Xóa hóa đơn (chỉ Admin)',
  [PERMISSION_KEYS.VIEW_CCCD]: 'Xem CCCD (chỉ Admin)',
  [PERMISSION_KEYS.MANAGE_EMPLOYEES]: 'Quản lý nhân viên chi nhánh',
  [PERMISSION_KEYS.MANAGE_EXPENSES]: 'Quản lý chi phí',
  [PERMISSION_KEYS.DELETE_EMPLOYEE]: 'Lưu trữ / xóa vĩnh viễn nhân viên (chỉ Admin)',
  [PERMISSION_KEYS.TRANSFER_EMPLOYEE]: 'Chuyển chi nhánh nhân viên (chỉ Admin)',
}

/** Quyền chỉ Admin — không cho phép gỡ qua cài đặt */
export const ADMIN_ONLY_PERMISSIONS = [
  PERMISSION_KEYS.DELETE_INVOICE,
  PERMISSION_KEYS.VIEW_CCCD,
  PERMISSION_KEYS.DELETE_EMPLOYEE,
  PERMISSION_KEYS.TRANSFER_EMPLOYEE,
]

export const DEFAULT_PERMISSIONS = {
  [PERMISSION_KEYS.VIEW_REPORT]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.ADD_INVOICE]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.EDIT_INVOICE]: [ROLES.ADMIN],
  [PERMISSION_KEYS.DELETE_INVOICE]: [ROLES.ADMIN],
  [PERMISSION_KEYS.VIEW_CCCD]: [ROLES.ADMIN],
  [PERMISSION_KEYS.MANAGE_EMPLOYEES]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.MANAGE_EXPENSES]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER],
  [PERMISSION_KEYS.DELETE_EMPLOYEE]: [ROLES.ADMIN],
  [PERMISSION_KEYS.TRANSFER_EMPLOYEE]: [ROLES.ADMIN],
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
  return merged
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

export function savePermissions(permissions, { skipRemoteSync = false } = {}) {
  const normalized = normalizePermissions(permissions)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushPermissionsToSupabase(normalized)
  return normalized
}

export function hasPermission(permissionKey, role) {
  if (!role) return false
  const permissions = loadPermissions()
  const allowed = permissions[permissionKey] ?? DEFAULT_PERMISSIONS[permissionKey] ?? []
  return allowed.includes(role)
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
