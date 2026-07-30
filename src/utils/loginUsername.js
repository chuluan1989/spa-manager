/** @deprecated Dùng normalizeLoginText từ login/loginRules.js */
export { normalizeLoginText as normalizeForPassword } from '../login/loginRules'

export {
  branchManagerUsername as computeBranchManagerLoginUsername,
  branchManagerDefaultPassword as computeBranchManagerDefaultPassword,
  employeeUsernameFromName as computeEmployeeLoginUsername,
  employeeDefaultPassword as computeEmployeeDefaultPasswordFromUsername,
  employeeDefaultPassword as computeEmployeeDefaultPasswordFromProfile,
  assignEmployeeUsernames,
} from '../login/loginRules'

import { loadBranches } from '../constants/branches'
import { loadCredentials } from './credentialsStorage'
import {
  assignEmployeeUsernames,
  branchManagerUsername,
  employeeUsernameFromName,
} from '../login/loginRules'
import { isEmployeeLoginEligible, loadEmployees } from './employeeStorage'

export function getStoredEmployeeLoginUsername(employeeId) {
  if (!employeeId) return ''
  return loadCredentials().employees?.[employeeId]?.loginUsername ?? ''
}

export function collectReservedLoginUsernames(excludeEmployeeId = null) {
  const used = new Set(['admin'])
  for (const branch of loadBranches()) {
    used.add(branchManagerUsername(branch.id))
  }
  for (const [employeeId, entry] of Object.entries(loadCredentials().employees ?? {})) {
    if (employeeId === excludeEmployeeId) continue
    const username = entry?.loginUsername
    if (username) used.add(String(username).toLowerCase())
  }
  return used
}

export function isEmployeeLoginUsernameAvailable(username, excludeEmployeeId = null) {
  const key = employeeUsernameFromName(username)
  if (!key || key.length < 2) return false
  if (key === 'admin') return false
  return !collectReservedLoginUsernames(excludeEmployeeId).has(key)
}

/** Cấp username duy nhất khi tạo tài khoản mới. */
export function allocateEmployeeLoginUsername(employeeName, excludeEmployeeId = null) {
  const eligible = loadEmployees().filter(isEmployeeLoginEligible)
  const { usernames } = assignEmployeeUsernames(eligible)
  if (excludeEmployeeId && usernames.has(excludeEmployeeId)) {
    return usernames.get(excludeEmployeeId)
  }

  const base = employeeUsernameFromName(employeeName)
  const used = collectReservedLoginUsernames(excludeEmployeeId)
  if (!base) return ''
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}${suffix}`)) suffix += 1
  return `${base}${suffix}`
}

/** Username đã lưu trong credentials — không suy ra từ tên hồ sơ. */
export function getEmployeeLoginUsername(employee) {
  if (!employee?.id) return ''
  return getStoredEmployeeLoginUsername(employee.id)
}

export function employeeCredentialNeedsPasswordChange(employeeId) {
  const entry = loadCredentials().employees?.[employeeId]
  return !entry?.customPassword
}

export function branchCredentialNeedsPasswordChange(branchId) {
  const meta = loadCredentials().branchPasswordMeta?.[branchId] ?? {}
  return !meta.customPassword
}
