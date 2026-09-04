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
  /** Có HĐ nhưng không có versioned policy cho ngày/CN — không giả DEFAULT targets. */
  NO_POLICY: 'NO_POLICY',
}

export const DEFAULT_KPI_TARGETS = {
  addon: 0.7,
  advanced: 0.1,
  combo: 0.3,
  requested: 0.2,
}

/** Policy từ 2026-09-01. duration90 chỉ có trên version này. */
export const SEP2026_KPI_TARGETS = {
  addon: 0.8,
  advanced: 0.2,
  combo: 0.3,
  requested: 0.2,
  duration90: 0.3,
}

export const KPI_DURATION90_EFFECTIVE_FROM = '2026-09-01'

/** Phạt KPI missing — hiệu lực cùng policy Sep 2026. Không áp dụng dữ liệu trước ngày này. */
export const KPI_PENALTY_EFFECTIVE_FROM = '2026-09-01'
export const KPI_PENALTY_PER_MISSING = 50_000
export const KPI_PENALTY_KEYS = ['addon', 'advanced', 'combo', 'duration90', 'requested']

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
