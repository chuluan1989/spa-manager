import { GIA_LAI_SERVICE_CATALOG } from '../constants/giaLaiServiceCatalog'
import { DEFAULT_PRICE_GROUPS } from '../constants/defaultPriceGroups'
import { PRICE_GROUP_IDS } from '../constants/priceGroupIds'
import { formatCatalogServiceName } from './serviceCatalog'
import { getBranchById, loadBranches } from './branchStorage'
import { readBranchPricingMapRaw } from './branchPricingStorage'
import { loadServices } from './serviceStorage'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { notifyDataSynced } from './dataSyncEvents'
import {
  fetchServiceCatalogV2Remote,
  upsertServiceCatalogV2Remote,
} from '../repositories/serviceCatalogV2Repository'

const CATALOG_KEY = 'spa-manager-service-catalog-v2'
const PRICES_KEY = 'spa-manager-branch-service-prices-v2'
const MIGRATED_KEY = 'spa-manager-service-catalog-v2-migrated'

export const ITEM_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DELETED: 'deleted',
}

function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function emptyCatalog() {
  return { version: 1, categories: [], services: [], durations: [] }
}

export function loadServiceCatalogV2() {
  try {
    const raw = localStorage.getItem(CATALOG_KEY)
    if (!raw) return emptyCatalog()
    const data = JSON.parse(raw)
    return {
      version: data.version ?? 1,
      categories: Array.isArray(data.categories) ? data.categories : [],
      services: Array.isArray(data.services) ? data.services : [],
      durations: Array.isArray(data.durations) ? data.durations : [],
    }
  } catch {
    return emptyCatalog()
  }
}

export function saveServiceCatalogV2(catalog, { skipRemoteSync = false, notify = true } = {}) {
  localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog))
  if (!skipRemoteSync && isSupabaseConfigured) {
    upsertServiceCatalogV2Remote(catalog, loadBranchServicePricesV2()).catch((error) => {
      console.warn('[Supabase] Không thể đồng bộ danh mục dịch vụ v2:', error?.message)
    })
  }
  if (notify) notifyDataSynced(['serviceCatalogV2'])
  return catalog
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
    upsertServiceCatalogV2Remote(loadServiceCatalogV2(), prices).catch((error) => {
      console.warn('[Supabase] Không thể đồng bộ bảng giá v2:', error?.message)
    })
  }
  if (notify) notifyDataSynced(['serviceCatalogV2', 'branchPricing'])
  return prices
}

function persistCatalogAndPrices(catalog, prices) {
  saveServiceCatalogV2(catalog, { notify: false })
  saveBranchServicePricesV2(prices, { notify: true })
}

function nextSortOrder(items) {
  if (!items.length) return 0
  return Math.max(...items.map((item) => Number(item.sortOrder) || 0)) + 1
}

function walkGiaLaiCatalog(catalog, categories, services, durations) {
  let categoryOrder = 0
  for (const group of catalog.groups ?? []) {
    categories.push({
      id: group.id,
      name: group.name,
      sortOrder: categoryOrder++,
      status: ITEM_STATUS.ACTIVE,
    })

    let serviceOrder = 0
    for (const family of group.families ?? []) {
      const serviceId = family.id
      services.push({
        id: serviceId,
        categoryId: group.id,
        name: family.name,
        sortOrder: serviceOrder++,
        status: ITEM_STATUS.ACTIVE,
      })
      let durationOrder = 0
      for (const variant of family.variants ?? []) {
        durations.push({
          id: variant.id,
          serviceId,
          durationMinutes: variant.durationMinutes ?? null,
          sortOrder: durationOrder++,
          status: ITEM_STATUS.ACTIVE,
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
          status: ITEM_STATUS.ACTIVE,
        })
        let durationOrder = 0
        for (const variant of entry.variants) {
          durations.push({
            id: variant.id,
            serviceId,
            durationMinutes: variant.durationMinutes ?? null,
            sortOrder: durationOrder++,
            status: ITEM_STATUS.ACTIVE,
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
          status: ITEM_STATUS.ACTIVE,
        })
        durations.push({
          id: durationId,
          serviceId,
          durationMinutes: entry.durationMinutes ?? null,
          sortOrder: 0,
          status: ITEM_STATUS.ACTIVE,
        })
      }
    }
  }
}

const FLAT_CATEGORY_MAP = {
  'body-60': 'massage-body',
  'body-75': 'massage-body',
  'body-90': 'massage-body',
  'chuyen-sau': 'massage-body',
  foot: 'massage-body',
  'co-vai-gay': 'massage-body',
  'goi-sach': 'goi-dau',
  'goi-duong-sinh': 'goi-dau',
  'combo-1': 'combo',
  'combo-2': 'combo',
  'combo-3': 'combo',
  'dap-thuoc': 'other',
  'giac-hoi': 'other',
  'cao-mat': 'other',
  'phong-don': 'other',
  'xong-hoi': 'other',
}

function parseDurationFromFlatId(serviceId) {
  const match = String(serviceId).match(/(\d+)$/)
  return match ? Number(match[1]) : null
}

function mergeFlatServices(catalog) {
  const durationIds = new Set(catalog.durations.map((d) => d.id))
  const serviceIds = new Set(catalog.services.map((s) => s.id))
  const categoryIds = new Set(catalog.categories.map((c) => c.id))

  for (const items of Object.values(DEFAULT_PRICE_GROUPS)) {
    for (const item of items) {
      if (durationIds.has(item.id)) continue

      const categoryId = FLAT_CATEGORY_MAP[item.id] ?? 'other'
      if (!categoryIds.has(categoryId)) {
        catalog.categories.push({
          id: categoryId,
          name: categoryId.toUpperCase(),
          sortOrder: catalog.categories.length,
          status: ITEM_STATUS.ACTIVE,
        })
        categoryIds.add(categoryId)
      }

      const serviceId = `flat-${item.id}`
      if (!serviceIds.has(serviceId)) {
        catalog.services.push({
          id: serviceId,
          categoryId,
          name: item.name,
          sortOrder: nextSortOrder(catalog.services.filter((s) => s.categoryId === categoryId)),
          status: ITEM_STATUS.ACTIVE,
        })
        serviceIds.add(serviceId)
      }

      catalog.durations.push({
        id: item.id,
        serviceId,
        durationMinutes: parseDurationFromFlatId(item.id),
        sortOrder: 0,
        status: ITEM_STATUS.ACTIVE,
      })
      durationIds.add(item.id)
    }
  }
}

function seedBranchPricesFromLegacy(catalog) {
  const prices = {}
  const branches = loadBranches()
  const legacyMap = readBranchPricingMapRaw()
  const flatServices = loadServices()

  for (const branch of branches) {
    prices[branch.id] = {}
    const legacyRecord = legacyMap[branch.id]

    for (const duration of catalog.durations) {
      const legacyOverride = legacyRecord?.overrides?.[duration.id]
      if (legacyOverride) {
        prices[branch.id][duration.id] = {
          price: Number(legacyOverride.price) || 0,
          commissionPercent: Number(legacyOverride.commissionPercent) || 0,
        }
        continue
      }

      const flatService = flatServices.find((s) => s.id === duration.id)
      const groupEntry = flatService?.priceLists?.[branch.priceGroupId]
      if (groupEntry) {
        prices[branch.id][duration.id] = {
          price: Number(groupEntry.price) || 0,
          commissionPercent: Number(groupEntry.commissionPercent) || 0,
        }
      }
    }

    if (legacyRecord?.catalog && legacyRecord?.overrides) {
      for (const [durationId, entry] of Object.entries(legacyRecord.overrides)) {
        if (durationId.startsWith('gl-')) {
          prices[branch.id][durationId] = {
            price: Number(entry.price) || 0,
            commissionPercent: Number(entry.commissionPercent) || 0,
          }
        }
      }
    }
  }

  return prices
}

export function buildCatalogFromLegacy() {
  const categories = []
  const services = []
  const durations = []
  walkGiaLaiCatalog(GIA_LAI_SERVICE_CATALOG, categories, services, durations)
  const catalog = { version: 1, categories, services, durations }
  mergeFlatServices(catalog)
  const branchPrices = seedBranchPricesFromLegacy(catalog)
  return { catalog, branchPrices }
}

export function ensureServiceCatalogV2Migrated() {
  if (localStorage.getItem(MIGRATED_KEY) === '1') {
    const catalog = loadServiceCatalogV2()
    if (catalog.categories.length > 0) return catalog
  }

  const { catalog, branchPrices } = buildCatalogFromLegacy()
  saveServiceCatalogV2(catalog, { skipRemoteSync: !isSupabaseConfigured, notify: false })
  saveBranchServicePricesV2(branchPrices, { skipRemoteSync: !isSupabaseConfigured, notify: false })
  localStorage.setItem(MIGRATED_KEY, '1')
  return catalog
}

export function applyRemoteServiceCatalogV2(remote) {
  if (!remote?.catalog?.categories?.length) return false
  saveServiceCatalogV2(remote.catalog, { skipRemoteSync: true, notify: false })
  saveBranchServicePricesV2(remote.branchPrices ?? {}, { skipRemoteSync: true, notify: false })
  localStorage.setItem(MIGRATED_KEY, '1')
  notifyDataSynced(['serviceCatalogV2'])
  return true
}

function getDurationPrice(branchId, durationId, pricesMap) {
  return pricesMap[branchId]?.[durationId] ?? { price: 0, commissionPercent: 0 }
}

export function getCatalogGroupsForBranchV2(branchId) {
  if (!branchId) return []
  ensureServiceCatalogV2Migrated()
  const catalog = loadServiceCatalogV2()
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
  ensureServiceCatalogV2Migrated()
  const catalog = loadServiceCatalogV2()
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
  ensureServiceCatalogV2Migrated()
  const catalog = loadServiceCatalogV2()
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
          serviceStatus: service.status,
          durationId: duration.id,
          durationMinutes: duration.durationMinutes,
          durationStatus: duration.status,
          price: priceEntry.price,
          commissionPercent: priceEntry.commissionPercent,
        })
      }
    }
  }

  return rows
}

export function setBranchDurationPrice(branchId, durationId, { price, commissionPercent }) {
  const prices = loadBranchServicePricesV2()
  if (!prices[branchId]) prices[branchId] = {}
  prices[branchId][durationId] = {
    price: Number(price) || 0,
    commissionPercent: Number(commissionPercent) || 0,
  }
  saveBranchServicePricesV2(prices)
  return prices[branchId][durationId]
}

export function addCategory({ name }) {
  const catalog = loadServiceCatalogV2()
  const category = {
    id: createId('cat'),
    name: name.trim(),
    sortOrder: nextSortOrder(catalog.categories),
    status: ITEM_STATUS.ACTIVE,
  }
  catalog.categories.push(category)
  saveServiceCatalogV2(catalog)
  return category
}

export function updateCategory(categoryId, patch) {
  const catalog = loadServiceCatalogV2()
  const index = catalog.categories.findIndex((item) => item.id === categoryId)
  if (index === -1) return null
  catalog.categories[index] = { ...catalog.categories[index], ...patch }
  saveServiceCatalogV2(catalog)
  return catalog.categories[index]
}

export function deleteCategory(categoryId) {
  const catalog = loadServiceCatalogV2()
  const hasServices = catalog.services.some(
    (service) => service.categoryId === categoryId && service.status !== ITEM_STATUS.DELETED,
  )
  if (hasServices) return { ok: false, error: 'Nhóm còn dịch vụ, không thể xóa.' }
  updateCategory(categoryId, { status: ITEM_STATUS.DELETED })
  return { ok: true }
}

export function reorderCategories(orderedIds) {
  const catalog = loadServiceCatalogV2()
  orderedIds.forEach((id, index) => {
    const category = catalog.categories.find((item) => item.id === id)
    if (category) category.sortOrder = index
  })
  saveServiceCatalogV2(catalog)
}

export function addService({ categoryId, name }) {
  const catalog = loadServiceCatalogV2()
  const service = {
    id: createId('svc'),
    categoryId,
    name: name.trim(),
    sortOrder: nextSortOrder(catalog.services.filter((item) => item.categoryId === categoryId)),
    status: ITEM_STATUS.ACTIVE,
  }
  catalog.services.push(service)
  saveServiceCatalogV2(catalog)
  return service
}

export function updateService(serviceId, patch) {
  const catalog = loadServiceCatalogV2()
  const index = catalog.services.findIndex((item) => item.id === serviceId)
  if (index === -1) return null
  catalog.services[index] = { ...catalog.services[index], ...patch }
  saveServiceCatalogV2(catalog)
  return catalog.services[index]
}

export function deleteService(serviceId) {
  return updateService(serviceId, { status: ITEM_STATUS.DELETED })
}

export function setServiceVisibility(serviceId, status) {
  return updateService(serviceId, { status })
}

export function reorderServices(categoryId, orderedIds) {
  const catalog = loadServiceCatalogV2()
  orderedIds.forEach((id, index) => {
    const service = catalog.services.find((item) => item.id === id)
    if (service && service.categoryId === categoryId) service.sortOrder = index
  })
  saveServiceCatalogV2(catalog)
}

export function addDuration({ serviceId, durationMinutes }) {
  const catalog = loadServiceCatalogV2()
  const duration = {
    id: createId('dur'),
    serviceId,
    durationMinutes: durationMinutes === '' || durationMinutes == null ? null : Number(durationMinutes),
    sortOrder: nextSortOrder(catalog.durations.filter((item) => item.serviceId === serviceId)),
    status: ITEM_STATUS.ACTIVE,
  }
  catalog.durations.push(duration)

  const prices = loadBranchServicePricesV2()
  for (const branch of loadBranches()) {
    if (!prices[branch.id]) prices[branch.id] = {}
    if (!prices[branch.id][duration.id]) {
      prices[branch.id][duration.id] = { price: 0, commissionPercent: 0 }
    }
  }

  saveServiceCatalogV2(catalog, { notify: false })
  saveBranchServicePricesV2(prices)
  return duration
}

export function updateDuration(durationId, patch) {
  const catalog = loadServiceCatalogV2()
  const index = catalog.durations.findIndex((item) => item.id === durationId)
  if (index === -1) return null
  catalog.durations[index] = {
    ...catalog.durations[index],
    ...patch,
    durationMinutes: patch.durationMinutes === '' || patch.durationMinutes == null
      ? null
      : Number(patch.durationMinutes),
  }
  saveServiceCatalogV2(catalog)
  return catalog.durations[index]
}

export function deleteDuration(durationId) {
  return updateDuration(durationId, { status: ITEM_STATUS.DELETED })
}

export function setDurationVisibility(durationId, status) {
  return updateDuration(durationId, { status })
}

export function reorderDurations(serviceId, orderedIds) {
  const catalog = loadServiceCatalogV2()
  orderedIds.forEach((id, index) => {
    const duration = catalog.durations.find((item) => item.id === id && item.serviceId === serviceId)
    if (duration) duration.sortOrder = index
  })
  saveServiceCatalogV2(catalog)
}

export function getCatalogAdminTree() {
  ensureServiceCatalogV2Migrated()
  const catalog = loadServiceCatalogV2()
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

export function isServiceCatalogV2Ready() {
  const catalog = loadServiceCatalogV2()
  return catalog.categories.length > 0
}
