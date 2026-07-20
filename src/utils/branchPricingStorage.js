import { getBranchById, loadBranches } from './branchStorage'
import {
  ensureAllBranchCatalogsSeeded,
  ensureServiceCatalogV2Migrated,
  getActiveServicesForBranchV2,
  getCatalogGroupsForBranchV2,
  isBranchCatalogReady,
} from './serviceCatalogV2Storage'
import { isGiaLaiCatalogBranch, isGroupedCatalogBranch } from '../constants/giaLaiBranches'
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
import {
  appendBranchSupportServiceToFlatList,
  appendBranchSupportServiceToGroups,
} from './branchSupportInvoice'

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

export function readBranchPricingMapRaw() {
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

function isFlatServiceId(serviceId) {
  return Boolean(serviceId) && !String(serviceId).startsWith('gl-')
}

/** Gỡ catalog Gia Lai khỏi chi nhánh không dùng UI nhóm — tránh hóa đơn lấy nhầm dữ liệu. */
export function stripFlatBranchGroupedCatalog() {
  const map = readBranchPricingMapRaw()
  let changed = false

  for (const branch of loadBranches()) {
    if (isGroupedCatalogBranch(branch.id)) continue

    const record = normalizeBranchPricing(map[branch.id] ?? {})
    const hasGroupedData = Boolean(record.catalog?.groups?.length)
      || Object.keys(record.overrides).some((id) => id.startsWith('gl-'))

    if (!hasGroupedData) continue

    const flatOverrides = {}
    for (const [serviceId, entry] of Object.entries(record.overrides)) {
      if (isFlatServiceId(serviceId)) flatOverrides[serviceId] = entry
    }

    map[branch.id] = {
      useCustom: Object.keys(flatOverrides).length > 0,
      catalogVersion: 0,
      catalog: null,
      overrides: flatOverrides,
    }
    changed = true
  }

  if (changed) {
    saveBranchPricingMap(map, { skipRemoteSync: false })
  }

  return changed
}

export function loadBranchPricingMap() {
  stripFlatBranchGroupedCatalog()
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
  ensureAllBranchCatalogsSeeded()
  if (isBranchCatalogReady(branchId)) {
    return appendBranchSupportServiceToGroups(getCatalogGroupsForBranchV2(branchId))
  }

  if (!isGiaLaiCatalogBranch(branchId)) return []

  syncBranchCatalog(branchId)
  const record = getBranchPricingRecord(branchId)
  if (!branchHasGroupedCatalog(branchId, record)) return []
  return appendBranchSupportServiceToGroups(getCatalogGroups(record.catalog, record.overrides))
}

export function getServicesForBranch(branchId, { includeInactive = false } = {}) {
  ensureAllBranchCatalogsSeeded()
  if (isBranchCatalogReady(branchId)) {
    const services = getActiveServicesForBranchV2(branchId)
    const list = includeInactive ? services : services.filter((service) => service.status === 'active')
    return appendBranchSupportServiceToFlatList(list)
  }

  const branch = getBranchById(branchId)
  if (!branch) return []

  if (isGiaLaiCatalogBranch(branchId)) {
    syncBranchCatalog(branchId)
  }

  const map = readBranchPricingMapRaw()
  const record = normalizeBranchPricing(map[branchId] ?? {})

  if (branchHasGroupedCatalog(branchId, record)) {
    const resolved = applyCatalogOverrides(record.catalog, record.overrides)
    const list = flattenCatalog(resolved)
      .filter((service) => includeInactive || service.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    return appendBranchSupportServiceToFlatList(list)
  }

  let pricing = record
  if (pricing.useCustom) {
    syncMissingOverridesForBranch(branchId)
    pricing = normalizeBranchPricing(readBranchPricingMapRaw()[branchId] ?? {})
  }

  const baseServices = loadServices().filter((service) => {
    if (!includeInactive && service.status !== 'active') return false
    return Object.prototype.hasOwnProperty.call(service.priceLists, branch.priceGroupId)
  })

  const resolved = baseServices
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

  return appendBranchSupportServiceToFlatList(resolved)
}

export function syncMissingOverridesForBranch(branchId) {
  if (isGroupedCatalogBranch(branchId)) return false

  const map = readBranchPricingMapRaw()
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
  if (!isGiaLaiCatalogBranch(branchId)) return false

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
  if (!isGiaLaiCatalogBranch(branchId)) return false

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
  return loadBranches()
    .filter((branch) => isGiaLaiCatalogBranch(branch.id))
    .some((branch) => syncBranchCatalog(branch.id))
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

  const map = readBranchPricingMapRaw()
  const branches = loadBranches()
  let changed = false

  for (const branch of branches) {
    if (isGroupedCatalogBranch(branch.id)) continue

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
  return branches
    .filter((branch) => !isGroupedCatalogBranch(branch.id))
    .some((branch) => syncMissingOverridesForBranch(branch.id))
}

export function enableCustomBranchPricing(branchId) {
  if (isGiaLaiCatalogBranch(branchId)) {
    syncBranchCatalog(branchId)
    return getBranchPricingRecord(branchId)
  }

  const map = readBranchPricingMapRaw()
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
  const map = readBranchPricingMapRaw()
  delete map[branchId]
  saveBranchPricingMap(map)

  if (isGiaLaiCatalogBranch(branchId)) {
    syncBranchCatalog(branchId)
  }

  return true
}

export function updateBranchServicePricing(branchId, serviceId, data) {
  const map = readBranchPricingMapRaw()

  if (isGiaLaiCatalogBranch(branchId)) {
    const current = normalizeBranchPricing(map[branchId] ?? {})
    if (!branchHasGroupedCatalog(branchId, current)) {
      syncBranchCatalog(branchId)
    }
  }

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
