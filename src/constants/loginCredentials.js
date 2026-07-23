import { ADMIN_BRANCH, ROLES } from './roles'
import {
  verifyAdminPassword,
  verifyBranchPassword,
  verifyEmployeePassword,
  syncEmployeeCredentialForEmployee,
  loadCredentials,
} from '../utils/credentialsStorage'
import { getPasswordBranchName, isBranchActive } from '../utils/branchStorage'
import { getEmployeeById, isEmployeeActive } from '../utils/employeeStorage'
import { isAccountLocked, isEmployeeAccountLocked, recordAccountLogin } from '../utils/accountMetadataStorage'

export { ADMIN_BRANCH }

const EMPLOYEE_NOT_FOUND_MESSAGE = 'Nhân viên không tồn tại.'
const EMPLOYEE_LOGIN_FAIL_MESSAGE = 'Sai chi nhánh, tên hoặc mật khẩu.'

export function normalizeForPassword(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Mật khẩu mặc định = tên nhân viên + tên chi nhánh,
 * viết liền, không dấu, chữ thường, không ký tự đặc biệt.
 */
export function computeEmployeeDefaultPassword(employeeName, branchName) {
  return normalizeForPassword(employeeName) + normalizeForPassword(branchName)
}

export async function verifyLogin({ role, branch, employeeId, password }) {
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
    if (!branch) {
      return { ok: false, field: 'branch', message: 'Vui lòng chọn chi nhánh' }
    }
    if (!isBranchActive(branch)) {
      return { ok: false, field: 'branch', message: 'Chi nhánh đang tạm khóa' }
    }
    if (isAccountLocked(branch)) {
      return { ok: false, field: 'password', message: 'Tài khoản quản lý chi nhánh đang bị khóa' }
    }
    if (!(await verifyBranchPassword(branch, password))) {
      return { ok: false, field: 'password', message: 'Sai mật khẩu' }
    }
    recordAccountLogin(branch)
    return { ok: true, user: { role: ROLES.BRANCH_MANAGER, branch } }
  }

  if (role === ROLES.EMPLOYEE) {
    if (!branch) {
      return { ok: false, field: 'branch', message: 'Vui lòng chọn chi nhánh' }
    }
    if (!employeeId) {
      return { ok: false, field: 'employeeId', message: 'Vui lòng chọn nhân viên' }
    }
    if (!isBranchActive(branch)) {
      return { ok: false, field: 'branch', message: 'Chi nhánh đang tạm khóa' }
    }

    const employee = getEmployeeById(employeeId)
    if (!employee) {
      return { ok: false, field: 'employeeId', message: EMPLOYEE_NOT_FOUND_MESSAGE }
    }
    if (employee.branchId !== branch) {
      return { ok: false, field: 'branch', message: EMPLOYEE_LOGIN_FAIL_MESSAGE }
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

    const expectedPassword = computeEmployeeDefaultPassword(
      employee.name,
      getPasswordBranchName(employee.branchId),
    )
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
      && Boolean(expectedPassword)
      && inputPassword === expectedPassword

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
        branch,
        employeeId: employee.id,
        employeeName: employee.name,
      },
    }
  }

  return { ok: false, field: 'role', message: 'Vai trò không hợp lệ' }
}

export function getEmployeeCredentialKey(employeeId) {
  return `employee:${employeeId}`
}
