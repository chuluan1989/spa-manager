export {
  loadBranches,
  getActiveBranches,
  getBranchById,
  getBranchMap,
  getBranchName,
  getSupportBranchIds,
  isSupportBranchEnabled,
  isBranchActive,
  BRANCH_STATUS,
  addBranch,
  updateBranch,
  createBranchId,
  syncMissingDefaultBranches,
  getStatusLabel as getBranchStatusLabel,
} from '../utils/branchStorage'

import { getActiveBranches, getBranchMap, getSupportBranchIds, loadBranches } from '../utils/branchStorage'

/** Danh sách chi nhánh — gọi mỗi lần render để lấy dữ liệu mới nhất */
export function getBranches() {
  return loadBranches()
}

/** Chi nhánh đang hoạt động (không bị khóa) */
export function getSelectableBranches() {
  return getActiveBranches()
}

/** @deprecated Dùng getBranchMap() */
export function getBranchMapLegacy() {
  return getBranchMap()
}

/** Tương thích ngược — trả về map động */
export function resolveBranchMap() {
  return getBranchMap()
}

/** Tương thích ngược */
export const BRANCH_MAP = new Proxy({}, {
  get(_target, prop) {
    return getBranchMap()[prop]
  },
  ownKeys() {
    return Reflect.ownKeys(getBranchMap())
  },
  getOwnPropertyDescriptor(_target, prop) {
    const value = getBranchMap()[prop]
    if (value === undefined) return undefined
    return { configurable: true, enumerable: true, value }
  },
})

export function getSupportBranchIdsList() {
  return getSupportBranchIds()
}
