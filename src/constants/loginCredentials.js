import { ADMIN_BRANCH, ROLES } from './roles'
import { verifyAdminPassword, verifyBranchPassword, verifyEmployeePassword } from '../utils/credentialsStorage'
import { getBranchName, isBranchActive } from '../utils/branchStorage'
import { getEmployeeById, isEmployeeActive } from '../utils/employeeStorage'
import { isAccountLocked, recordAccountLogin } from '../utils/accountMetadataStorage'

export { ADMIN_BRANCH }

function normalizeForPassword(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

/** Tên chi nhánh dùng để tạo mật khẩu không bao gồm chữ "spa" ở cuối. */
function getPasswordBranchName(branchName) {
  return String(branchName ?? '').replace(/\s*spa\s*$/i, '').trim()
}

/**
 * Mật khẩu mặc định của nhân viên = tên nhân viên + tên chi nhánh,
 * viết liền, không dấu, chữ thường, không ký tự đặc biệt, không thêm chữ "spa".
 */
export function computeEmployeeDefaultPassword(employeeName, branchName) {
  return (
    normalizeForPassword(employeeName)
    + normalizeForPassword(getPasswordBranchName(branchName))
  )
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
    if (!employee || employee.branchId !== branch || !isEmployeeActive(employee)) {
      return { ok: false, field: 'employeeId', message: 'Nhân viên không hợp lệ' }
    }
    const expectedPassword = computeEmployeeDefaultPassword(
      employee.name,
      getBranchName(employee.branchId),
    )
    const inputPassword = password.trim().toLowerCase()
    const storedOk = await verifyEmployeePassword(employeeId, password)
    const computedOk = Boolean(expectedPassword) && inputPassword === expectedPassword
    if (!storedOk && !computedOk) {
      return { ok: false, field: 'password', message: 'Sai mật khẩu' }
    }
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
