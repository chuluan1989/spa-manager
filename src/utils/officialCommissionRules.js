/**
 * Rule % hoa hồng chuẩn (đồng bộ catalog, không dùng cho HĐ lịch sử).
 * Gia Lai không nằm trong batch sync này.
 */

export const COMMISSION_CATALOG_SYNC_REASON =
  'Đồng bộ % hoa hồng bảng Dịch vụ với chính sách lương hiện hành - Sep 2026'

export const TIERED_COMMISSION_SYNC_BRANCH_IDS = ['tram-spa', 'soc-trang', 'song-khoe-spa']
export const CHUYEN_SAU_30_SYNC_BRANCH_IDS = ['bac-lieu', 'tra-vinh', 'vinh-long']
export const BAC_LIEU_SYNC_BRANCH_IDS = ['bac-lieu']
export const FLAT_20_SYNC_BRANCH_IDS = []
export const GIA_LAI_BLOCKED_BRANCH_IDS = ['gia-lai-1', 'gia-lai-2']
export const SOC_TRANG_SONG_KHOE_BRANCH_IDS = ['soc-trang', 'song-khoe-spa']

const TIERED_ZERO_IDS = new Set(['body-60', 'body-75', 'foot', 'co-vai-gay'])
const TIERED_TEN_IDS = new Set(['combo-1', 'combo-2', 'combo-3'])
const MAIN_90_IDS = new Set(['body-90'])

function norm(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
}

function haystack(durationId, name) {
  return `${norm(durationId)} ${norm(name)}`
}

function isBody60(hay) {
  return /body[\s_-]*60/.test(hay)
}
function isBody75(hay) {
  return /body[\s_-]*75/.test(hay)
}
function isBody90(hay) {
  return /body[\s_-]*90/.test(hay)
}
function isCvg(hay) {
  return /co vai gay|co-vai-gay/.test(hay)
}
function isFoot(hay) {
  return /(^|[\s_-])foot([\s_-]|$)|massage chan/.test(hay)
}
function isCombo(hay) {
  return /combo[\s_-]*[123]/.test(hay)
}
function isChuyenSau(hay) {
  return /chuyen sau|chuyen-sau/.test(hay)
}

export function isGiaLaiCommissionSyncBlocked(branchId) {
  return GIA_LAI_BLOCKED_BRANCH_IDS.includes(branchId)
}

/**
 * @param {string} branchId
 * @param {string} durationId
 * @param {string} [serviceName]
 * @param {{ durationMinutes?: number }} [options]
 * @returns {{ percent: number } | { blocked: true, reason: string } | { missing: true }}
 */
export function resolveOfficialCatalogCommissionPercent(branchId, durationId, serviceName = '', options = {}) {
  if (!branchId) return { missing: true }
  if (isGiaLaiCommissionSyncBlocked(branchId)) {
    return {
      blocked: true,
      reason: 'Gia Lai không sync 40% trong batch này — chờ owner duyệt rule kinh doanh',
    }
  }

  const id = String(durationId ?? '')
  const hay = haystack(durationId, serviceName)
  void options

  if (TIERED_COMMISSION_SYNC_BRANCH_IDS.includes(branchId)) {
    if (branchId === 'tram-spa') {
      if (id === 'body-90' || isBody90(hay)) return { percent: 10 }
      if (id === 'massage-thai' || /massage[\s_-]*thai/.test(hay)) return { percent: 20 }
    }
    if (SOC_TRANG_SONG_KHOE_BRANCH_IDS.includes(branchId)) {
      if (id === 'chuyen-sau' || isChuyenSau(hay)) return { percent: 20 }
      if (MAIN_90_IDS.has(id) || id === 'body-90') return { percent: 10 }
    }
    if (TIERED_ZERO_IDS.has(id) || isBody60(hay) || isBody75(hay) || isCvg(hay) || isFoot(hay)) {
      return { percent: 0 }
    }
    if (TIERED_TEN_IDS.has(id) || isCombo(hay)) {
      return { percent: 10 }
    }
    return { percent: 20 }
  }

  if (CHUYEN_SAU_30_SYNC_BRANCH_IDS.includes(branchId)) {
    if (id === 'chuyen-sau' || isChuyenSau(hay)) return { percent: 30 }
    return { percent: 20 }
  }

  return { missing: true }
}
