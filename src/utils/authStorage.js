import { ROLES } from '../constants/roles'
import { isBranchActive } from './branchStorage'
import { getEmployeeById, isEmployeeActive } from './employeeStorage'

const STORAGE_KEY = 'spa-manager-current-user'
const LEGACY_STORAGE_KEY = 'spa-manager-current-user'

export function validateUserSession(user) {
  if (!user?.role || user.branch === undefined || user.branch === null) return null

  if (user.role === ROLES.ADMIN) {
    return user.branch === 'all' ? user : null
  }

  if (!user.branch || !isBranchActive(user.branch)) return null

  if (user.role === ROLES.EMPLOYEE) {
    if (!user.employeeId) return null
    const employee = getEmployeeById(user.employeeId)
    if (!employee || employee.branchId !== user.branch || !isEmployeeActive(employee)) {
      return null
    }
  }

  return user
}

export function loadCurrentUser() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return validateUserSession(data)
  } catch {
    return null
  }
}

export function saveCurrentUser(user) {
  const validated = validateUserSession(user) ?? user
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validated))
  localStorage.removeItem(LEGACY_STORAGE_KEY)
  return validated
}

export function clearCurrentUser() {
  sessionStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LEGACY_STORAGE_KEY)
}

export function clearLegacySession() {
  localStorage.removeItem(LEGACY_STORAGE_KEY)
}
