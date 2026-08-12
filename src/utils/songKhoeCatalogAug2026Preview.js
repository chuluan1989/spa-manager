/**
 * Preview-only: hoàn thiện catalog Sống Khoẻ (song-khoe-spa).
 * - Giữ 11 dịch vụ đúng giá: không update price, không ghi change-log giả
 * - INSERT 4 dịch vụ thiếu (dedupe serviceId + normalized name)
 * - Chuẩn hóa label 15 dịch vụ (cùng serviceId/durationId)
 * - skipRemoteSync mặc định: Preview ≠ Production DB write
 */
import { DEFAULT_PRICE_GROUPS } from '../constants/defaultPriceGroups'
import { PRICE_GROUP_IDS } from '../constants/priceGroupIds'
import {
  loadBranchCatalog,
  loadBranchServicePricesV2,
  saveBranchCatalog,
  saveBranchServicePricesV2,
} from './serviceCatalogV2Storage'
import { notifyDataSynced } from './supabaseSync'

export const SONG_KHOE_BRANCH_ID = 'song-khoe-spa'
export const SONG_KHOE_AUG2026_TARGET = DEFAULT_PRICE_GROUPS[PRICE_GROUP_IDS.SONG_KHOE_SPA]

const ACTIVE = 'active'

export function normalizeServiceLabel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDurationMinutes(serviceId) {
  const KNOWN = {
    'body-60': 60,
    'body-75': 75,
    'body-90': 90,
    'goi-sach': 30,
    'goi-duong-sinh': 60,
    'cao-mat': 30,
    'chuyen-sau': 90,
    'combo-1': null,
    'combo-2': null,
    'combo-3': null,
    foot: 30,
    'co-vai-gay': 60,
    'giac-hoi': 30,
    'dap-thuoc': null,
    'phong-don': null,
  }
  if (Object.prototype.hasOwnProperty.call(KNOWN, serviceId)) return KNOWN[serviceId]
  const match = String(serviceId).match(/(?:^|-)(\d+)$/)
  return match ? Number(match[1]) : null
}

function findDuration(catalog, durationId) {
  return (catalog.durations || []).find((d) => d.id === durationId) || null
}

function findService(catalog, serviceId) {
  return (catalog.services || []).find((s) => s.id === serviceId) || null
}

function findServiceByNormalizedName(catalog, name) {
  const target = normalizeServiceLabel(name)
  if (!target) return null
  return (catalog.services || []).find((s) => {
    if (s.status === 'deleted') return false
    const n = normalizeServiceLabel(s.name)
    if (n === target) return true
    // soft match: "combo 1" vs "combo 1 massage 60p..."
    if (target.startsWith('combo ') || n.startsWith('combo ')) {
      const a = target.match(/^combo\s*[123]/)?.[0]
      const b = n.match(/^combo\s*[123]/)?.[0]
      if (a && b && a === b) return true
    }
    if (target.includes('dap thuoc') && n.includes('dap thuoc')) return true
    return false
  }) || null
}

/**
 * @param {{ skipRemote?: boolean }} [options]
 * @returns {{
 *   branchId: string,
 *   actions: Array<object>,
 *   catalog: object,
 *   prices: Record<string, {price:number, commissionPercent:number}>,
 *   services: Array<object>,
 * }}
 */
export function applySongKhoeCatalogAug2026Preview(options = {}) {
  const skipRemote = options.skipRemote !== false
  const branchId = SONG_KHOE_BRANCH_ID
  const catalog = structuredClone(loadBranchCatalog(branchId))
  const allPrices = loadBranchServicePricesV2()
  const prices = { ...(allPrices[branchId] || {}) }
  const actions = []

  if (!catalog.categories?.length) {
    catalog.categories = [{
      id: `${branchId}-services`,
      name: 'DỊCH VỤ',
      sortOrder: 0,
      status: ACTIVE,
    }]
  }
  const categoryId = catalog.categories[0].id
  catalog.services = Array.isArray(catalog.services) ? catalog.services : []
  catalog.durations = Array.isArray(catalog.durations) ? catalog.durations : []

  SONG_KHOE_AUG2026_TARGET.forEach((item, index) => {
    const duration = findDuration(catalog, item.id)
    const existingPrice = prices[item.id]
    let service = duration ? findService(catalog, duration.serviceId) : null

    // Dedupe by normalized name before insert
    if (!duration) {
      const nameHit = findServiceByNormalizedName(catalog, item.name)
      if (nameHit) {
        const linkedDuration = (catalog.durations || []).find((d) => d.serviceId === nameHit.id)
        if (linkedDuration) {
          actions.push({
            id: item.id,
            action: 'SKIP_DUPLICATE_NAME',
            existingDurationId: linkedDuration.id,
            existingServiceId: nameHit.id,
            name: nameHit.name,
          })
          // Still normalize label on the existing service if needed
          if (nameHit.name !== item.name) {
            actions.push({
              id: linkedDuration.id,
              action: 'RENAME_LABEL',
              from: nameHit.name,
              to: item.name,
            })
            nameHit.name = item.name
          }
          return
        }
      }
    }

    if (!duration) {
      const serviceId = `${branchId}-svc-${item.id}`
      if (findService(catalog, serviceId)) {
        actions.push({ id: item.id, action: 'SKIP_DUPLICATE_SERVICE_ID', serviceId })
      } else {
        catalog.services.push({
          id: serviceId,
          categoryId,
          name: item.name,
          sortOrder: index,
          status: ACTIVE,
        })
        catalog.durations.push({
          id: item.id,
          serviceId,
          durationMinutes: parseDurationMinutes(item.id),
          sortOrder: 0,
          status: ACTIVE,
        })
        actions.push({
          id: item.id,
          action: 'INSERT',
          serviceId,
          name: item.name,
          price: item.price,
          commissionPercent: item.commissionPercent,
        })
      }
      service = findService(catalog, serviceId)
    } else {
      service = findService(catalog, duration.serviceId)
      if (service && service.name !== item.name) {
        actions.push({
          id: item.id,
          action: 'RENAME_LABEL',
          serviceId: service.id,
          from: service.name,
          to: item.name,
        })
        service.name = item.name
      } else {
        actions.push({
          id: item.id,
          action: 'UNCHANGED',
          serviceId: service?.id || duration.serviceId,
          name: service?.name || item.name,
        })
      }
      if (duration.status !== ACTIVE) duration.status = ACTIVE
      if (service && service.status !== ACTIVE) service.status = ACTIVE
      const wantMinutes = parseDurationMinutes(item.id)
      if (duration.durationMinutes !== wantMinutes) {
        duration.durationMinutes = wantMinutes
      }
    }

    // Prices: only insert missing; never rewrite matching price/% (no fake audit)
    if (!existingPrice) {
      prices[item.id] = {
        price: item.price,
        commissionPercent: item.commissionPercent,
      }
      if (!actions.some((a) => a.id === item.id && a.action === 'INSERT')) {
        actions.push({
          id: item.id,
          action: 'INSERT_PRICE_ONLY',
          price: item.price,
          commissionPercent: item.commissionPercent,
        })
      }
    } else {
      const curPrice = Number(existingPrice.price) || 0
      const curPct = Number(existingPrice.commissionPercent)
      if (curPrice === item.price && Number.isFinite(curPct)) {
        // leave as-is
      } else if (curPrice === item.price && !Number.isFinite(curPct)) {
        // fill missing percent only without touching price
        prices[item.id] = {
          price: curPrice,
          commissionPercent: item.commissionPercent,
        }
        actions.push({
          id: item.id,
          action: 'FILL_COMMISSION_ONLY',
          commissionPercent: item.commissionPercent,
        })
      } else if (curPrice !== item.price) {
        // Preview target says keep correct prices — do not auto-fix unless missing insert path
        actions.push({
          id: item.id,
          action: 'PRICE_DIFF_LEFT_UNCHANGED',
          current: curPrice,
          expected: item.price,
          commissionPercent: curPct,
        })
      }
    }
  })

  allPrices[branchId] = prices
  saveBranchCatalog(branchId, catalog, { skipRemoteSync: skipRemote, notify: false })
  saveBranchServicePricesV2(allPrices, { skipRemoteSync: skipRemote, notify: false })
  notifyDataSynced(['serviceCatalogV2', 'branchPricing'])

  const services = SONG_KHOE_AUG2026_TARGET.map((item) => {
    const duration = findDuration(catalog, item.id)
    const service = duration ? findService(catalog, duration.serviceId) : null
    const priceEntry = prices[item.id] || {}
    return {
      id: item.id,
      serviceId: duration?.serviceId || `${branchId}-svc-${item.id}`,
      name: service?.name || item.name,
      price: Number(priceEntry.price ?? item.price) || 0,
      commissionPercent: Number.isFinite(Number(priceEntry.commissionPercent))
        ? Number(priceEntry.commissionPercent)
        : item.commissionPercent,
    }
  })

  return {
    branchId,
    actions,
    catalog,
    prices,
    services,
    summary: {
      insert: actions.filter((a) => a.action === 'INSERT').map((a) => a.id),
      renameLabel: actions.filter((a) => a.action === 'RENAME_LABEL').map((a) => a.id),
      unchanged: actions.filter((a) => a.action === 'UNCHANGED').map((a) => a.id),
      skippedDuplicate: actions.filter((a) => a.action.startsWith('SKIP_')).map((a) => a.id),
      priceLeftUnchanged: actions.filter((a) => a.action === 'PRICE_DIFF_LEFT_UNCHANGED').map((a) => a.id),
    },
  }
}

/** Idempotent helper for App bootstrap (Preview env only). */
export function maybeApplySongKhoeCatalogAug2026PreviewFromEnv() {
  if (typeof import.meta === 'undefined') return null
  if (import.meta.env?.VITE_SONG_KHOE_CATALOG_PREVIEW !== '1') return null
  return applySongKhoeCatalogAug2026Preview({ skipRemote: true })
}
