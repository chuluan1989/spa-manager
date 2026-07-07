import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const SINGLETON_ID = 'singleton'

/**
 * Dùng chung cho các bảng dạng "1 dòng cấu hình" (credentials, permissions,
 * settings): mỗi bảng chỉ có một dòng `id = 'singleton'` chứa toàn bộ dữ
 * liệu dạng jsonb trong cột `payload`.
 */
export async function fetchSingletonPayload(table) {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .from(table)
    .select('payload')
    .eq('id', SINGLETON_ID)
    .maybeSingle()
  if (error) throw error
  return data?.payload ?? null
}

export async function upsertSingletonPayload(table, payload) {
  if (!isSupabaseConfigured || !payload) return
  const { error } = await supabase
    .from(table)
    .upsert(
      { id: SINGLETON_ID, payload, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
  if (error) throw error
}
