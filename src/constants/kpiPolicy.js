/** Scope + default targets. Decimal 0–1. Không gồm Gia Lai. */

export const KPI_SCOPE_BRANCH_IDS = [
  'tram-spa',
  'soc-trang',
  'song-khoe-spa',
  'bac-lieu',
  'tra-vinh',
  'vinh-long',
]

export const KPI_EXCLUDED_BRANCH_IDS = ['gia-lai-1', 'gia-lai-2']

export const KPI_GROUPS = {
  MAIN: 'MAIN',
  COMBO: 'COMBO',
  ADVANCED: 'ADVANCED',
  ADDON: 'ADDON',
  UNMAPPED: 'UNMAPPED',
}

export const KPI_STATUS = {
  MET: 'MET',
  NOT_MET: 'NOT_MET',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
}

export const DEFAULT_KPI_TARGETS = {
  addon: 0.7,
  advanced: 0.1,
  combo: 0.3,
  requested: 0.2,
}

export const KPI_POLICY_STATUS = {
  ACTIVE: 'active',
  SUPERSEDED: 'superseded',
}

export function isKpiScopeBranch(branchId) {
  return KPI_SCOPE_BRANCH_IDS.includes(String(branchId || ''))
}

export function isKpiExcludedBranch(branchId) {
  return KPI_EXCLUDED_BRANCH_IDS.includes(String(branchId || ''))
}
