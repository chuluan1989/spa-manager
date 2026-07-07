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
    overrides: record?.overrides ?? {},
    updated_at: new Date().toISOString(),
  }))
  if (rows.length === 0) return
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'branch_id' })
  if (error) throw error
}
