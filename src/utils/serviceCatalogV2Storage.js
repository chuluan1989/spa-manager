import { isSupabaseConfigured } from '../lib/supabaseClient'
import { notifyDataSynced } from './dataSyncEvents'
import { loadBranches } from './branchStorage'
import {
  buildBranchCatalogPackage,
  buildFlatBranchCatalogPackage,
  shouldUseGroupedCatalogUI,
} from './branchCatalogSeeds'
import { isGroupedCatalogBranch } from '../constants/giaLaiBranches'
import { formatCatalogServiceName } from './serviceCatalog'
import {
  fetchBranchCatalogsRemote,
  upsertBranchCatalogsRemote,
} from '../repositories/branchCatalogRepository'
import { verifyNoInvoiceReferencesRemote } from '../repositories/serviceInvoiceGuardRepository'
import { appendServiceChangeLog } from './serviceChangeLogStorage'
import { getCurrentUserName } from '../constants/auth'

const BRANCH_CATALOGS_KEY = 'spa-manager-branch-catalogs-v2'
const PRICES_KEY = 'spa-manager-branch-service-prices-v2'
const MIGRATED_KEY = 'spa-manager-branch-catalogs-v2-migrated'

export const ITEM_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DELETED: 'deleted',
}

function emptyCatalog() {
  return { version: 1, categories: [], services: [], durations: [] }
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function nextSortOrder(items) {
  if (!items.length) return 0
  return Math.max(...items.map((item) => Number(item.sortOrder) || 0)) + 1
}

export function loadBranchCatalogsMap() {
  try {
    const raw = localStorage.getItem(BRANCH_CATALOGS_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

export function saveBranchCatalogsMap(map, { skipRemoteSync = false, notify = true } = {}) {
  localStorage.setItem(BRANCH_CATALOGS_KEY, JSON.stringify(map))
  if (!skipRemoteSync && isSupabaseConfigured) {
    upsertBranchCatalogsRemote(map, loadBranchServicePricesV2()).catch((error) => {
      console.warn('[Supabase] Không thể đồng bộ catalog chi nhánh:', error?.message)
    })
  }
  if (notify) notifyDataSynced(['serviceCatalogV2', 'branchPricing'])
  return map
}

export function loadBranchCatalog(branchId) {
  if (!branchId) return emptyCatalog()
  ensureBranchCatalogSeeded(branchId)
  return loadBranchCatalogsMap()[branchId] ?? emptyCatalog()
}

export function saveBranchCatalog(branchId, catalog, { skipRemoteSync = false, notify = true } = {}) {
  const map = loadBranchCatalogsMap()
  map[branchId] = catalog
  return saveBranchCatalogsMap(map, { skipRemoteSync, notify })
}

export function loadBranchServicePricesV2() {
  try {
    const raw = localStorage.getItem(PRICES_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

export function saveBranchServicePricesV2(prices, { skipRemoteSync = false, notify = true } = {}) {
  localStorage.setItem(PRICES_KEY, JSON.stringify(prices))
  if (!skipRemoteSync && isSupabaseConfigured) {
    upsertBranchCatalogsRemote(loadBranchCatalogsMap(), prices).catch((error) => {
      console.warn('[Supabase] Không thể đồng bộ bảng giá v2:', error?.message)
    })
  }
  if (notify) notifyDataSynced(['serviceCatalogV2', 'branchPricing'])
  return prices
}

export function ensureBranchCatalogSeeded(branchId) {
  if (!branchId) return emptyCatalog()

  const map = loadBranchCatalogsMap()
  const existing = map[branchId]

  if (existing?.categories?.length > 0) {
    return existing
  }

  const allPrices = loadBranchServicePricesV2()
  let catalog
  let prices

  if (isGroupedCatalogBranch(branchId)) {
    const seeded = buildBranchCatalogPackage(branchId)
    catalog = seeded.catalog
    prices = seeded.prices
  } else {
    const seeded = buildFlatBranchCatalogPackage(branchId)
    catalog = seeded.catalog
    prices = { ...(allPrices[branchId] ?? {}), ...seeded.prices }
  }

  map[branchId] = catalog
  allPrices[branchId] = prices
  saveBranchCatalogsMap(map, { notify: false })
  saveBranchServicePricesV2(allPrices, { notify: false })
  return catalog
}

export function ensureAllBranchCatalogsSeeded() {
  for (const branch of loadBranches()) {
    ensureBranchCatalogSeeded(branch.id)
  }
  localStorage.setItem(MIGRATED_KEY, '1')
}

/** @deprecated Dùng loadBranchCatalog(branchId) */
export function loadServiceCatalogV2() {
  ensureAllBranchCatalogsSeeded()
  const firstBranch = loadBranches()[0]?.id
  return firstBranch ? loadBranchCatalog(firstBranch) : emptyCatalog()
}

/** @deprecated Dùng saveBranchCatalog */
export function saveServiceCatalogV2(catalog, options = {}) {
  const branchId = loadBranches()[0]?.id
  if (!branchId) return catalog
  return saveBranchCatalog(branchId, catalog, options)
}

export function ensureServiceCatalogV2Migrated() {
  ensureAllBranchCatalogsSeeded()
  return loadServiceCatalogV2()
}

export function applyRemoteBranchCatalogs(remote) {
  if (!remote?.catalogs || typeof remote.catalogs !== 'object') return false
  saveBranchCatalogsMap(remote.catalogs, { skipRemoteSync: true, notify: false })
  saveBranchServicePricesV2(remote.branchPrices ?? {}, { skipRemoteSync: true, notify: false })
  localStorage.setItem(MIGRATED_KEY, '1')
  notifyDataSynced(['serviceCatalogV2'])
  return true
}

/** @deprecated */
export function applyRemoteServiceCatalogV2(remote) {
  if (!remote?.catalog) return false
  const map = {}
  for (const branch of loadBranches()) {
    map[branch.id] = remote.catalog
  }
  return applyRemoteBranchCatalogs({ catalogs: map, branchPrices: remote.branchPrices })
}

function getDurationPrice(branchId, durationId, pricesMap) {
  return pricesMap[branchId]?.[durationId] ?? { price: 0, commissionPercent: 0 }
}

export function isBranchCatalogReady(branchId) {
  const catalog = loadBranchCatalogsMap()[branchId]
  return (catalog?.categories?.length ?? 0) > 0
}

export function isServiceCatalogV2Ready() {
  return loadBranches().some((branch) => isBranchCatalogReady(branch.id))
}

export function getCatalogGroupsForBranchV2(branchId) {
  if (!branchId || !shouldUseGroupedCatalogUI(branchId)) return []

  const catalog = loadBranchCatalog(branchId)
  const pricesMap = loadBranchServicePricesV2()

  return catalog.categories
    .filter((category) => category.status === ITEM_STATUS.ACTIVE)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => {
      const categoryServices = catalog.services
        .filter((service) => service.categoryId === category.id && service.status === ITEM_STATUS.ACTIVE)
        .sort((a, b) => a.sortOrder - b.sortOrder)

      const families = []
      const directServices = []

      for (const service of categoryServices) {
        const serviceDurations = catalog.durations
          .filter((duration) => duration.serviceId === service.id && duration.status === ITEM_STATUS.ACTIVE)
          .sort((a, b) => a.sortOrder - b.sortOrder)

        if (serviceDurations.length === 0) continue

        const variants = serviceDurations.map((duration) => {
          const priceEntry = getDurationPrice(branchId, duration.id, pricesMap)
          return {
            id: duration.id,
            durationMinutes: duration.durationMinutes,
            price: priceEntry.price,
          }
        })

        const commissionPercent = getDurationPrice(branchId, serviceDurations[0].id, pricesMap).commissionPercent
        const hasMultipleVariants = serviceDurations.length > 1
          || (serviceDurations.length === 1 && serviceDurations[0].durationMinutes)

        if (hasMultipleVariants) {
          families.push({
            id: service.id,
            name: service.name,
            commissionPercent,
            variants,
          })
        } else {
          const duration = serviceDurations[0]
          const priceEntry = getDurationPrice(branchId, duration.id, pricesMap)
          directServices.push({
            id: duration.id,
            name: service.name,
            durationMinutes: duration.durationMinutes,
            price: priceEntry.price,
            commissionPercent: priceEntry.commissionPercent,
          })
        }
      }

      if (!families.length && !directServices.length) return null
      return {
        id: category.id,
        name: category.name,
        families,
        services: directServices,
      }
    })
    .filter(Boolean)
}

export function getActiveServicesForBranchV2(branchId) {
  if (!branchId) return []

  const catalog = loadBranchCatalog(branchId)
  const pricesMap = loadBranchServicePricesV2()
  const services = []

  for (const duration of catalog.durations) {
    if (duration.status !== ITEM_STATUS.ACTIVE) continue
    const service = catalog.services.find((item) => item.id === duration.serviceId)
    const category = catalog.categories.find((item) => item.id === service?.categoryId)
    if (!service || service.status !== ITEM_STATUS.ACTIVE) continue
    if (!category || category.status !== ITEM_STATUS.ACTIVE) continue

    const priceEntry = getDurationPrice(branchId, duration.id, pricesMap)
    services.push({
      id: duration.id,
      name: formatCatalogServiceName(service.name, duration.durationMinutes),
      baseName: service.name,
      durationMinutes: duration.durationMinutes,
      price: priceEntry.price,
      commissionPercent: priceEntry.commissionPercent,
      status: ITEM_STATUS.ACTIVE,
      categoryId: category.id,
      categoryName: category.name,
      serviceId: service.id,
    })
  }

  return services.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
}

export function getBranchPricingMatrix(branchId) {
  const catalog = loadBranchCatalog(branchId)
  const pricesMap = loadBranchServicePricesV2()
  const rows = []

  for (const category of catalog.categories.filter((c) => c.status !== ITEM_STATUS.DELETED).sort((a, b) => a.sortOrder - b.sortOrder)) {
    const categoryServices = catalog.services
      .filter((s) => s.categoryId === category.id && s.status !== ITEM_STATUS.DELETED)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    for (const service of categoryServices) {
      const durations = catalog.durations
        .filter((d) => d.serviceId === service.id && d.status !== ITEM_STATUS.DELETED)
        .sort((a, b) => a.sortOrder - b.sortOrder)

      for (const duration of durations) {
        const priceEntry = getDurationPrice(branchId, duration.id, pricesMap)
        rows.push({
          categoryId: category.id,
          categoryName: category.name,
          serviceId: service.id,
          serviceName: service.name,
          description: service.description ?? '',
          serviceStatus: service.status,
          durationId: duration.id,
          durationStatus: duration.status,
          durationMinutes: duration.durationMinutes,
          price: priceEntry.price,
          commissionPercent: priceEntry.commissionPercent,
        })
      }
    }
  }

  return rows
}

function findServiceIdForDuration(branchId, durationId) {
  const catalog = loadBranchCatalog(branchId)
  return catalog.durations.find((item) => item.id === durationId)?.serviceId ?? ''
}

export function setBranchDurationPrice(branchId, durationId, { price, commissionPercent }, options = {}) {
  const prices = loadBranchServicePricesV2()
  if (!prices[branchId]) prices[branchId] = {}
  const prev = prices[branchId][durationId] ?? { price: 0, commissionPercent: 0 }
  prices[branchId][durationId] = {
    price: Number(price) || 0,
    commissionPercent: Number(commissionPercent) || 0,
  }
  saveBranchServicePricesV2(prices)

  if (options.log !== false) {
    appendServiceChangeLog(branchId, durationId, {
      serviceId: findServiceIdForDuration(branchId, durationId),
      byName: getCurrentUserName(),
      oldPrice: prev.price,
      newPrice: prices[branchId][durationId].price,
      oldPercent: prev.commissionPercent,
      newPercent: prices[branchId][durationId].commissionPercent,
      action: 'update_price',
    }).catch((error) => {
      console.warn('[ServiceChangeLog] Không thể ghi nhật ký:', error?.message)
    })
  }

  return prices[branchId][durationId]
}

function mutateBranchCatalog(branchId, mutator) {
  const catalog = structuredClone(loadBranchCatalog(branchId))
  mutator(catalog)
  saveBranchCatalog(branchId, catalog)
  return catalog
}

export function addCategory({ branchId, name }) {
  mutateBranchCatalog(branchId, (catalog) => {
    catalog.categories.push({
      id: createId('cat'),
      name: name.trim(),
      sortOrder: nextSortOrder(catalog.categories),
      status: ITEM_STATUS.ACTIVE,
    })
  })
  return loadBranchCatalog(branchId).categories.at(-1)
}

export function updateCategory(branchId, categoryId, patch) {
  let updated = null
  mutateBranchCatalog(branchId, (catalog) => {
    const index = catalog.categories.findIndex((item) => item.id === categoryId)
    if (index === -1) return
    catalog.categories[index] = { ...catalog.categories[index], ...patch }
    updated = catalog.categories[index]
  })
  return updated
}

export function deleteCategory(branchId, categoryId) {
  const catalog = loadBranchCatalog(branchId)
  const hasServices = catalog.services.some(
    (service) => service.categoryId === categoryId && service.status !== ITEM_STATUS.DELETED,
  )
  if (hasServices) return { ok: false, error: 'Nhóm còn dịch vụ, không thể xóa.' }
  updateCategory(branchId, categoryId, { status: ITEM_STATUS.DELETED })
  return { ok: true }
}

export function reorderCategories(branchId, orderedIds) {
  mutateBranchCatalog(branchId, (catalog) => {
    orderedIds.forEach((id, index) => {
      const category = catalog.categories.find((item) => item.id === id)
      if (category) category.sortOrder = index
    })
  })
}

export function addService({ branchId, categoryId, name }) {
  mutateBranchCatalog(branchId, (catalog) => {
    catalog.services.push({
      id: createId('svc'),
      categoryId,
      name: name.trim(),
      sortOrder: nextSortOrder(catalog.services.filter((item) => item.categoryId === categoryId)),
      status: ITEM_STATUS.ACTIVE,
    })
  })
  return loadBranchCatalog(branchId).services.at(-1)
}

export function updateService(branchId, serviceId, patch) {
  let updated = null
  mutateBranchCatalog(branchId, (catalog) => {
    const index = catalog.services.findIndex((item) => item.id === serviceId)
    if (index === -1) return
    catalog.services[index] = { ...catalog.services[index], ...patch }
    updated = catalog.services[index]
  })
  return updated
}

export function deleteService(branchId, serviceId) {
  return updateService(branchId, serviceId, { status: ITEM_STATUS.DELETED })
}

export async function deleteServiceSafe(branchId, serviceId) {
  const catalog = loadBranchCatalog(branchId)
  const durations = catalog.durations.filter(
    (d) => d.serviceId === serviceId && d.status !== ITEM_STATUS.DELETED,
  )
  for (const duration of durations) {
    const check = await verifyNoInvoiceReferencesRemote({
      branchId,
      serviceId,
      durationId: duration.id,
    })
    if (!check.ok) return { ok: false, error: check.error }
    if (check.hasReference) {
      return {
        ok: false,
        error: 'Dịch vụ đã phát sinh hóa đơn — chỉ có thể ngừng sử dụng.',
      }
    }
  }
  deleteService(branchId, serviceId)
  for (const duration of durations) {
    deleteDuration(branchId, duration.id)
  }
  return { ok: true }
}

export async function deleteDurationSafe(branchId, durationId, serviceId = '') {
  const resolvedServiceId = serviceId || findServiceIdForDuration(branchId, durationId)
  const check = await verifyNoInvoiceReferencesRemote({
    branchId,
    serviceId: resolvedServiceId,
    durationId,
  })
  if (!check.ok) return { ok: false, error: check.error }
  if (check.hasReference) {
    return {
      ok: false,
      error: 'Dịch vụ đã phát sinh hóa đơn — chỉ có thể ngừng sử dụng.',
    }
  }
  deleteDuration(branchId, durationId)
  return { ok: true }
}

export function createServiceWithPricing({
  branchId,
  categoryId,
  name,
  description = '',
  durationMinutes,
  price,
  commissionPercent,
  status = ITEM_STATUS.ACTIVE,
}) {
  const service = addService({ branchId, categoryId, name })
  if (description.trim()) {
    updateService(branchId, service.id, { description: description.trim() })
  }
  if (status === ITEM_STATUS.INACTIVE) {
    setServiceVisibility(branchId, service.id, ITEM_STATUS.INACTIVE)
  }

  const duration = addDuration({ branchId, serviceId: service.id, durationMinutes })
  setBranchDurationPrice(branchId, duration.id, { price, commissionPercent }, { log: false })
  appendServiceChangeLog(branchId, duration.id, {
    serviceId: service.id,
    byName: getCurrentUserName(),
    oldPrice: null,
    newPrice: Number(price) || 0,
    oldPercent: null,
    newPercent: Number(commissionPercent) || 0,
    action: 'create',
  }).catch((error) => {
    console.warn('[ServiceChangeLog] Không thể ghi nhật ký:', error?.message)
  })

  return { service, duration }
}

export function copyBranchCatalogConfig(fromBranchId, toBranchIds = []) {
  const sourceCatalog = structuredClone(loadBranchCatalog(fromBranchId))
  const sourcePrices = structuredClone(loadBranchServicePricesV2()[fromBranchId] ?? {})
  const targets = (toBranchIds ?? []).filter((id) => id && id !== fromBranchId)

  for (const targetId of targets) {
    saveBranchCatalog(targetId, structuredClone(sourceCatalog))
    const prices = loadBranchServicePricesV2()
    prices[targetId] = structuredClone(sourcePrices)
    saveBranchServicePricesV2(prices)
  }

  return targets.length
}

export function setServiceVisibility(branchId, serviceId, status) {
  return updateService(branchId, serviceId, { status })
}

export function reorderServices(branchId, categoryId, orderedIds) {
  mutateBranchCatalog(branchId, (catalog) => {
    orderedIds.forEach((id, index) => {
      const service = catalog.services.find((item) => item.id === id)
      if (service && service.categoryId === categoryId) service.sortOrder = index
    })
  })
}

export function addDuration({ branchId, serviceId, durationMinutes }) {
  const duration = {
    id: createId('dur'),
    serviceId,
    durationMinutes: durationMinutes === '' || durationMinutes == null ? null : Number(durationMinutes),
    sortOrder: 0,
    status: ITEM_STATUS.ACTIVE,
  }

  mutateBranchCatalog(branchId, (catalog) => {
    duration.sortOrder = nextSortOrder(catalog.durations.filter((item) => item.serviceId === serviceId))
    catalog.durations.push(duration)
  })

  const prices = loadBranchServicePricesV2()
  if (!prices[branchId]) prices[branchId] = {}
  if (!prices[branchId][duration.id]) {
    prices[branchId][duration.id] = { price: 0, commissionPercent: 0 }
    saveBranchServicePricesV2(prices, { notify: false })
  }

  return duration
}

export function updateDuration(branchId, durationId, patch) {
  let updated = null
  mutateBranchCatalog(branchId, (catalog) => {
    const index = catalog.durations.findIndex((item) => item.id === durationId)
    if (index === -1) return
    catalog.durations[index] = {
      ...catalog.durations[index],
      ...patch,
      durationMinutes: patch.durationMinutes === '' || patch.durationMinutes == null
        ? null
        : Number(patch.durationMinutes),
    }
    updated = catalog.durations[index]
  })
  return updated
}

export function deleteDuration(branchId, durationId) {
  return updateDuration(branchId, durationId, { status: ITEM_STATUS.DELETED })
}

export function setDurationVisibility(branchId, durationId, status) {
  return updateDuration(branchId, durationId, { status })
}

export function reorderDurations(branchId, serviceId, orderedIds) {
  mutateBranchCatalog(branchId, (catalog) => {
    orderedIds.forEach((id, index) => {
      const duration = catalog.durations.find((item) => item.id === id && item.serviceId === serviceId)
      if (duration) duration.sortOrder = index
    })
  })
}

export function getCatalogAdminTree(branchId) {
  const catalog = loadBranchCatalog(branchId)
  return catalog.categories
    .filter((category) => category.status !== ITEM_STATUS.DELETED)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => ({
      ...category,
      services: catalog.services
        .filter((service) => service.categoryId === category.id && service.status !== ITEM_STATUS.DELETED)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((service) => ({
          ...service,
          durations: catalog.durations
            .filter((duration) => duration.serviceId === service.id && duration.status !== ITEM_STATUS.DELETED)
            .sort((a, b) => a.sortOrder - b.sortOrder),
        })),
    }))
}
