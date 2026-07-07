export const PRICE_GROUP_IDS = {
  STANDARD: 'standard',
  TRAM_SPA: 'tram-spa',
  SONG_KHOE_SPA: 'song-khoe-spa',
}

export const PRICE_GROUPS = [
  {
    id: PRICE_GROUP_IDS.STANDARD,
    name: 'Khoẻ Spa',
  },
  {
    id: PRICE_GROUP_IDS.TRAM_SPA,
    name: 'Trạm Spa',
  },
  {
    id: PRICE_GROUP_IDS.SONG_KHOE_SPA,
    name: 'Sống Khoẻ Spa',
  },
]

export function getPriceGroupById(priceGroupId) {
  return PRICE_GROUPS.find((group) => group.id === priceGroupId) ?? null
}

export function getAllPriceGroupIds() {
  return PRICE_GROUPS.map((group) => group.id)
}

// Backward-compatible aliases
export const PRICE_LIST_IDS = PRICE_GROUP_IDS
export const PRICE_LISTS = PRICE_GROUPS
export const getPriceListById = getPriceGroupById
export const getAllPriceListIds = getAllPriceGroupIds
