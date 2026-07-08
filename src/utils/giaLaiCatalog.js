import { GIA_LAI_SERVICE_CATALOG } from '../constants/giaLaiServiceCatalog'
import { isGiaLaiCatalogBranch } from '../constants/giaLaiBranches'
import { SERVICE_STATUS } from './serviceStorage'

export { isGiaLaiCatalogBranch, GIA_LAI_CATALOG_BRANCH_IDS } from '../constants/giaLaiBranches'
export { GIA_LAI_SERVICE_CATALOG, GIA_LAI_CATALOG_VERSION } from '../constants/giaLaiServiceCatalog'

export function formatGiaLaiServiceName(baseName, durationMinutes) {
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
    name: formatGiaLaiServiceName(name, durationMinutes),
    baseName: name,
    durationMinutes,
    price: Number(price) || 0,
    commissionPercent: Number(commissionPercent) || 0,
    status: SERVICE_STATUS.ACTIVE,
    groupId,
    groupName,
    familyId,
    isCustomPrice: true,
    isGiaLaiCatalog: true,
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

export function flattenGiaLaiCatalog(catalog = GIA_LAI_SERVICE_CATALOG) {
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

export function buildGiaLaiCatalogOverrides(catalog = GIA_LAI_SERVICE_CATALOG) {
  const overrides = {}
  for (const service of flattenGiaLaiCatalog(catalog)) {
    overrides[service.id] = {
      price: service.price,
      commissionPercent: service.commissionPercent,
    }
  }
  return overrides
}

export function getGiaLaiCatalogGroups(catalog = GIA_LAI_SERVICE_CATALOG) {
  return catalog?.groups ?? []
}

export function getGiaLaiCatalogServicesForBranch(branchId, catalog = GIA_LAI_SERVICE_CATALOG) {
  if (!isGiaLaiCatalogBranch(branchId)) return []
  return flattenGiaLaiCatalog(catalog)
}
