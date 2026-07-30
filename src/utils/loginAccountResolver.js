import { ROLES } from '../constants/roles'
import { resolveCanonicalBranchId } from '../constants/canonicalBranches'
import { loadBranches } from '../constants/branches'
import {
  getEmployeeById,
  isEmployeeActive,
  isEmployeeLoginEligible,
  loadEmployees,
} from './employeeStorage'
import { loadCredentials } from './credentialsStorage'
import {
  computeBranchManagerLoginUsername,
  computeEmployeeLoginUsername,
  findBranchByManagerLoginUsername,
  findEmployeeByLoginUsername,
  getEmployeeLoginUsername,
} from './loginUsername'

function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase()
}

/**
 * Liệt kê xung đột username (cùng chuỗi đăng nhập map nhiều tài khoản).
 * Username NV = họ tên chuẩn hóa; QL CN = branch slug (tramspa); Admin = admin.
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
    add(computeBranchManagerLoginUsername(branch.id), {
      type: 'branch_manager',
      accountKey: branch.id,
      label: `QL ${branch.name}`,
      branchId: branch.id,
    })
    add(branch.id, {
      type: 'branch_manager_legacy',
      accountKey: branch.id,
      label: `QL ${branch.name} (legacy id)`,
      branchId: branch.id,
    })
  }

  for (const employee of loadEmployees().filter(isEmployeeLoginEligible)) {
    add(getEmployeeLoginUsername(employee), {
      type: 'employee',
      accountKey: `employee:${employee.id}`,
      label: employee.name || employee.id,
      employeeId: employee.id,
      branchId: employee.branchId,
    })
    if (employee.id !== getEmployeeLoginUsername(employee)) {
      add(employee.id, {
        type: 'employee_legacy_id',
        accountKey: `employee:${employee.id}`,
        label: `${employee.name} (legacy id)`,
        employeeId: employee.id,
      })
    }
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

  const branch = findBranchByManagerLoginUsername(username)
  const employeeLookup = findEmployeeByLoginUsername(username)
  if (employeeLookup?.conflict) {
    return {
      ok: false,
      field: 'username',
      message: 'Tên đăng nhập trùng nhiều nhân viên. Liên hệ Admin để chuẩn hóa.',
    }
  }
  const employee = employeeLookup && !employeeLookup.conflict ? employeeLookup : null
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
      branch: resolveCanonicalBranchId(branch.id),
    }
  }

  if (employeeEligible) {
    if (!isEmployeeActive(employee)) {
      return { ok: false, field: 'password', message: 'Sai tên đăng nhập hoặc mật khẩu' }
    }
    const credBranchId = loadCredentials().employees?.[employee.id]?.branchId
    const sessionBranch = resolveCanonicalBranchId(employee.branchId || credBranchId || '')
    return {
      ok: true,
      role: ROLES.EMPLOYEE,
      accountKey: `employee:${employee.id}`,
      branch: sessionBranch,
      employeeId: employee.id,
      employeeName: employee.name,
    }
  }

  return { ok: false, field: 'password', message: 'Sai tên đăng nhập hoặc mật khẩu' }
}
