import { ROLES } from '../constants/roles'
import { resolveCanonicalBranchId } from '../constants/canonicalBranches'
import { loadBranches } from '../constants/branches'
import { isEmployeeActive, isEmployeeLoginEligible } from '../utils/employeeStorage'
import { branchManagerUsername } from './loginRules'

export function normalizeLoginUsernameInput(value) {
  return String(value ?? '').trim().toLowerCase()
}

/**
 * Resolve username → tài khoản. Chỉ khớp username chính thức đã lưu trong credentials.
 * Không legacy id, không fallback theo tên.
 */
export function resolveLoginUsername(usernameInput, credentials, employeesById) {
  const key = normalizeLoginUsernameInput(usernameInput)
  if (!key) {
    return { ok: false, field: 'username', message: 'Vui lòng nhập tên đăng nhập' }
  }

  if (key === 'admin') {
    return { ok: true, role: ROLES.ADMIN, accountKey: 'admin' }
  }

  for (const branch of loadBranches()) {
    if (branchManagerUsername(branch.id) === key) {
      return {
        ok: true,
        role: ROLES.BRANCH_MANAGER,
        accountKey: branch.id,
        branchId: resolveCanonicalBranchId(branch.id),
        username: key,
      }
    }
  }

  const matches = []
  for (const [employeeId, entry] of Object.entries(credentials?.employees ?? {})) {
    const stored = String(entry?.loginUsername ?? '').trim().toLowerCase()
    if (!stored || stored !== key) continue
    const employee = employeesById.get(employeeId)
    if (!employee || !isEmployeeLoginEligible(employee)) continue
    matches.push({ employeeId, employee, entry })
  }

  if (matches.length > 1) {
    return {
      ok: false,
      field: 'username',
      message: 'Username trùng nhiều tài khoản. Admin cần chạy "Cập nhật toàn bộ tài khoản".',
    }
  }

  if (matches.length === 1) {
    const { employeeId, employee } = matches[0]
    if (!isEmployeeActive(employee)) {
      return { ok: false, field: 'password', message: 'Sai tên đăng nhập hoặc mật khẩu' }
    }
    return {
      ok: true,
      role: ROLES.EMPLOYEE,
      accountKey: `employee:${employeeId}`,
      employeeId,
      employeeName: employee.name,
      branchId: resolveCanonicalBranchId(employee.branchId),
      username: key,
    }
  }

  return { ok: false, field: 'password', message: 'Sai tên đăng nhập hoặc mật khẩu' }
}
