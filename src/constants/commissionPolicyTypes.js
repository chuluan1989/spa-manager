export const COMMISSION_POLICY_TYPE = {
  FLAT: 'flat',
  TIERED: 'tiered',
}

/** Chi nhánh Gia Lai 1, 2: 40% tất cả dịch vụ */
export const FLAT_40_BRANCH_IDS = ['gia-lai-1', 'gia-lai-2']

/** Trà Vinh, Vĩnh Long: 20% mặc định, Chuyên sâu 30% từ 01/09/2026. */
export const FLAT_20_BRANCH_IDS = []

/**
 * Bạc Liêu, Trà Vinh, Vĩnh Long: 20% tất cả dịch vụ, riêng Chuyên sâu 30%.
 */
export const BAC_LIEU_BRANCH_IDS = ['bac-lieu', 'tra-vinh', 'vinh-long']
export const BAC_LIEU_DEFAULT_RATE = 20
export const BAC_LIEU_SPECIAL_RATE = 30
export const BAC_LIEU_SPECIAL_SERVICE_IDS = ['chuyen-sau']
export const BAC_LIEU_SPECIAL_SERVICE_NAMES = [
  'chuyen sau',
  'chuyên sâu',
]

/** Sóc Trăng, Trạm Spa, Spa Sống Khoẻ: 0% / 10% / 20% theo nhóm */
export const TIERED_COMMISSION_BRANCH_IDS = ['soc-trang', 'tram-spa', 'song-khoe-spa']

export const TIERED_ZERO_SERVICE_IDS = ['body-60', 'body-75', 'foot', 'co-vai-gay']

export const TIERED_ZERO_SERVICE_NAMES = [
  'body 60',
  'body 75',
  'foot',
  'cvg',
  'co vai gay',
  'cổ vai gáy',
]

export const TIERED_TEN_SERVICE_IDS = ['combo-1', 'combo-2', 'combo-3', 'body-90']

export const TIERED_TEN_SERVICE_NAMES = [
  'combo 1',
  'combo 2',
  'combo 3',
  'body 90',
]

export const TIERED_TWENTY_SERVICE_IDS = ['chuyen-sau']
export const TIERED_TWENTY_SERVICE_NAMES = [
  'chuyen sau',
  'chuyên sâu',
]
