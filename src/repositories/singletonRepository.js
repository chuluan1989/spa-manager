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

export async function upsertSingletonPayload(table, payload, { required = false } = {}) {
  if (!payload) {
    if (required) throw new Error(`Không thể ghi ${table}: payload rỗng`)
    return
  }
  if (!isSupabaseConfigured) {
    if (required) {
      throw new Error(`Không thể ghi ${table}: Supabase chưa cấu hình (thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)`)
    }
    return
  }
  const { data, error } = await supabase
    .from(table)
    .upsert(
      { id: SINGLETON_ID, payload, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
    .select('id')
  if (error) throw error
  if (required && (!data || data.length === 0)) {
    throw new Error(`Ghi ${table} thất bại: Supabase không trả về dòng nào (kiểm tra RLS / quyền anon key)`)
  }
}
