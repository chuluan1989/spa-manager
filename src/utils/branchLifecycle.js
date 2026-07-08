import { canDeleteBranch } from './branchDeleteGuard'
import { loadBranches, saveBranches } from './branchStorage'
import { removeBranchCredential } from './credentialsStorage'
import { removeAccountMetadataEntry } from './accountMetadataStorage'
import { removeBranchPermissionsEntry } from './permissionsStorage'

export function deleteBranch(branchId) {
  const check = canDeleteBranch(branchId)
  if (!check.allowed) {
    return { success: false, error: check.reason }
  }

  const branches = loadBranches()
  const next = branches.filter((branch) => branch.id !== branchId)
  if (next.length === branches.length) {
    return { success: false, error: 'Không tìm thấy chi nhánh.' }
  }

  saveBranches(next)
  removeBranchCredential(branchId)
  removeBranchPermissionsEntry(branchId)
  removeAccountMetadataEntry(branchId)
  return { success: true }
}
