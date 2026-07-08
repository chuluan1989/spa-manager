export const COMMISSION_POLICY_TYPE = {
  FLAT: 'flat',
  TIERED: 'tiered',
}

/** Chi nhánh Gia Lai 1, 2: 40% tất cả dịch vụ */
export const FLAT_40_BRANCH_IDS = ['gia-lai-1', 'gia-lai-2']

/** Trà Vinh, Vĩnh Long, Bạc Liêu: 20% tất cả dịch vụ */
export const FLAT_20_BRANCH_IDS = ['tra-vinh', 'vinh-long', 'bac-lieu']

/** Sóc Trăng, Trạm Spa, Spa Sống Khoẻ: 0% / 10% / 20% theo nhóm */
export const TIERED_COMMISSION_BRANCH_IDS = ['soc-trang', 'tram-spa', 'song-khoe-spa']

export const TIERED_ZERO_SERVICE_IDS = ['body-60', 'body-90', 'foot', 'co-vai-gay']

export const TIERED_ZERO_SERVICE_NAMES = [
  'body 60',
  'body 90',
  'foot',
  'cvg',
  'co vai gay',
  'cổ vai gáy',
]

export const TIERED_TEN_SERVICE_IDS = ['chuyen-sau', 'combo-1', 'combo-2', 'combo-3']

export const TIERED_TEN_SERVICE_NAMES = [
  'chuyen sau',
  'chuyên sâu',
  'combo 1',
  'combo 2',
  'combo 3',
]
