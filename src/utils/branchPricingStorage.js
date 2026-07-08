import { getBranchById, loadBranches } from './branchStorage'
import {
  applyCatalogOverrides,
  branchHasGroupedCatalog,
  buildCatalogOverrides,
  flattenCatalog,
  getCatalogGroups,
  MASTER_CATALOG_VERSION,
  MASTER_SERVICE_CATALOG,
  mergeMissingCatalogOverrides,
  resolveBranchCatalogOverrides,
} from './serviceCatalog'
import { getServicesForPriceList, loadServices } from './serviceStorage'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertBranchPricingMap } from '../repositories/branchPricingRepository'

const STORAGE_KEY = 'spa-manager-branch-pricing'

function pushBranchPricingToSupabase(map) {
  if (!isSupabaseConfigured) return
  upsertBranchPricingMap(map).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ bảng giá chi nhánh:', error?.message)
  })
}

function normalizeEntry(entry) {
  return {
    price: Number(entry?.price) || 0,
    commissionPercent: Number(entry?.commissionPercent) || 0,
  }
}

function normalizeBranchPricing(record) {
  const overrides = {}
  if (record?.overrides && typeof record.overrides === 'object') {
    for (const [serviceId, entry] of Object.entries(record.overrides)) {
      overrides[serviceId] = normalizeEntry(entry)
    }
  }
  return {
    useCustom: Boolean(record?.useCustom),
    catalogVersion: Number(record?.catalogVersion) || 0,
    catalog: record?.catalog ?? null,
    overrides,
  }
}

function readBranchPricingMapRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return {}

    const normalized = {}
    for (const [branchId, record] of Object.entries(data)) {
      normalized[branchId] = normalizeBranchPricing(record)
    }
    return normalized
  } catch {
    return {}
  }
}

export function loadBranchPricingMap() {
  syncAllBranchCatalogs()
  return readBranchPricingMapRaw()
}

export function saveBranchPricingMap(map, { skipRemoteSync = false } = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  if (!skipRemoteSync) pushBranchPricingToSupabase(map)
  return map
}

export function getBranchPricingRecord(branchId) {
  const map = loadBranchPricingMap()
  return normalizeBranchPricing(map[branchId] ?? {})
}

export function isBranchUsingCustomPricing(branchId) {
  return getBranchPricingRecord(branchId).useCustom
}

function resolveServiceFromGroup(service, priceGroupId) {
  const entry = service.priceLists[priceGroupId]
  if (!entry) return null
  return {
    id: service.id,
    name: service.name,
    price: entry.price,
    commissionPercent: entry.commissionPercent,
    status: service.status,
  }
}

export function getDefaultServicesForBranch(branchId) {
  const branch = getBranchById(branchId)
  if (!branch) return []
  return getServicesForPriceList(branch.priceGroupId)
}

export function getCatalogGroupsForBranch(branchId) {
  syncBranchCatalog(branchId)
  const record = getBranchPricingRecord(branchId)
  if (!branchHasGroupedCatalog(branchId, record)) return []
  return getCatalogGroups(record.catalog, record.overrides)
}

export function getServicesForBranch(branchId, { includeInactive = false } = {}) {
  const branch = getBranchById(branchId)
  if (!branch) return []

  syncBranchCatalog(branchId)
  const record = getBranchPricingRecord(branchId)

  if (branchHasGroupedCatalog(branchId, record)) {
    const resolved = applyCatalogOverrides(record.catalog, record.overrides)
    return flattenCatalog(resolved)
      .filter((service) => includeInactive || service.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }

  let pricing = record
  if (pricing.useCustom) {
    syncMissingOverridesForBranch(branchId)
    pricing = getBranchPricingRecord(branchId)
  }

  const baseServices = loadServices().filter((service) => {
    if (!includeInactive && service.status !== 'active') return false
    return Object.prototype.hasOwnProperty.call(service.priceLists, branch.priceGroupId)
  })

  return baseServices
    .filter((service) => service.status !== 'deleted')
    .map((service) => {
      const base = resolveServiceFromGroup(service, branch.priceGroupId)
      if (!base) return null

      if (pricing.useCustom && pricing.overrides[service.id]) {
        return {
          ...base,
          price: pricing.overrides[service.id].price,
          commissionPercent: pricing.overrides[service.id].commissionPercent,
          isCustomPrice: true,
        }
      }

      return { ...base, isCustomPrice: false }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
}

export function syncMissingOverridesForBranch(branchId) {
  const map = loadBranchPricingMap()
  const record = normalizeBranchPricing(map[branchId] ?? {})
  if (!record.useCustom) return false

  const defaults = getDefaultServicesForBranch(branchId)
  let changed = false

  for (const service of defaults) {
    if (!record.overrides[service.id]) {
      record.overrides[service.id] = normalizeEntry(service)
      changed = true
    }
  }

  if (changed) {
    map[branchId] = record
    saveBranchPricingMap(map)
  }

  return changed
}

export function syncMissingCatalogOverrides(branchId) {
  const map = readBranchPricingMapRaw()
  const record = normalizeBranchPricing(map[branchId] ?? {})
  if (!branchHasGroupedCatalog(branchId, record)) return false

  const { overrides, changed } = mergeMissingCatalogOverrides(record.overrides, record.catalog)
  if (!changed) return false

  map[branchId] = { ...record, overrides }
  saveBranchPricingMap(map)
  return true
}

export function syncBranchCatalog(branchId) {
  const branch = getBranchById(branchId)
  if (!branch) return false

  const map = readBranchPricingMapRaw()
  const current = normalizeBranchPricing(map[branchId] ?? {})
  const hasCatalog = branchHasGroupedCatalog(branchId, current)
  const upToDate = hasCatalog && current.catalogVersion >= MASTER_CATALOG_VERSION

  if (upToDate) {
    return syncMissingCatalogOverrides(branchId)
  }

  const catalog = structuredClone(MASTER_SERVICE_CATALOG)
  const overrides = resolveBranchCatalogOverrides(branchId, branch, current)
  const { overrides: completeOverrides } = mergeMissingCatalogOverrides(overrides, catalog)

  map[branchId] = {
    useCustom: true,
    catalogVersion: MASTER_CATALOG_VERSION,
    catalog,
    overrides: completeOverrides,
  }
  saveBranchPricingMap(map)
  return true
}

export function syncAllBranchCatalogs() {
  return loadBranches().some((branch) => syncBranchCatalog(branch.id))
}

/** @deprecated Use syncBranchCatalog */
export function syncGiaLaiBranchCatalog(branchId) {
  return syncBranchCatalog(branchId)
}

/** @deprecated Use syncAllBranchCatalogs */
export function syncAllGiaLaiBranchCatalogs() {
  return syncAllBranchCatalogs()
}

export function syncNewServiceToCustomBranchPricing(service) {
  if (!service?.id) return false

  const map = loadBranchPricingMap()
  const branches = loadBranches()
  let changed = false

  for (const branch of branches) {
    const record = normalizeBranchPricing(map[branch.id] ?? {})
    if (!record.useCustom || record.overrides[service.id]) continue

    const groupEntry = service.priceLists?.[branch.priceGroupId]
    if (!groupEntry) continue

    record.overrides[service.id] = normalizeEntry(groupEntry)
    map[branch.id] = record
    changed = true
  }

  if (changed) {
    saveBranchPricingMap(map)
  }

  return changed
}

export function syncAllCustomBranchPricing() {
  const branches = loadBranches()
  return branches.some((branch) => syncMissingOverridesForBranch(branch.id))
}

export function enableCustomBranchPricing(branchId) {
  const map = loadBranchPricingMap()
  const defaults = getDefaultServicesForBranch(branchId)
  const overrides = {}

  for (const service of defaults) {
    overrides[service.id] = normalizeEntry(service)
  }

  map[branchId] = { useCustom: true, overrides }
  saveBranchPricingMap(map)
  return map[branchId]
}

export function resetBranchPricingToDefault(branchId) {
  const map = loadBranchPricingMap()
  delete map[branchId]
  saveBranchPricingMap(map)
  return true
}

export function updateBranchServicePricing(branchId, serviceId, data) {
  const map = loadBranchPricingMap()
  const current = normalizeBranchPricing(map[branchId] ?? { useCustom: true, overrides: {} })
  current.useCustom = true
  current.overrides[serviceId] = normalizeEntry({
    price: data.price ?? current.overrides[serviceId]?.price,
    commissionPercent: data.commissionPercent ?? current.overrides[serviceId]?.commissionPercent,
  })
  map[branchId] = current
  saveBranchPricingMap(map)
  return current.overrides[serviceId]
}
