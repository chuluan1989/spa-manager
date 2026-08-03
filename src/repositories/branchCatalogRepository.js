import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const TABLE = 'branch_catalogs'

export async function fetchBranchCatalogsRemote() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from(TABLE).select('*')
  if (error) throw error

  const catalogs = {}
  for (const row of data ?? []) {
    catalogs[row.branch_id] = row.catalog ?? { version: 1, categories: [], services: [], durations: [] }
  }

  const { data: pricesData, error: pricesError } = await supabase
    .from('branch_service_prices')
    .select('*')
  if (pricesError) throw pricesError

  const branchPrices = {}
  for (const row of pricesData ?? []) {
    const branchId = row.branch_id
    if (!branchPrices[branchId]) branchPrices[branchId] = {}
    branchPrices[branchId][row.duration_id] = {
      price: Number(row.price) || 0,
      commissionPercent: Number(row.commission_percent) || 0,
    }
  }

  return { catalogs, branchPrices }
}

export async function upsertBranchCatalogsRemote(catalogs, branchPrices) {
  if (!isSupabaseConfigured || !catalogs) return
  const now = new Date().toISOString()

  const rows = Object.entries(catalogs).map(([branchId, catalog]) => ({
    branch_id: branchId,
    catalog,
    updated_at: now,
  }))

  if (rows.length) {
    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'branch_id' })
    if (error) throw error
  }

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

  if (priceRows.length) {
    const { error } = await supabase
      .from('branch_service_prices')
      .upsert(priceRows, { onConflict: 'branch_id,duration_id' })
    if (error) throw error
  }
}

/** Ghi một dòng giá/% lên Supabase trước khi cập nhật cache local (Phase D). */
export async function upsertBranchServicePriceRemote(branchId, durationId, { price, commissionPercent }) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể chỉnh bảng giá.')
  }
  if (!branchId || !durationId) {
    throw new Error('Thiếu chi nhánh hoặc dịch vụ.')
  }
  const { error } = await supabase.from('branch_service_prices').upsert({
    branch_id: branchId,
    duration_id: durationId,
    price: Number(price) || 0,
    commission_percent: Number(commissionPercent) || 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'branch_id,duration_id' })
  if (error) throw error
}
