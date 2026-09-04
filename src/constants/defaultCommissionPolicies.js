import {
  BAC_LIEU_BRANCH_IDS,
  BAC_LIEU_DEFAULT_RATE,
  BAC_LIEU_SPECIAL_RATE,
  BAC_LIEU_SPECIAL_SERVICE_IDS,
  BAC_LIEU_SPECIAL_SERVICE_NAMES,
  COMMISSION_POLICY_TYPE,
  FLAT_20_BRANCH_IDS,
  FLAT_40_BRANCH_IDS,
  TIERED_COMMISSION_BRANCH_IDS,
  TIERED_TEN_SERVICE_IDS,
  TIERED_TEN_SERVICE_NAMES,
  TIERED_TWENTY_SERVICE_IDS,
  TIERED_TWENTY_SERVICE_NAMES,
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
    {
      id: 'rate-20',
      label: '20%',
      rate: 20,
      serviceIds: [...TIERED_TWENTY_SERVICE_IDS],
      serviceNames: [...TIERED_TWENTY_SERVICE_NAMES],
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

/** Bạc Liêu: mặc định 20%, riêng Chuyên sâu 30%. */
function buildBacLieuPolicy(branchId) {
  return {
    branchId,
    policyType: COMMISSION_POLICY_TYPE.TIERED,
    flatRate: null,
    defaultRate: BAC_LIEU_DEFAULT_RATE,
    groups: [
      {
        id: 'rate-30-chuyen-sau',
        label: '30% Chuyên sâu',
        rate: BAC_LIEU_SPECIAL_RATE,
        serviceIds: [...BAC_LIEU_SPECIAL_SERVICE_IDS],
        serviceNames: [...BAC_LIEU_SPECIAL_SERVICE_NAMES],
      },
    ],
    updatedAt: new Date().toISOString(),
  }
}

export function buildDefaultCommissionPolicy(branchId) {
  if (FLAT_40_BRANCH_IDS.includes(branchId)) {
    return buildFlatPolicy(branchId, 40)
  }
  if (BAC_LIEU_BRANCH_IDS.includes(branchId)) {
    return buildBacLieuPolicy(branchId)
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
