import { isAdmin, isBranchManager, isEmployee, getCurrentUserBranch } from '../../constants/auth'

/** Admin + Manager full OW; Employee read-only own slice. */
export function canAccessOperationWorkflow() {
  return isAdmin() || isBranchManager() || isEmployee()
}

export function canManageOperationWorkflow() {
  return isAdmin() || isBranchManager()
}

export function getOperationWorkflowScopeBranchId(selectedBranchId = '') {
  if (isAdmin()) return selectedBranchId || ''
  return getCurrentUserBranch() || ''
}
