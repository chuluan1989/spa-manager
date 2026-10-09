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

/** Cụm 3 CN hỗ trợ nhau: Massage Thái = Chuyên sâu = ADVANCED. Không theo home exclusive. */
export const KPI_ADVANCED_EQUIVALENCE_BRANCH_IDS = [
  'tram-spa',
  'soc-trang',
  'song-khoe-spa',
]

export const KPI_TRAM_SPA_HOME_BRANCH_ID = 'tram-spa'
export const KPI_ADVANCED_TOKEN_KHOE = 'chuyen-sau'
export const KPI_ADVANCED_TOKEN_TRAM = 'massage-thai'

export function isKpiAdvancedEquivalenceBranch(branchId) {
  return KPI_ADVANCED_EQUIVALENCE_BRANCH_IDS.includes(String(branchId || ''))
}

/** TV / BL / VL: chỉ Chuyên sâu. Cụm 3 CN: Massage Thái và Chuyên sâu đều ADVANCED. */
export function isKpiAdvancedServiceToken(token, homeBranchId = '') {
  const t = String(token || '')
  if (t === KPI_ADVANCED_TOKEN_KHOE) return true
  if (t === KPI_ADVANCED_TOKEN_TRAM) return isKpiAdvancedEquivalenceBranch(homeBranchId)
  return false
}

export function resolveKpiAdvancedToken(homeBranchId) {
  return isKpiAdvancedEquivalenceBranch(homeBranchId)
    ? KPI_ADVANCED_TOKEN_TRAM
    : KPI_ADVANCED_TOKEN_KHOE
}

export function isTramSpaKpiHome(homeBranchId) {
  return String(homeBranchId || '') === KPI_TRAM_SPA_HOME_BRANCH_ID
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

/**
 * Policy KPI từ 2026-10-01 — chọn theo ngày HĐ / kỳ lương, không theo hôm nay.
 * Kỳ lương kết thúc trước ngày này giữ SEP2026_KPI_TARGETS.
 */
export const OCT2026_KPI_EFFECTIVE_FROM = '2026-10-01'
export const OCT2026_KPI_TARGETS = {
  addon: 0.8,
  advanced: 0.1,
  combo: 0.3,
  requested: 0.1,
  duration90: 0.2,
}

export const KPI_NEAR_TARGET_GAP_PP = 5
export const KPI_NEAR_TARGET_WARNING = '⚠️ Gần đạt KPI – Cần xem xét'

/** Phạt KPI missing — hiệu lực cùng policy Sep 2026. Không áp dụng dữ liệu trước ngày này. */
export const KPI_PENALTY_EFFECTIVE_FROM = '2026-09-01'
export const KPI_PENALTY_PER_MISSING = 50_000
export const KPI_PENALTY_KEYS = ['addon', 'advanced', 'combo', 'duration90', 'requested']

export function isKpiOct2026Period(dateOrPeriodTo = '') {
  return String(dateOrPeriodTo || '').slice(0, 10) >= OCT2026_KPI_EFFECTIVE_FROM
}

/**
 * Gap tính bằng điểm phần trăm (percentage points), không phải 5% của target.
 * Làm tròn nhiễu số thực (vd. 0.30 − 0.25 = 5 đúng) — không làm tròn % hiển thị.
 */
export function kpiGapPercentagePoints(target, rate) {
  const t = Number(target)
  const r = Number(rate)
  if (!Number.isFinite(t) || !Number.isFinite(r)) return null
  return Math.round((t - r) * 100 * 1e8) / 1e8
}

export function isNearTargetKpi({ rate, target, status, periodTo = '' } = {}) {
  if (!isKpiOct2026Period(periodTo)) return false
  if (status !== KPI_STATUS.NOT_MET) return false
  const gap = kpiGapPercentagePoints(target, rate)
  return gap != null && gap > 0 && gap < KPI_NEAR_TARGET_GAP_PP
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
