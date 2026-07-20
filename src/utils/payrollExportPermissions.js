import {
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  isAdmin,
  isBranchManager,
  isEmployee,
} from '../constants/auth'
import { employeeBelongsToBranch } from './branchEmployeeMatch'
import { getEmployeeById } from './employeeStorage'

export function assertCanExportPayrollEmployee(employeeId, branchId = '') {
  if (!employeeId) {
    throw new Error('Thiếu thông tin nhân viên để xuất đối soát lương.')
  }

  if (isAdmin()) return true

  if (isEmployee()) {
    const selfId = getCurrentUserEmployeeId()
    if (employeeId !== selfId) {
      throw new Error('Nhân viên chỉ được xuất đối soát lương của chính mình.')
    }
    return true
  }

  if (isBranchManager()) {
    const employee = getEmployeeById(employeeId)
    const userBranch = getCurrentUserBranch()
    if (!employee || !employeeBelongsToBranch(employee, userBranch)) {
      throw new Error('Quản lý chỉ được xuất đối soát nhân viên thuộc chi nhánh được gán.')
    }
    if (branchId && branchId !== userBranch && !employeeBelongsToBranch(employee, branchId)) {
      throw new Error('Quản lý chỉ được xuất đối soát chi nhánh được gán.')
    }
    return true
  }

  throw new Error('Bạn không có quyền xuất đối soát lương.')
}

export function assertCanExportPayrollBranch(branchId) {
  if (!branchId) {
    throw new Error('Thiếu chi nhánh để xuất báo cáo chi lương.')
  }

  if (isAdmin()) return true

  if (isBranchManager()) {
    const userBranch = getCurrentUserBranch()
    if (branchId !== userBranch) {
      throw new Error('Quản lý chỉ được xuất báo cáo chi lương chi nhánh được gán.')
    }
    return true
  }

  if (isEmployee()) {
    throw new Error('Nhân viên không được xuất báo cáo chi lương chi nhánh.')
  }

  throw new Error('Bạn không có quyền xuất báo cáo chi lương.')
}

export function canExportPayrollEmployee(employeeId, branchId = '') {
  try {
    assertCanExportPayrollEmployee(employeeId, branchId)
    return true
  } catch {
    return false
  }
}

export function canExportPayrollBranch(branchId) {
  try {
    assertCanExportPayrollBranch(branchId)
    return true
  } catch {
    return false
  }
}
