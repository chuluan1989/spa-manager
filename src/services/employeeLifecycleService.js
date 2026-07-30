/**
 * Employee Lifecycle V1 — orchestrates create, login account, transfer, resign, reactivate.
 *
 * Rules:
 * - Create: Employee + app_credentials + username + default password + active status
 * - Transfer: only Current Branch + Branch History (+ credential branchId meta)
 * - Resign: status only, remove credential, preserve all history records
 * - Reactivate: restore status + re-provision credential
 *
 * @see docs/employee-lifecycle-v1.md
 */

import { ROLES } from '../constants/roles'
import {
  computeEmployeeDefaultPasswordFromUsername,
  getEmployeeLoginUsername,
} from '../utils/loginUsername'
import {
  syncEmployeeCredentialForEmployee,
  removeEmployeeCredential,
  loadCredentials,
} from '../utils/credentialsStorage'
import {
  addEmployee,
  transferEmployee,
  setEmployeeStatus,
  EMPLOYEE_STATUS,
  getEmployeeById,
} from '../utils/employeeStorage'

function buildAccountSummary(employee) {
  const branchId = employee.branchId ?? ''
  const username = getEmployeeLoginUsername(employee)
  const defaultPassword = computeEmployeeDefaultPasswordFromUsername(employee.name, branchId)
  const entry = loadCredentials().employees?.[employee.id]
  return {
    username,
    role: ROLES.EMPLOYEE,
    branchId,
    defaultPassword,
    canLogin: employee.status === EMPLOYEE_STATUS.ACTIVE,
    mustChangePassword: !entry?.customPassword,
  }
}

/**
 * I. Create employee with full login account — ready to sign in immediately.
 */
export async function createEmployeeWithAccount(data) {
  const result = await addEmployee(data)
  if (!result.success || !result.employee) {
    return result
  }

  try {
    await syncEmployeeCredentialForEmployee(result.employee.id)
  } catch (error) {
    return {
      success: false,
      error: `Đã lưu nhân viên nhưng không tạo được tài khoản đăng nhập: ${error?.message ?? 'Lỗi không xác định'}`,
      employee: result.employee,
    }
  }

  const refreshed = getEmployeeById(result.employee.id) ?? result.employee
  return {
    success: true,
    employee: refreshed,
    account: buildAccountSummary(refreshed),
  }
}

/**
 * III. Transfer — only Current Branch + Branch History (via employeeStorage.transferEmployee).
 * Does NOT mutate historical invoice/attendance/payroll record branches.
 */
export async function transferEmployeeLifecycle(employeeId, newBranchId, options = {}) {
  const result = await transferEmployee(employeeId, newBranchId, options)
  if (!result.success) return result

  const employee = result.employee ?? getEmployeeById(employeeId)
  return {
    ...result,
    employee,
    account: employee ? buildAccountSummary(employee) : null,
    note: 'Record Branch của hóa đơn/chấm công/lương cũ không bị thay đổi.',
  }
}

/**
 * V. Resign — inactive status, remove credential, keep all data.
 */
export async function resignEmployee(employeeId, options = {}) {
  const result = await setEmployeeStatus(employeeId, EMPLOYEE_STATUS.RESIGNED, options)
  if (result.success) {
    removeEmployeeCredential(employeeId)
  }
  return result
}

/**
 * VI. Reactivate — restore active status + re-provision login account.
 */
export async function reactivateEmployee(employeeId, options = {}) {
  const result = await setEmployeeStatus(employeeId, EMPLOYEE_STATUS.ACTIVE, options)
  if (!result.success) return result

  try {
    await syncEmployeeCredentialForEmployee(employeeId)
  } catch (error) {
    return {
      success: false,
      error: `Đã kích hoạt nhưng không tạo lại tài khoản: ${error?.message ?? 'Lỗi không xác định'}`,
      employee: result.employee,
    }
  }

  const employee = result.employee ?? getEmployeeById(employeeId)
  return {
    ...result,
    employee,
    account: employee ? buildAccountSummary(employee) : null,
  }
}

/** Read-only account info for Admin UI after save. */
export function getEmployeeAccountSummary(employeeId) {
  const employee = getEmployeeById(employeeId)
  if (!employee) return null
  return buildAccountSummary(employee)
}
