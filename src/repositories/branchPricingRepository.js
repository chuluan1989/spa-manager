import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const TABLE = 'branch_pricing'

export async function fetchBranchPricingMap() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from(TABLE).select('*')
  if (error) throw error

  const map = {}
  for (const row of data ?? []) {
    map[row.branch_id] = {
      useCustom: Boolean(row.use_custom),
      catalogVersion: Number(row.catalog_version) || 0,
      catalog: row.catalog ?? null,
      overrides: row.overrides ?? {},
    }
  }
  return map
}

export async function upsertBranchPricingMap(map) {
  if (!isSupabaseConfigured || !map || typeof map !== 'object') return
  const rows = Object.entries(map).map(([branchId, record]) => ({
    branch_id: branchId,
    use_custom: Boolean(record?.useCustom),
    catalog_version: Number(record?.catalogVersion) || 0,
    catalog: record?.catalog ?? null,
    overrides: record?.overrides ?? {},
    updated_at: new Date().toISOString(),
  }))
  if (rows.length === 0) return
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'branch_id' })
  if (error) throw error
}
