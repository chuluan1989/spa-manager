import { resolveCanonicalBranchId } from '../constants/canonicalBranches'
import { EMPLOYEE_STATUS } from './employeeStorage'

export function employeeBelongsToBranch(employee, branchId) {
  if (!branchId) return true
  if (!employee?.branchId) return false
  return resolveCanonicalBranchId(employee.branchId) === resolveCanonicalBranchId(branchId)
}

export function recordBelongsToBranch(record, branchId) {
  if (!branchId) return true
  return resolveCanonicalBranchId(record?.branchId ?? '') === resolveCanonicalBranchId(branchId)
}

/** Nhân viên hiển thị trong bảng lương (mặc định: đang làm + nghỉ phép). */
export function isPayrollListEmployee(employee, statusFilter = '') {
  const status = employee?.status ?? EMPLOYEE_STATUS.ACTIVE
  if (statusFilter === 'all') return true
  if (statusFilter === EMPLOYEE_STATUS.RESIGNED || statusFilter === 'inactive') {
    return status === EMPLOYEE_STATUS.RESIGNED
  }
  if (statusFilter === EMPLOYEE_STATUS.ARCHIVED) return status === EMPLOYEE_STATUS.ARCHIVED
  if (statusFilter === EMPLOYEE_STATUS.ON_LEAVE) return status === EMPLOYEE_STATUS.ON_LEAVE
  if (statusFilter) return status === statusFilter
  return status === EMPLOYEE_STATUS.ACTIVE || status === EMPLOYEE_STATUS.ON_LEAVE
}

export function countEmployeesForBranch(employees, branchId, { includeArchived = false } = {}) {
  return employees.filter((emp) => {
    if (!employeeBelongsToBranch(emp, branchId)) return false
    if (!includeArchived && emp.status === EMPLOYEE_STATUS.ARCHIVED) return false
    return true
  }).length
}
