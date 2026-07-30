import { ADMIN_BRANCH, ROLES } from './roles'
import { resolveCanonicalBranchId } from './canonicalBranches'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchCredentials } from '../repositories/credentialsRepository'
import { fetchEmployeesForLogin } from '../repositories/employeesRepository'
import {
  verifyAdminPassword,
  verifyBranchPassword,
  verifyEmployeePassword,
  syncEmployeeCredentialForEmployee,
  loadCredentials,
  saveCredentials,
  mergeCredentialsPreservingPasswords,
  ensureCredentialsHashed,
} from '../utils/credentialsStorage'
import { getPasswordBranchName, isBranchActive } from '../utils/branchStorage'
import { getEmployeeById, isEmployeeActive, loadEmployees, normalizeEmployee, saveEmployees } from '../utils/employeeStorage'
import { isAccountLocked, isEmployeeAccountLocked, recordAccountLogin } from '../utils/accountMetadataStorage'
import { resolveLoginAccount } from '../utils/loginAccountResolver'
import {
  normalizeForPassword,
  computeEmployeeDefaultPasswordFromProfile,
  computeEmployeeDefaultPasswordFromUsername,
  computeEmployeeLoginUsername,
  employeeCredentialNeedsPasswordChange,
  branchCredentialNeedsPasswordChange,
} from '../utils/loginUsername'

export { ADMIN_BRANCH, normalizeForPassword }

const EMPLOYEE_NOT_FOUND_MESSAGE = 'Nhân viên không tồn tại.'
const EMPLOYEE_LOGIN_FAIL_MESSAGE = 'Sai chi nhánh, tên hoặc mật khẩu.'

/** @deprecated Dùng computeEmployeeDefaultPasswordFromProfile */
export function computeEmployeeDefaultPassword(employeeName, branchName) {
  return normalizeForPassword(employeeName) + normalizeForPassword(branchName)
}

function branchesMatch(employeeBranchId, sessionBranchId) {
  return resolveCanonicalBranchId(employeeBranchId) === resolveCanonicalBranchId(sessionBranchId)
}

function employeeDefaultPasswordMatches(employee, inputPassword, credEntry) {
  const branchIds = []
  if (employee.branchId) branchIds.push(employee.branchId)
  if (credEntry?.branchId && !branchIds.includes(credEntry.branchId)) {
    branchIds.push(credEntry.branchId)
  }
  const loginUsername = credEntry?.loginUsername
    || loadCredentials().loginUsernameRegistry?.[employee.id]
    || computeEmployeeLoginUsername(employee.name)
  return branchIds.some((branchId) => {
    const expected = computeEmployeeDefaultPasswordFromUsername(loginUsername, branchId)
    return Boolean(expected) && inputPassword === expected
  })
}

/** Kéo credentials + employees từ Supabase trước login nếu cache local chưa sẵn sàng. */
export async function ensureLoginDataReady() {
  if (!isSupabaseConfigured) return

  const tasks = []

  tasks.push(
    fetchCredentials()
      .then(async (remote) => {
        if (!remote) return
        await ensureCredentialsHashed()
        const local = loadCredentials()
        saveCredentials(mergeCredentialsPreservingPasswords(local, remote), { skipRemoteSync: true })
      })
      .catch((error) => {
        console.warn('[Login] Không thể tải app_credentials:', error?.message)
      }),
  )

  tasks.push(
    fetchEmployeesForLogin()
      .then((rows) => {
        if (!rows?.length) return
        const byId = new Map(loadEmployees().map((employee) => [employee.id, employee]))
        for (const row of rows) {
          const patch = normalizeEmployee(row)
          const existing = byId.get(patch.id)
          byId.set(patch.id, existing ? { ...existing, ...patch } : patch)
        }
        saveEmployees([...byId.values()])
      })
      .catch((error) => {
        console.warn('[Login] Không thể tải employees cho login:', error?.message)
      }),
  )

  await Promise.all(tasks)
}

export async function verifyLogin({
  role,
  branch,
  employeeId,
  password,
  resolvedViaUsername = false,
}) {
  if (!role) {
    return { ok: false, field: 'role', message: 'Vui lòng chọn vai trò' }
  }

  if (!password?.trim()) {
    return { ok: false, field: 'password', message: 'Vui lòng nhập mật khẩu' }
  }

  if (role === ROLES.ADMIN) {
    if (isAccountLocked('admin')) {
      return { ok: false, field: 'password', message: 'Tài khoản Admin đang bị khóa' }
    }
    if (!(await verifyAdminPassword(password))) {
      return { ok: false, field: 'password', message: 'Sai mật khẩu' }
    }
    recordAccountLogin('admin')
    return { ok: true, user: { role: ROLES.ADMIN, branch: ADMIN_BRANCH } }
  }

  if (role === ROLES.BRANCH_MANAGER) {
    const canonicalBranch = resolveCanonicalBranchId(branch)
    if (!canonicalBranch) {
      return { ok: false, field: 'branch', message: 'Vui lòng chọn chi nhánh' }
    }
    if (!isBranchActive(canonicalBranch)) {
      return { ok: false, field: 'branch', message: 'Chi nhánh đang tạm khóa' }
    }
    if (isAccountLocked(canonicalBranch)) {
      return { ok: false, field: 'password', message: 'Tài khoản quản lý chi nhánh đang bị khóa' }
    }
    if (!(await verifyBranchPassword(canonicalBranch, password))) {
      return { ok: false, field: 'password', message: 'Sai mật khẩu' }
    }
    recordAccountLogin(canonicalBranch)
    return {
      ok: true,
      user: {
        role: ROLES.BRANCH_MANAGER,
        branch: canonicalBranch,
        mustChangePassword: branchCredentialNeedsPasswordChange(canonicalBranch),
      },
    }
  }

  if (role === ROLES.EMPLOYEE) {
    if (!branch) {
      return { ok: false, field: 'branch', message: 'Vui lòng chọn chi nhánh' }
    }
    if (!employeeId) {
      return { ok: false, field: 'employeeId', message: 'Vui lòng chọn nhân viên' }
    }

    const employee = getEmployeeById(employeeId)
    if (!employee) {
      return { ok: false, field: 'employeeId', message: EMPLOYEE_NOT_FOUND_MESSAGE }
    }
    const sessionBranch = resolveCanonicalBranchId(
      resolvedViaUsername ? (employee.branchId || branch) : branch,
    )
    if (!resolvedViaUsername && !branchesMatch(employee.branchId, branch)) {
      return { ok: false, field: 'branch', message: EMPLOYEE_LOGIN_FAIL_MESSAGE }
    }
    if (!sessionBranch) {
      return { ok: false, field: 'branch', message: EMPLOYEE_LOGIN_FAIL_MESSAGE }
    }
    if (!isBranchActive(sessionBranch)) {
      return { ok: false, field: 'branch', message: 'Chi nhánh đang tạm khóa' }
    }
    if (!isEmployeeActive(employee)) {
      return { ok: false, field: 'password', message: EMPLOYEE_LOGIN_FAIL_MESSAGE }
    }
    if (isEmployeeAccountLocked(employeeId)) {
      return { ok: false, field: 'password', message: 'Tài khoản nhân viên đang bị khóa' }
    }

    try {
      await syncEmployeeCredentialForEmployee(employeeId)
    } catch {
      /* Không chặn đăng nhập — mật khẩu mặc định vẫn kiểm tra được */
    }

    const inputPassword = password.trim().toLowerCase()
    const credEntry = loadCredentials().employees?.[employeeId]
    const allowDefaultPassword = !credEntry?.customPassword
    let storedOk = false
    try {
      storedOk = await verifyEmployeePassword(employeeId, password)
    } catch {
      storedOk = false
    }
    const computedOk = allowDefaultPassword
      && employeeDefaultPasswordMatches(employee, inputPassword, credEntry)

    if (!storedOk && !computedOk) {
      return { ok: false, field: 'password', message: EMPLOYEE_LOGIN_FAIL_MESSAGE }
    }

    if (computedOk && !storedOk && allowDefaultPassword) {
      try {
        await syncEmployeeCredentialForEmployee(employeeId)
      } catch {
        /* ignore */
      }
    }

    recordAccountLogin(`employee:${employeeId}`)

    return {
      ok: true,
      user: {
        role: ROLES.EMPLOYEE,
        branch: sessionBranch,
        employeeId: employee.id,
        employeeName: employee.name,
        mustChangePassword: employeeCredentialNeedsPasswordChange(employeeId),
      },
    }
  }

  return { ok: false, field: 'role', message: 'Vai trò không hợp lệ' }
}

export function getEmployeeCredentialKey(employeeId) {
  return `employee:${employeeId}`
}

/**
 * Đăng nhập QL chi nhánh / Nhân viên bằng tên đăng nhập + mật khẩu.
 * Hệ thống tự xác định branch_id từ tài khoản — không cho chọn chi nhánh.
 */
function remapUsernameLoginError(result) {
  if (result.ok) return result
  if (result.field === 'branch' || result.field === 'employeeId') {
    return {
      ...result,
      field: result.field === 'employeeId' ? 'username' : 'password',
    }
  }
  return result
}

export async function verifyLoginWithUsername({ role, username, password }) {
  if (!role) {
    return { ok: false, field: 'role', message: 'Vui lòng chọn vai trò' }
  }
  if (role === ROLES.ADMIN) {
    return verifyLogin({ role: ROLES.ADMIN, password })
  }
  if (role !== ROLES.BRANCH_MANAGER && role !== ROLES.EMPLOYEE) {
    return { ok: false, field: 'role', message: 'Vai trò không hợp lệ' }
  }

  await ensureLoginDataReady()

  const resolved = resolveLoginAccount(username)
  if (!resolved.ok) {
    return resolved
  }
  if (resolved.role !== role) {
    return {
      ok: false,
      field: 'username',
      message: role === ROLES.BRANCH_MANAGER
        ? 'Tài khoản không phải quản lý chi nhánh'
        : 'Tài khoản không phải nhân viên',
    }
  }

  if (role === ROLES.BRANCH_MANAGER) {
    return remapUsernameLoginError(await verifyLogin({
      role,
      branch: resolved.branch,
      password,
      resolvedViaUsername: true,
    }))
  }

  return remapUsernameLoginError(await verifyLogin({
    role,
    branch: resolved.branch,
    employeeId: resolved.employeeId,
    password,
    resolvedViaUsername: true,
  }))
}
