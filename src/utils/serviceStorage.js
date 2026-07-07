import { DEFAULT_PRICE_GROUPS } from '../constants/defaultPriceGroups'
import { getAllPriceGroupIds, getPriceGroupIdForBranch } from '../constants/priceGroups'
import { getServicesForBranch, syncNewServiceToCustomBranchPricing } from './branchPricingStorage'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertServices } from '../repositories/servicesRepository'

function pushServicesToSupabase(services) {
  if (!isSupabaseConfigured) return
  upsertServices(services).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ dịch vụ:', error?.message)
  })
}

export const SERVICE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DELETED: 'deleted',
}

const STORAGE_KEY = 'spa-manager-services'
const VERSION_KEY = 'spa-manager-services-version'
const DATA_VERSION = 2

function normalizePriceEntry(entry) {
  return {
    price: Number(entry?.price) || 0,
    commissionPercent: Number(entry?.commissionPercent) || 0,
  }
}

export function normalizeService(service) {
  const priceLists = {}

  if (service.priceLists && typeof service.priceLists === 'object') {
    for (const [groupId, entry] of Object.entries(service.priceLists)) {
      if (entry) {
        priceLists[groupId] = normalizePriceEntry(entry)
      }
    }
  } else if (service.price !== undefined || service.commissionPercent !== undefined) {
    const legacyEntry = normalizePriceEntry(service)
    for (const groupId of getAllPriceGroupIds()) {
      priceLists[groupId] = { ...legacyEntry }
    }
  }

  return {
    id: service.id,
    name: service.name ?? '',
    status: service.status === SERVICE_STATUS.DELETED
      ? SERVICE_STATUS.DELETED
      : service.status === SERVICE_STATUS.INACTIVE
        ? SERVICE_STATUS.INACTIVE
        : SERVICE_STATUS.ACTIVE,
    priceLists,
  }
}

function buildDefaultServices() {
  const serviceMap = new Map()

  for (const [groupId, items] of Object.entries(DEFAULT_PRICE_GROUPS)) {
    for (const item of items) {
      if (!serviceMap.has(item.id)) {
        serviceMap.set(item.id, {
          id: item.id,
          name: item.name,
          status: SERVICE_STATUS.ACTIVE,
          priceLists: {},
        })
      }

      const service = serviceMap.get(item.id)
      service.name = item.name
      service.priceLists[groupId] = normalizePriceEntry(item)
    }
  }

  return Array.from(serviceMap.values()).map(normalizeService)
}

function seedDefaultServices() {
  const defaults = buildDefaultServices()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
  localStorage.setItem(VERSION_KEY, String(DATA_VERSION))
  return defaults
}

export function createServiceId(name) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  const existing = loadServices()
  let id = base || `service-${Date.now()}`
  let counter = 1
  while (existing.some((s) => s.id === id)) {
    id = `${base}-${counter}`
    counter += 1
  }
  return id
}

function migrateServicesToCurrentVersion(services) {
  if (!Array.isArray(services) || services.length === 0) {
    return seedDefaultServices()
  }

  const normalized = services.map(normalizeService)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  localStorage.setItem(VERSION_KEY, String(DATA_VERSION))
  return normalized
}

export function loadServices() {
  try {
    const storedVersion = Number(localStorage.getItem(VERSION_KEY) || 0)
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return seedDefaultServices()
    }

    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return seedDefaultServices()

    if (storedVersion < DATA_VERSION) {
      return migrateServicesToCurrentVersion(data)
    }

    const normalized = data.map(normalizeService)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    return normalized
  } catch {
    return seedDefaultServices()
  }
}

export function saveServices(services) {
  const normalized = services.map(normalizeService)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  localStorage.setItem(VERSION_KEY, String(DATA_VERSION))
  pushServicesToSupabase(normalized)
  return normalized
}

function isInPriceGroup(service, priceGroupId) {
  return Object.prototype.hasOwnProperty.call(service.priceLists, priceGroupId)
}

function resolveServicePricing(service, priceGroupId) {
  const entry = service.priceLists[priceGroupId]
  return {
    id: service.id,
    name: service.name,
    price: entry.price,
    commissionPercent: entry.commissionPercent,
    status: service.status,
  }
}

export function getServicesForPriceList(priceGroupId) {
  if (!priceGroupId) return []

  return loadServices()
    .filter((service) => service.status !== SERVICE_STATUS.DELETED)
    .filter((service) => isInPriceGroup(service, priceGroupId))
    .map((service) => resolveServicePricing(service, priceGroupId))
}

export function getActiveServicesForBranch(branchId) {
  if (!branchId) return []
  return getServicesForBranch(branchId).filter((service) => service.status === SERVICE_STATUS.ACTIVE)
}

export function getServiceMapForBranch(branchId) {
  return Object.fromEntries(
    getActiveServicesForBranch(branchId).map((service) => [service.id, service]),
  )
}

export function getServiceMap() {
  return getServiceMapForBranch('')
}

export function getActiveServices() {
  return loadServices().filter((service) => service.status === SERVICE_STATUS.ACTIVE)
}

export function getVisibleServices() {
  return loadServices().filter((service) => service.status !== SERVICE_STATUS.DELETED)
}

export function getStatusLabel(status) {
  if (status === SERVICE_STATUS.DELETED) return 'Đã xóa'
  return status === SERVICE_STATUS.INACTIVE ? 'Tạm tắt' : 'Đang dùng'
}

export function addService(data) {
  const services = loadServices()
  const entry = normalizePriceEntry(data)
  const priceLists = {}

  if (data.priceListId) {
    priceLists[data.priceListId] = entry
    for (const groupId of getAllPriceGroupIds()) {
      if (!priceLists[groupId]) {
        priceLists[groupId] = { ...entry }
      }
    }
  } else {
    for (const groupId of getAllPriceGroupIds()) {
      priceLists[groupId] = { ...entry }
    }
  }

  const service = normalizeService({
    id: data.id || createServiceId(data.name),
    name: data.name?.trim() ?? '',
    status: data.status ?? SERVICE_STATUS.ACTIVE,
    priceLists,
  })

  services.push(service)
  saveServices(services)
  syncNewServiceToCustomBranchPricing(service)
  return service
}

export function updateService(id, data) {
  const services = loadServices()
  const index = services.findIndex((s) => s.id === id)
  if (index === -1) return null

  const current = services[index]

  if (data.name !== undefined) {
    current.name = data.name?.trim() ?? current.name
  }

  if (data.status !== undefined) {
    current.status = data.status === SERVICE_STATUS.DELETED
      ? SERVICE_STATUS.DELETED
      : data.status === SERVICE_STATUS.INACTIVE
        ? SERVICE_STATUS.INACTIVE
        : SERVICE_STATUS.ACTIVE
  }

  if (data.priceListId) {
    current.priceLists[data.priceListId] = normalizePriceEntry({
      price: data.price ?? current.priceLists[data.priceListId]?.price,
      commissionPercent: data.commissionPercent
        ?? current.priceLists[data.priceListId]?.commissionPercent,
    })
    for (const groupId of getAllPriceGroupIds()) {
      if (!current.priceLists[groupId]) {
        current.priceLists[groupId] = { ...current.priceLists[data.priceListId] }
      }
    }
  }

  services[index] = normalizeService(current)
  saveServices(services)
  syncNewServiceToCustomBranchPricing(services[index])
  return services[index]
}

export function softDeleteService(id) {
  return updateService(id, { status: SERVICE_STATUS.DELETED })
}

export function disableService(id) {
  return updateService(id, { status: SERVICE_STATUS.INACTIVE })
}

export function enableService(id) {
  return updateService(id, { status: SERVICE_STATUS.ACTIVE })
}

// Backward-compatible aliases
export const getPriceListIdForBranch = getPriceGroupIdForBranch
