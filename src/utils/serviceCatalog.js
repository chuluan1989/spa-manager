import { GIA_LAI_SERVICE_CATALOG } from '../constants/giaLaiServiceCatalog'
import { buildSeedOverridesForPriceGroup } from '../constants/catalogPriceSeeds'
import { isGiaLaiCatalogBranch } from '../constants/giaLaiBranches'
import { SERVICE_STATUS } from './serviceStorage'

/** Phiên bản cấu trúc danh mục nhóm dịch vụ (dùng cho mọi chi nhánh). */
export const MASTER_CATALOG_VERSION = 2

export const MASTER_SERVICE_CATALOG = GIA_LAI_SERVICE_CATALOG

export { GIA_LAI_SERVICE_CATALOG, GIA_LAI_CATALOG_VERSION } from '../constants/giaLaiServiceCatalog'
export { isGiaLaiCatalogBranch, GIA_LAI_CATALOG_BRANCH_IDS } from '../constants/giaLaiBranches'

export function formatCatalogServiceName(baseName, durationMinutes) {
  if (!durationMinutes) return baseName
  return `${baseName} ${durationMinutes}'`
}

function normalizeFlatService({
  id,
  name,
  price,
  durationMinutes = null,
  commissionPercent = 0,
  groupId = '',
  groupName = '',
  familyId = '',
}) {
  return {
    id,
    name: formatCatalogServiceName(name, durationMinutes),
    baseName: name,
    durationMinutes,
    price: Number(price) || 0,
    commissionPercent: Number(commissionPercent) || 0,
    status: SERVICE_STATUS.ACTIVE,
    groupId,
    groupName,
    familyId,
    isCustomPrice: true,
    isGroupedCatalog: true,
  }
}

function flattenFamily(group, family) {
  const commission = family.commissionPercent ?? 0
  return (family.variants ?? []).map((variant) => normalizeFlatService({
    id: variant.id,
    name: family.name,
    price: variant.price,
    durationMinutes: variant.durationMinutes,
    commissionPercent: commission,
    groupId: group.id,
    groupName: group.name,
    familyId: family.id,
  }))
}

function flattenServiceEntry(group, entry) {
  if (Array.isArray(entry.variants) && entry.variants.length > 0) {
    const commission = entry.commissionPercent ?? 0
    return entry.variants.map((variant) => normalizeFlatService({
      id: variant.id,
      name: entry.name,
      price: variant.price,
      durationMinutes: variant.durationMinutes,
      commissionPercent: commission,
      groupId: group.id,
      groupName: group.name,
      familyId: entry.id ?? entry.name,
    }))
  }

  return [normalizeFlatService({
    id: entry.id,
    name: entry.name,
    price: entry.price,
    durationMinutes: entry.durationMinutes ?? null,
    commissionPercent: entry.commissionPercent ?? 0,
    groupId: group.id,
    groupName: group.name,
    familyId: entry.id,
  })]
}

export function flattenCatalog(catalog = MASTER_SERVICE_CATALOG) {
  const services = []

  for (const group of catalog?.groups ?? []) {
    for (const family of group.families ?? []) {
      services.push(...flattenFamily(group, family))
    }
    for (const service of group.services ?? []) {
      services.push(...flattenServiceEntry(group, service))
    }
  }

  return services
}

export function buildCatalogOverrides(catalog = MASTER_SERVICE_CATALOG) {
  const overrides = {}
  for (const service of flattenCatalog(catalog)) {
    overrides[service.id] = {
      price: service.price,
      commissionPercent: service.commissionPercent,
    }
  }
  return overrides
}

function applyPriceToServiceEntry(entry, overrides) {
  if (Array.isArray(entry.variants) && entry.variants.length > 0) {
    return {
      ...entry,
      variants: entry.variants.map((variant) => ({
        ...variant,
        price: overrides[variant.id]?.price ?? variant.price,
      })),
    }
  }

  const override = overrides[entry.id]
  if (!override) return entry
  return {
    ...entry,
    price: override.price ?? entry.price,
    commissionPercent: override.commissionPercent ?? entry.commissionPercent,
  }
}

export function applyCatalogOverrides(catalog, overrides = {}) {
  if (!catalog) return { groups: [] }

  return {
    ...catalog,
    groups: (catalog.groups ?? []).map((group) => ({
      ...group,
      families: (group.families ?? []).map((family) => ({
        ...family,
        variants: (family.variants ?? []).map((variant) => ({
          ...variant,
          price: overrides[variant.id]?.price ?? variant.price,
        })),
      })),
      services: (group.services ?? []).map((service) => applyPriceToServiceEntry(service, overrides)),
    })),
  }
}

export function getCatalogGroups(catalog = MASTER_SERVICE_CATALOG, overrides = {}) {
  const resolved = applyCatalogOverrides(catalog, overrides)
  return resolved.groups ?? []
}

export function branchHasGroupedCatalog(branchId, record) {
  return Boolean(record?.catalog?.groups?.length)
}

export function resolveBranchCatalogOverrides(branchId, branch, existingRecord = {}) {
  const existing = existingRecord.overrides ?? {}
  const hasCatalogOverrides = Object.keys(existing).some((id) => id.startsWith('gl-'))

  if (isGiaLaiCatalogBranch(branchId) && hasCatalogOverrides) {
    return { ...existing }
  }

  if (isGiaLaiCatalogBranch(branchId)) {
    return buildCatalogOverrides()
  }

  return buildSeedOverridesForPriceGroup(branch?.priceGroupId ?? 'standard', existing)
}

export function mergeMissingCatalogOverrides(overrides, catalog = MASTER_SERVICE_CATALOG) {
  const merged = { ...overrides }
  let changed = false

  for (const service of flattenCatalog(catalog)) {
    if (!merged[service.id]) {
      merged[service.id] = {
        price: service.price,
        commissionPercent: service.commissionPercent,
      }
      changed = true
    }
  }

  return { overrides: merged, changed }
}

// Backward-compatible aliases
export const formatGiaLaiServiceName = formatCatalogServiceName
export const flattenGiaLaiCatalog = flattenCatalog
export const buildGiaLaiCatalogOverrides = buildCatalogOverrides
export const getGiaLaiCatalogGroups = getCatalogGroups

export function getGiaLaiCatalogServicesForBranch(branchId) {
  if (!isGiaLaiCatalogBranch(branchId)) return []
  return flattenCatalog()
}
