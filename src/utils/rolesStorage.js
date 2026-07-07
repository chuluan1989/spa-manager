const STORAGE_KEY = 'spa-manager-custom-roles'

export const DEFAULT_ROLES = [
  { id: 'admin', label: 'Admin', builtin: true },
  { id: 'branch_manager', label: 'Quản lý chi nhánh', builtin: true },
  { id: 'employee', label: 'Nhân viên', builtin: true },
]

export function loadCustomRoles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export function saveCustomRoles(roles) {
  const normalized = roles
    .filter((role) => role?.id && role?.label)
    .map((role) => ({
      id: String(role.id).trim(),
      label: String(role.label).trim(),
      builtin: false,
    }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function getAllRoles() {
  return [...DEFAULT_ROLES, ...loadCustomRoles()]
}

export function addCustomRole(label) {
  const id = label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

  if (!id) return { success: false, error: 'Tên vai trò không hợp lệ' }

  const custom = loadCustomRoles()
  if (custom.some((role) => role.id === id) || DEFAULT_ROLES.some((role) => role.id === id)) {
    return { success: false, error: 'Vai trò đã tồn tại' }
  }

  custom.push({ id, label: label.trim(), builtin: false })
  saveCustomRoles(custom)
  return { success: true, role: { id, label: label.trim() } }
}

export function removeCustomRole(roleId) {
  const custom = loadCustomRoles().filter((role) => role.id !== roleId)
  saveCustomRoles(custom)
  return custom
}
