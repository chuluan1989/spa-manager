import { DEFAULT_PRICE_GROUPS } from './defaultPriceGroups'
import { GIA_LAI_SERVICE_CATALOG } from './giaLaiServiceCatalog'
import { PRICE_GROUP_IDS } from './priceGroupIds'

/** Tỷ lệ quy đổi so với bảng giá Gia Lai (mặc định) khi không có ánh xạ flat. */
const PRICE_GROUP_SCALE = {
  [PRICE_GROUP_IDS.STANDARD]: 0.55,
  [PRICE_GROUP_IDS.TRAM_SPA]: 0.48,
  [PRICE_GROUP_IDS.SONG_KHOE_SPA]: 0.52,
}

/** Ánh xạ catalog variant ID → flat service ID (nhóm Khoẻ Spa). */
const STANDARD_FLAT_MAP = {
  'gl-combo-relax-90': 'combo-1',
  'gl-combo-fresh-90': 'combo-2',
  'gl-combo-lung-vai-gay-90': 'combo-3',
  'gl-combo-body-chan-90': 'combo-3',
  'gl-combo-phuc-hoi-90': 'combo-3',
  'gl-combo-vip-120': 'combo-3',
  'gl-foot-30': { flatId: 'foot', priceRatio: 0.55 },
  'gl-foot-60': 'foot',
  'gl-body-tinh-dau-60': 'body-60',
  'gl-body-tinh-dau-90': 'body-90',
  'gl-body-nen-60': 'body-60',
  'gl-body-nen-90': 'body-90',
  'gl-body-chuyen-sau-90': 'chuyen-sau',
  'gl-body-chuyen-sau-120': 'chuyen-sau',
  'gl-body-da-nong-60': 'body-60',
  'gl-body-da-nong-90': 'body-90',
  'gl-bau-60': 'body-60',
  'gl-bau-75': 'body-75',
  'gl-co-vai-gay-60': 'co-vai-gay',
  'gl-co-vai-gay-90': 'body-90',
  'gl-goi-thu-gian-30': 'goi-sach',
  'gl-goi-giam-stress-45': 'goi-sach',
  'gl-goi-duong-sinh-60': 'goi-duong-sinh',
  'gl-goi-duong-sinh-90': 'goi-duong-sinh',
  'gl-goi-thao-duoc-60': 'goi-duong-sinh',
  'gl-goi-thao-duoc-90': 'goi-duong-sinh',
  'gl-cao-gio-giac-hoi': 'giac-hoi',
  'gl-thai-doc-ong-truc': 'giac-hoi',
  'gl-da-nong-addon': 'dap-thuoc',
  'gl-dap-cao-vung': 'dap-thuoc',
  'gl-book-phong-don': 'phong-don',
  'gl-them-gio-15': { flatId: 'dap-thuoc', priceRatio: 1.25 },
  'gl-them-gio-30': 'dap-thuoc',
  'gl-xong-hoi-da-muoi': 'xong-hoi',
}

const TRAM_SPA_FLAT_MAP = {
  'gl-combo-relax-90': 'combo-1',
  'gl-combo-fresh-90': 'combo-2',
  'gl-foot-30': { flatId: 'foot', priceRatio: 0.55 },
  'gl-foot-60': 'foot',
  'gl-body-tinh-dau-60': 'body-60',
  'gl-body-tinh-dau-90': 'body-90',
  'gl-co-vai-gay-60': 'co-vai-gay',
  'gl-goi-thu-gian-30': 'goi-sach',
  'gl-goi-duong-sinh-60': 'goi-duong-sinh',
  'gl-cao-gio-giac-hoi': 'giac-hoi',
  'gl-dap-cao-vung': 'dap-thuoc',
  'gl-book-phong-don': 'phong-don',
}

const SONG_KHOE_FLAT_MAP = {
  'gl-foot-30': { flatId: 'foot', priceRatio: 0.55 },
  'gl-foot-60': 'foot',
  'gl-body-tinh-dau-60': 'body-60',
  'gl-body-tinh-dau-90': 'body-90',
  'gl-body-chuyen-sau-90': 'chuyen-sau',
  'gl-co-vai-gay-60': 'co-vai-gay',
  'gl-goi-thu-gian-30': 'goi-sach',
  'gl-goi-duong-sinh-60': 'goi-duong-sinh',
  'gl-cao-gio-giac-hoi': 'giac-hoi',
  'gl-book-phong-don': 'phong-don',
}

const PRICE_GROUP_CATALOG_MAP = {
  [PRICE_GROUP_IDS.STANDARD]: STANDARD_FLAT_MAP,
  [PRICE_GROUP_IDS.TRAM_SPA]: TRAM_SPA_FLAT_MAP,
  [PRICE_GROUP_IDS.SONG_KHOE_SPA]: SONG_KHOE_FLAT_MAP,
}

function flattenCatalogItems(catalog = GIA_LAI_SERVICE_CATALOG) {
  const items = []
  for (const group of catalog?.groups ?? []) {
    for (const family of group.families ?? []) {
      for (const variant of family.variants ?? []) {
        items.push({
          id: variant.id,
          price: variant.price,
          commissionPercent: family.commissionPercent ?? 0,
        })
      }
    }
    for (const service of group.services ?? []) {
      if (service.variants?.length) {
        for (const variant of service.variants) {
          items.push({
            id: variant.id,
            price: variant.price,
            commissionPercent: service.commissionPercent ?? 0,
          })
        }
      } else {
        items.push({
          id: service.id,
          price: service.price,
          commissionPercent: service.commissionPercent ?? 0,
        })
      }
    }
  }
  return items
}

function buildDefaultCatalogOverrides(catalog = GIA_LAI_SERVICE_CATALOG) {
  const overrides = {}
  for (const item of flattenCatalogItems(catalog)) {
    overrides[item.id] = {
      price: item.price,
      commissionPercent: item.commissionPercent,
    }
  }
  return overrides
}

function resolveMappedPrice(mapping, flatById) {
  if (typeof mapping === 'string') {
    const flat = flatById[mapping]
    if (!flat) return null
    return { price: flat.price, commissionPercent: flat.commissionPercent }
  }

  if (mapping && typeof mapping === 'object' && mapping.flatId) {
    const flat = flatById[mapping.flatId]
    if (!flat) return null
    return {
      price: Math.round(flat.price * (mapping.priceRatio ?? 1)),
      commissionPercent: flat.commissionPercent,
    }
  }

  return null
}

export function buildSeedOverridesForPriceGroup(priceGroupId, existingOverrides = {}) {
  const flatList = DEFAULT_PRICE_GROUPS[priceGroupId] ?? DEFAULT_PRICE_GROUPS[PRICE_GROUP_IDS.STANDARD]
  const flatById = Object.fromEntries(flatList.map((item) => [item.id, item]))
  const catalogMap = PRICE_GROUP_CATALOG_MAP[priceGroupId] ?? STANDARD_FLAT_MAP
  const giaLaiDefaults = buildDefaultCatalogOverrides()
  const scale = PRICE_GROUP_SCALE[priceGroupId] ?? PRICE_GROUP_SCALE[PRICE_GROUP_IDS.STANDARD]

  const overrides = { ...existingOverrides }

  for (const item of flattenCatalogItems()) {
    if (overrides[item.id]) continue

    const mapped = resolveMappedPrice(catalogMap[item.id], flatById)
    if (mapped) {
      overrides[item.id] = mapped
      continue
    }

    const fallback = giaLaiDefaults[item.id]
    if (fallback) {
      overrides[item.id] = {
        price: Math.round(fallback.price * scale),
        commissionPercent: fallback.commissionPercent,
      }
      continue
    }

    overrides[item.id] = {
      price: item.price,
      commissionPercent: item.commissionPercent,
    }
  }

  return overrides
}
