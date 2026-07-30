import { getPasswordBranchName, resolveCanonicalBranchId } from '../constants/canonicalBranches'
import { getEmployeeById, isEmployeeLoginEligible, loadEmployees } from './employeeStorage'
import { loadBranches } from '../constants/branches'
import { loadCredentials } from './credentialsStorage'

export function normalizeForPassword(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

/** Username NV = họ tên chuẩn hóa: "Hồng Thương" → hongthuong */
export function computeEmployeeLoginUsername(employeeName) {
  return normalizeForPassword(employeeName)
}

/** Username QL CN = branch slug không dấu gạch: tram-spa → tramspa */
export function computeBranchManagerLoginUsername(branchId) {
  return normalizeForPassword(String(branchId ?? '').replace(/-/g, ''))
}

/** Mật khẩu mặc định NV = username đã cấp + tên chi nhánh (chuẩn hóa). */
export function computeEmployeeDefaultPasswordFromUsername(loginUsername, branchId) {
  const username = normalizeForPassword(loginUsername)
  const branchPart = normalizeForPassword(getPasswordBranchName(resolveCanonicalBranchId(branchId)))
  return username + branchPart
}

/** @deprecated Dùng computeEmployeeDefaultPasswordFromUsername với username đã lưu */
export function computeEmployeeDefaultPasswordFromProfile(employeeName, branchId) {
  return computeEmployeeDefaultPasswordFromUsername(
    computeEmployeeLoginUsername(employeeName),
    branchId,
  )
}

/** Mật khẩu mặc định QL CN = username + "123". */
export function computeBranchManagerDefaultPassword(branchId) {
  return `${computeBranchManagerLoginUsername(branchId)}123`
}

export function getStoredEmployeeLoginUsername(employeeId) {
  if (!employeeId) return ''
  const credentials = loadCredentials()
  return credentials.employees?.[employeeId]?.loginUsername
    || credentials.loginUsernameRegistry?.[employeeId]
    || ''
}

/** Thu thập username đã dùng (trừ excludeEmployeeId khi Admin đổi username). */
export function collectReservedLoginUsernames(excludeEmployeeId = null) {
  const used = new Set(['admin'])

  for (const branch of loadBranches()) {
    used.add(computeBranchManagerLoginUsername(branch.id))
    used.add(String(branch.id ?? '').toLowerCase())
  }

  const credentials = loadCredentials()
  for (const [employeeId, entry] of Object.entries(credentials.employees ?? {})) {
    if (employeeId === excludeEmployeeId) continue
    const username = entry?.loginUsername
    if (username) used.add(String(username).toLowerCase())
  }
  for (const [employeeId, username] of Object.entries(credentials.loginUsernameRegistry ?? {})) {
    if (employeeId === excludeEmployeeId) continue
    if (username) used.add(String(username).toLowerCase())
  }

  return used
}

export function isEmployeeLoginUsernameAvailable(username, excludeEmployeeId = null) {
  const key = normalizeForPassword(username)
  if (!key || key.length < 2) return false
  if (key === 'admin') return false
  return !collectReservedLoginUsernames(excludeEmployeeId).has(key)
}

/**
 * Cấp username khi tạo tài khoản — tự thêm hậu tố số nếu trùng: thuyan, thuyan2, thuyan3...
 */
export function allocateEmployeeLoginUsername(employeeName, excludeEmployeeId = null) {
  const used = collectReservedLoginUsernames(excludeEmployeeId)
  const base = computeEmployeeLoginUsername(employeeName)
  if (!base) return ''
  if (!used.has(base)) return base

  let suffix = 2
  while (used.has(`${base}${suffix}`)) suffix += 1
  return `${base}${suffix}`
}

export function resolveEmployeeLoginUsername(employee) {
  if (!employee?.id) return ''
  const stored = getStoredEmployeeLoginUsername(employee.id)
  if (stored) return stored
  return computeEmployeeLoginUsername(employee.name)
}

export function findEmployeeByLoginUsername(usernameInput) {
  const key = String(usernameInput ?? '').trim().toLowerCase()
  if (!key) return null

  const byId = getEmployeeById(key)
  if (byId && isEmployeeLoginEligible(byId)) return byId

  const credentials = loadCredentials()
  const matches = []
  for (const employee of loadEmployees().filter(isEmployeeLoginEligible)) {
    const stored = credentials.employees?.[employee.id]?.loginUsername
      || credentials.loginUsernameRegistry?.[employee.id]
    if (stored && stored.toLowerCase() === key) matches.push(employee)
  }

  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return { conflict: true, employees: matches }
  return null
}

export function findBranchByManagerLoginUsername(usernameInput) {
  const key = String(usernameInput ?? '').trim().toLowerCase()
  if (!key) return null

  for (const branch of loadBranches()) {
    if (branch.id === key) return branch
    if (computeBranchManagerLoginUsername(branch.id) === key) return branch
  }
  return null
}

export function getEmployeeLoginUsername(employee) {
  if (!employee) return ''
  const stored = getStoredEmployeeLoginUsername(employee.id)
  if (stored) return stored
  return computeEmployeeLoginUsername(employee.name)
}

export function employeeCredentialNeedsPasswordChange(employeeId) {
  const entry = loadCredentials().employees?.[employeeId]
  return !entry?.customPassword
}

export function branchCredentialNeedsPasswordChange(branchId) {
  const meta = loadCredentials().branchPasswordMeta?.[branchId] ?? {}
  return !meta.customPassword
}
