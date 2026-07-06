import { loadBranches } from '../utils/branchStorage'
import {
  getAllPriceGroupIds,
  getPriceGroupById,
  PRICE_GROUP_IDS,
  PRICE_GROUPS,
} from './priceGroupIds'

export { getAllPriceGroupIds, getPriceGroupById, PRICE_GROUP_IDS, PRICE_GROUPS }

export function getPriceGroupIdForBranch(branchId) {
  if (!branchId) return null
  const branch = loadBranches().find((item) => item.id === branchId)
  return branch?.priceGroupId ?? null
}

export function getPriceGroupsWithBranchLabels() {
  const branches = loadBranches()
  return PRICE_GROUPS.map((group) => {
    const groupBranches = branches.filter((branch) => branch.priceGroupId === group.id)
    return {
      ...group,
      branchIds: groupBranches.map((branch) => branch.id),
      branchLabel: groupBranches.map((branch) => branch.name).join(', ') || '—',
    }
  })
}

// Backward-compatible aliases
export const PRICE_LIST_IDS = PRICE_GROUP_IDS
export const PRICE_LISTS = PRICE_GROUPS
export const getPriceListIdForBranch = getPriceGroupIdForBranch
export const getPriceListById = getPriceGroupById
export const getAllPriceListIds = getAllPriceGroupIds
