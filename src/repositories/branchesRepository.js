import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'branches'

/** Trả về `null` khi Supabase chưa cấu hình — gọi nơi khác phải tự fallback LocalStorage. */
export async function fetchBranches() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return rowsToCamel(data)
}

export async function upsertBranches(branches) {
  if (!isSupabaseConfigured || !Array.isArray(branches) || branches.length === 0) return
  const rows = branches.map((branch) =>
    objectToSnakeRow({ ...branch, updatedAt: new Date().toISOString() }),
  )
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

/** Chỉ cột Supabase — đủ FK trước khi chấm công. */
export async function upsertBranchMinimal(branch) {
  if (!isSupabaseConfigured || !branch?.id) return

  const extendedRow = objectToSnakeRow({
    id: branch.id,
    name: branch.name ?? '',
    status: branch.status ?? 'active',
    priceGroupId: branch.priceGroupId ?? 'standard',
    supportEnabled: Boolean(branch.supportEnabled),
    sortOrder: Number.isFinite(Number(branch.sortOrder)) ? Number(branch.sortOrder) : 99,
    address: branch.address ?? '',
    hotline: branch.hotline ?? '',
    updatedAt: new Date().toISOString(),
  })

  let { error } = await supabase.from(TABLE).upsert(extendedRow, { onConflict: 'id' })
  if (error && /column|sort_order|address|hotline/.test(error.message ?? '')) {
    const baseRow = { ...extendedRow }
    delete baseRow.sort_order
    delete baseRow.address
    delete baseRow.hotline
    ;({ error } = await supabase.from(TABLE).upsert(baseRow, { onConflict: 'id' }))
  }
  if (error) throw error
}

export async function countBranches() {
  if (!isSupabaseConfigured) return 0
  const { count, error } = await supabase.from(TABLE).select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}
