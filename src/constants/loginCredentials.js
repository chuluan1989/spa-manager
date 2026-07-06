import { ADMIN_BRANCH, ROLES } from './roles'
import { verifyAdminPassword, verifyBranchPassword } from '../utils/credentialsStorage'
import { isBranchActive } from '../utils/branchStorage'
import { getEmployeeById, isEmployeeActive } from '../utils/employeeStorage'

export { ADMIN_BRANCH }

export async function verifyLogin({ role, branch, employeeId, password }) {
  if (!role) {
    return { ok: false, field: 'role', message: 'Vui lòng chọn vai trò' }
  }

  if (!password?.trim()) {
    return { ok: false, field: 'password', message: 'Vui lòng nhập mật khẩu' }
  }

  if (role === ROLES.ADMIN) {
    if (!(await verifyAdminPassword(password))) {
      return { ok: false, field: 'password', message: 'Sai mật khẩu' }
    }
    return { ok: true, user: { role: ROLES.ADMIN, branch: ADMIN_BRANCH } }
  }

  if (role === ROLES.BRANCH_MANAGER) {
    if (!branch) {
      return { ok: false, field: 'branch', message: 'Vui lòng chọn chi nhánh' }
    }
    if (!isBranchActive(branch)) {
      return { ok: false, field: 'branch', message: 'Chi nhánh đang tạm khóa' }
    }
    if (!(await verifyBranchPassword(branch, password))) {
      return { ok: false, field: 'password', message: 'Sai mật khẩu' }
    }
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
    if (!(await verifyBranchPassword(branch, password))) {
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
