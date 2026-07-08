import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const TABLE = 'branch_commission_policies'

export async function fetchCommissionPolicyMap() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from(TABLE).select('*')
  if (error) throw error

  const map = {}
  for (const row of data ?? []) {
    map[row.branch_id] = {
      branchId: row.branch_id,
      policyType: row.policy_type,
      flatRate: row.flat_rate,
      defaultRate: row.default_rate,
      groups: row.groups ?? [],
      updatedAt: row.updated_at,
    }
  }
  return map
}

export async function upsertCommissionPolicyMap(map) {
  if (!isSupabaseConfigured || !map || typeof map !== 'object') return
  const rows = Object.entries(map).map(([branchId, policy]) => ({
    branch_id: branchId,
    policy_type: policy?.policyType ?? 'flat',
    flat_rate: policy?.flatRate ?? null,
    default_rate: Number(policy?.defaultRate ?? 0),
    groups: policy?.groups ?? [],
    updated_at: new Date().toISOString(),
  }))
  if (rows.length === 0) return
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'branch_id' })
  if (error) throw error
}
