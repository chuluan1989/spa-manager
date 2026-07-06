import { loadCurrentUser } from './authStorage'
import { loadPermissions, PERMISSION_KEYS } from './permissionsStorage'

export { PERMISSION_KEYS }

import { ROLES } from '../constants/roles'

export function getSessionUser() {
  return loadCurrentUser()
}

export function hasSessionPermission(permissionKey) {
  const user = getSessionUser()
  if (!user?.role) return false
  const permissions = loadPermissions()
  const allowed = permissions[permissionKey] ?? []
  return allowed.includes(user.role)
}

export function isSessionAdmin() {
  return getSessionUser()?.role === ROLES.ADMIN
}

export function getSessionBranchId() {
  return getSessionUser()?.branch ?? ''
}

export function canAccessSessionBranch(branchId) {
  const user = getSessionUser()
  if (!user?.role) return false
  if (user.role === ROLES.ADMIN) return true
  return Boolean(branchId) && user.branch === branchId
}

export function denyAccess(message) {
  return { success: false, error: message }
}
