import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { rowsToCamel } from './caseUtils'

const TABLES = {
  categories: 'service_categories',
  services: 'catalog_services',
  durations: 'service_durations',
  prices: 'branch_service_prices',
}

export async function fetchServiceCatalogV2Remote() {
  if (!isSupabaseConfigured) return null
  const [categoriesRes, servicesRes, durationsRes, pricesRes] = await Promise.all([
    supabase.from(TABLES.categories).select('*').order('sort_order'),
    supabase.from(TABLES.services).select('*').order('sort_order'),
    supabase.from(TABLES.durations).select('*').order('sort_order'),
    supabase.from(TABLES.prices).select('*'),
  ])
  if (categoriesRes.error) throw categoriesRes.error
  if (servicesRes.error) throw servicesRes.error
  if (durationsRes.error) throw durationsRes.error
  if (pricesRes.error) throw pricesRes.error

  const branchPrices = {}
  for (const row of pricesRes.data ?? []) {
    const branchId = row.branch_id
    if (!branchPrices[branchId]) branchPrices[branchId] = {}
    branchPrices[branchId][row.duration_id] = {
      price: Number(row.price) || 0,
      commissionPercent: Number(row.commission_percent) || 0,
    }
  }

  return {
    catalog: {
      version: 1,
      categories: rowsToCamel(categoriesRes.data ?? []),
      services: rowsToCamel(servicesRes.data ?? []),
      durations: rowsToCamel(durationsRes.data ?? []),
    },
    branchPrices,
  }
}

export async function upsertServiceCatalogV2Remote(catalog, branchPrices) {
  if (!isSupabaseConfigured || !catalog) return
  const now = new Date().toISOString()

  const categoryRows = (catalog.categories ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? '',
    sort_order: Number(row.sortOrder) || 0,
    status: row.status ?? 'active',
    updated_at: now,
  }))
  const serviceRows = (catalog.services ?? []).map((row) => ({
    id: row.id,
    category_id: row.categoryId,
    name: row.name ?? '',
    sort_order: Number(row.sortOrder) || 0,
    status: row.status ?? 'active',
    updated_at: now,
  }))
  const durationRows = (catalog.durations ?? []).map((row) => ({
    id: row.id,
    service_id: row.serviceId,
    duration_minutes: row.durationMinutes ?? null,
    sort_order: Number(row.sortOrder) || 0,
    status: row.status ?? 'active',
    updated_at: now,
  }))
  const priceRows = []
  for (const [branchId, entries] of Object.entries(branchPrices ?? {})) {
    for (const [durationId, entry] of Object.entries(entries ?? {})) {
      priceRows.push({
        branch_id: branchId,
        duration_id: durationId,
        price: Number(entry?.price) || 0,
        commission_percent: Number(entry?.commissionPercent) || 0,
        updated_at: now,
      })
    }
  }

  const upserts = []
  if (categoryRows.length) upserts.push(supabase.from(TABLES.categories).upsert(categoryRows, { onConflict: 'id' }))
  if (serviceRows.length) upserts.push(supabase.from(TABLES.services).upsert(serviceRows, { onConflict: 'id' }))
  if (durationRows.length) upserts.push(supabase.from(TABLES.durations).upsert(durationRows, { onConflict: 'id' }))
  if (priceRows.length) upserts.push(supabase.from(TABLES.prices).upsert(priceRows, { onConflict: 'branch_id,duration_id' }))

  const results = await Promise.all(upserts)
  for (const result of results) {
    if (result.error) throw result.error
  }
}
