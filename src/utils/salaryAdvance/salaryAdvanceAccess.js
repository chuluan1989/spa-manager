import { ROLES } from '../../constants/roles'
import { isAdmin, isEmployee, getCurrentUserBranch } from '../../constants/auth'
import { canAddExpense, canEditExpense, canDeleteExpense } from '../../constants/auth'
import { isEmployeeInBranch } from '../employeeStorage'

export function canAddSalaryAdvance(role, branchId) {
  if (isEmployee()) return false
  return canAddExpense(role, branchId)
}

export function canEditSalaryAdvance(role, branchId) {
  if (isEmployee()) return false
  return canEditExpense(role, branchId)
}

export function canDeleteSalaryAdvance(role, branchId) {
  return canDeleteExpense(role, branchId)
}

export function canViewSalaryAdvanceAudit(role) {
  return isAdmin() || role === ROLES.BRANCH_MANAGER
}

export function assertSalaryAdvanceEmployeeScope(employeeId, employeeBranchId, managerBranchId = getCurrentUserBranch()) {
  if (isAdmin()) return true
  if (!employeeId) throw new Error('Vui lòng chọn nhân viên.')
  if (!isEmployeeInBranch(employeeId, managerBranchId)) {
    throw new Error('Chỉ được gán ứng lương cho nhân viên thuộc chi nhánh bạn quản lý.')
  }
  if (employeeBranchId && employeeBranchId !== managerBranchId) {
    throw new Error('Nhân viên không thuộc chi nhánh đã chọn.')
  }
  return true
}
