import {
  COMMISSION_POLICY_TYPE,
  FLAT_20_BRANCH_IDS,
  FLAT_40_BRANCH_IDS,
  TIERED_COMMISSION_BRANCH_IDS,
  TIERED_TEN_SERVICE_IDS,
  TIERED_TEN_SERVICE_NAMES,
  TIERED_ZERO_SERVICE_IDS,
  TIERED_ZERO_SERVICE_NAMES,
} from './commissionPolicyTypes'

function buildTieredGroups() {
  return [
    {
      id: 'rate-0',
      label: '0%',
      rate: 0,
      serviceIds: [...TIERED_ZERO_SERVICE_IDS],
      serviceNames: [...TIERED_ZERO_SERVICE_NAMES],
    },
    {
      id: 'rate-10',
      label: '10%',
      rate: 10,
      serviceIds: [...TIERED_TEN_SERVICE_IDS],
      serviceNames: [...TIERED_TEN_SERVICE_NAMES],
    },
  ]
}

function buildFlatPolicy(branchId, flatRate) {
  return {
    branchId,
    policyType: COMMISSION_POLICY_TYPE.FLAT,
    flatRate,
    defaultRate: flatRate,
    groups: [],
    updatedAt: new Date().toISOString(),
  }
}

function buildTieredPolicy(branchId) {
  return {
    branchId,
    policyType: COMMISSION_POLICY_TYPE.TIERED,
    flatRate: null,
    defaultRate: 20,
    groups: buildTieredGroups(),
    updatedAt: new Date().toISOString(),
  }
}

export function buildDefaultCommissionPolicy(branchId) {
  if (FLAT_40_BRANCH_IDS.includes(branchId)) {
    return buildFlatPolicy(branchId, 40)
  }
  if (FLAT_20_BRANCH_IDS.includes(branchId)) {
    return buildFlatPolicy(branchId, 20)
  }
  if (TIERED_COMMISSION_BRANCH_IDS.includes(branchId)) {
    return buildTieredPolicy(branchId)
  }
  return buildFlatPolicy(branchId, 20)
}

export function buildDefaultCommissionPolicyMap(branchIds = []) {
  const map = {}
  for (const branchId of branchIds) {
    map[branchId] = buildDefaultCommissionPolicy(branchId)
  }
  return map
}
