import { ROLES } from '../constants/roles'
import { loadBranches } from '../constants/branches'
import { loadCredentials } from './credentialsStorage'
import { isEmployeeLoginEligible, loadEmployees } from './employeeStorage'
import { branchManagerUsername } from '../login/loginRules'
import { resolveLoginUsername, normalizeLoginUsernameInput } from '../login/loginResolver'

export { resolveLoginUsername, normalizeLoginUsernameInput as normalizeUsername }

/** Liệt kê username trùng trong credentials đã lưu. */
export function findDuplicateLoginUsernames() {
  const buckets = new Map()

  const add = (username, entry) => {
    const key = normalizeLoginUsernameInput(username)
    if (!key) return
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(entry)
  }

  add('admin', { type: 'admin', accountKey: 'admin', label: 'Admin' })

  for (const branch of loadBranches()) {
    add(branchManagerUsername(branch.id), {
      type: 'branch_manager',
      accountKey: branch.id,
      label: `QL ${branch.name}`,
      branchId: branch.id,
    })
  }

  const credentials = loadCredentials()
  for (const employee of loadEmployees().filter(isEmployeeLoginEligible)) {
    const stored = credentials.employees?.[employee.id]?.loginUsername
    if (!stored) continue
    add(stored, {
      type: 'employee',
      accountKey: `employee:${employee.id}`,
      label: employee.name || employee.id,
      employeeId: employee.id,
      branchId: employee.branchId,
    })
  }

  return [...buckets.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([username, entries]) => ({ username, entries }))
}

/** @deprecated Dùng resolveLoginUsername từ login/loginResolver.js */
export function resolveLoginAccount(usernameInput) {
  const credentials = loadCredentials()
  const employeesById = new Map(loadEmployees().map((employee) => [employee.id, employee]))
  const resolved = resolveLoginUsername(usernameInput, credentials, employeesById)
  if (!resolved.ok) return resolved

  if (resolved.role === ROLES.ADMIN) {
    return {
      ok: true,
      role: ROLES.ADMIN,
      accountKey: 'admin',
      branch: 'all',
    }
  }

  if (resolved.role === ROLES.BRANCH_MANAGER) {
    return {
      ok: true,
      role: ROLES.BRANCH_MANAGER,
      accountKey: resolved.accountKey,
      branch: resolved.branchId,
    }
  }

  return {
    ok: true,
    role: ROLES.EMPLOYEE,
    accountKey: resolved.accountKey,
    branch: resolved.branchId,
    employeeId: resolved.employeeId,
    employeeName: resolved.employeeName,
  }
}
