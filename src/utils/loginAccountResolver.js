import { ROLES } from '../constants/roles'
import { loadBranches } from '../constants/branches'
import { getEmployeeById, isEmployeeActive, isEmployeeLoginEligible, loadEmployees } from './employeeStorage'
import { loadCredentials } from './credentialsStorage'

function normalizeUsername(value) {
  return String(value ?? '').trim()
}

/**
 * Liệt kê xung đột username (cùng chuỗi đăng nhập map nhiều tài khoản).
 * Username NV = employee.id; QL CN = branch.id; Admin = admin.
 */
export function findDuplicateLoginUsernames() {
  const buckets = new Map()

  const add = (username, entry) => {
    const key = normalizeUsername(username)
    if (!key) return
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(entry)
  }

  add('admin', { type: 'admin', accountKey: 'admin', label: 'Admin' })

  for (const branch of loadBranches()) {
    add(branch.id, {
      type: 'branch_manager',
      accountKey: branch.id,
      label: `QL ${branch.name}`,
      branchId: branch.id,
    })
  }

  for (const employee of loadEmployees().filter(isEmployeeLoginEligible)) {
    add(employee.id, {
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

export function resolveLoginAccount(usernameInput) {
  const username = normalizeUsername(usernameInput)
  if (!username) {
    return { ok: false, field: 'username', message: 'Vui lòng nhập tên đăng nhập' }
  }

  if (username === 'admin') {
    return {
      ok: true,
      role: ROLES.ADMIN,
      accountKey: 'admin',
      branch: 'all',
    }
  }

  const branch = loadBranches().find((item) => item.id === username)
  const employee = getEmployeeById(username)
  const employeeEligible = employee && isEmployeeLoginEligible(employee)

  if (branch && employeeEligible) {
    return {
      ok: false,
      field: 'username',
      message: 'Tên đăng nhập trùng giữa quản lý chi nhánh và nhân viên. Liên hệ Admin để chuẩn hóa.',
    }
  }

  if (branch) {
    return {
      ok: true,
      role: ROLES.BRANCH_MANAGER,
      accountKey: branch.id,
      branch: branch.id,
    }
  }

  if (employeeEligible) {
    if (!isEmployeeActive(employee)) {
      return { ok: false, field: 'password', message: 'Sai tên đăng nhập hoặc mật khẩu' }
    }
    const credBranchId = loadCredentials().employees?.[employee.id]?.branchId
    const branchId = employee.branchId || credBranchId || ''
    return {
      ok: true,
      role: ROLES.EMPLOYEE,
      accountKey: `employee:${employee.id}`,
      branch: branchId,
      employeeId: employee.id,
      employeeName: employee.name,
    }
  }

  return { ok: false, field: 'password', message: 'Sai tên đăng nhập hoặc mật khẩu' }
}
