import { GIA_LAI_SERVICE_CATALOG } from '../constants/giaLaiServiceCatalog'
import { TRAM_SPA_SERVICE_CATALOG } from '../constants/tramSpaServiceCatalog'
import { isGiaLaiCatalogBranch, isGroupedCatalogBranch } from '../constants/giaLaiBranches'
import { DEFAULT_PRICE_GROUPS } from '../constants/defaultPriceGroups'
import { PRICE_GROUP_IDS } from '../constants/priceGroupIds'
import { getBranchById } from './branchStorage'

const LEGACY_PRICING_KEY = 'spa-manager-branch-pricing'
const ACTIVE = 'active'

function readLegacyBranchPricing(branchId) {
  try {
    const raw = localStorage.getItem(LEGACY_PRICING_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return data?.[branchId] ?? null
  } catch {
    return null
  }
}

/** @deprecated Không còn force reseed khi load — giữ export để tương thích import cũ. */
export const FORCE_RESEED_BRANCH_IDS = []

/** @deprecated Dùng FORCE_RESEED_BRANCH_IDS */
export const GIA_LAI_FORCE_RESEED_BRANCH_IDS = ['gia-lai-1', 'gia-lai-2']

function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseDurationFromFlatId(serviceId) {
  const match = String(serviceId).match(/(\d+)$/)
  return match ? Number(match[1]) : null
}

function walkGroupedCatalog(catalog, categories, services, durations) {
  let categoryOrder = 0
  for (const group of catalog.groups ?? []) {
    categories.push({
      id: group.id,
      name: group.name,
      sortOrder: categoryOrder++,
      status: ACTIVE,
    })

    let serviceOrder = 0
    for (const family of group.families ?? []) {
      const serviceId = family.id
      services.push({
        id: serviceId,
        categoryId: group.id,
        name: family.name,
        sortOrder: serviceOrder++,
        status: ACTIVE,
      })
      let durationOrder = 0
      for (const variant of family.variants ?? []) {
        durations.push({
          id: variant.id,
          serviceId,
          durationMinutes: variant.durationMinutes ?? null,
          sortOrder: durationOrder++,
          status: ACTIVE,
        })
      }
    }

    for (const entry of group.services ?? []) {
      if (Array.isArray(entry.variants) && entry.variants.length > 0) {
        const serviceId = entry.id ?? slugify(entry.name)
        services.push({
          id: serviceId,
          categoryId: group.id,
          name: entry.name,
          sortOrder: serviceOrder++,
          status: ACTIVE,
        })
        let durationOrder = 0
        for (const variant of entry.variants) {
          durations.push({
            id: variant.id,
            serviceId,
            durationMinutes: variant.durationMinutes ?? null,
            sortOrder: durationOrder++,
            status: ACTIVE,
          })
        }
      } else {
        const durationId = entry.id ?? slugify(entry.name)
        const serviceId = `svc-${durationId}`
        services.push({
          id: serviceId,
          categoryId: group.id,
          name: entry.name,
          sortOrder: serviceOrder++,
          status: ACTIVE,
        })
        durations.push({
          id: durationId,
          serviceId,
          durationMinutes: entry.durationMinutes ?? null,
          sortOrder: 0,
          status: ACTIVE,
        })
      }
    }
  }
}

function collectGroupedPrices(catalog) {
  const prices = {}
  for (const group of catalog.groups ?? []) {
    for (const family of group.families ?? []) {
      for (const variant of family.variants ?? []) {
        prices[variant.id] = {
          price: Number(variant.price) || 0,
          commissionPercent: Number(family.commissionPercent) || 0,
        }
      }
    }
    for (const entry of group.services ?? []) {
      if (Array.isArray(entry.variants) && entry.variants.length > 0) {
        for (const variant of entry.variants) {
          prices[variant.id] = {
            price: Number(variant.price) || 0,
            commissionPercent: Number(entry.commissionPercent) || 0,
          }
        }
      } else {
        prices[entry.id] = {
          price: Number(entry.price) || 0,
          commissionPercent: Number(entry.commissionPercent) || 0,
        }
      }
    }
  }
  return prices
}

function buildGroupedCatalogPackage(catalog) {
  const categories = []
  const services = []
  const durations = []
  walkGroupedCatalog(catalog, categories, services, durations)
  return {
    catalog: { version: 1, categories, services, durations },
    prices: collectGroupedPrices(catalog),
  }
}

export function buildGiaLaiBranchCatalogPackage() {
  return buildGroupedCatalogPackage(GIA_LAI_SERVICE_CATALOG)
}

export function buildTramSpaBranchCatalogPackage() {
  return buildGroupedCatalogPackage(TRAM_SPA_SERVICE_CATALOG)
}

export function buildBranchCatalogPackage(branchId) {
  if (branchId === 'tram-spa') return buildTramSpaBranchCatalogPackage()
  if (isGiaLaiCatalogBranch(branchId)) return buildGiaLaiBranchCatalogPackage()
  throw new Error(`Không có catalog nhóm cho chi nhánh: ${branchId}`)
}

export function buildFlatBranchCatalogPackage(branchId) {
  const branch = getBranchById(branchId)
  if (!branch) {
    return { catalog: { version: 1, categories: [], services: [], durations: [] }, prices: {} }
  }

  const legacyRecord = readLegacyBranchPricing(branchId)
  const flatList = DEFAULT_PRICE_GROUPS[branch.priceGroupId]
    ?? DEFAULT_PRICE_GROUPS[PRICE_GROUP_IDS.STANDARD]

  const categoryId = `${branchId}-services`
  const categories = [{
    id: categoryId,
    name: 'DỊCH VỤ',
    sortOrder: 0,
    status: ACTIVE,
  }]

  const services = []
  const durations = []
  const prices = {}

  flatList.forEach((item, index) => {
    const serviceId = `${branchId}-svc-${item.id}`
    services.push({
      id: serviceId,
      categoryId,
      name: item.name,
      sortOrder: index,
      status: ACTIVE,
    })
    durations.push({
      id: item.id,
      serviceId,
      durationMinutes: parseDurationFromFlatId(item.id),
      sortOrder: 0,
      status: ACTIVE,
    })

    const legacyOverride = legacyRecord?.overrides?.[item.id]
    prices[item.id] = {
      price: Number(legacyOverride?.price ?? item.price) || 0,
      commissionPercent: Number(legacyOverride?.commissionPercent ?? item.commissionPercent) || 0,
    }
  })

  return {
    catalog: { version: 1, categories, services, durations },
    prices,
  }
}

export function shouldUseGroupedCatalogUI(branchId) {
  return isGroupedCatalogBranch(branchId)
}
