import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase cho script ghi dữ liệu.
 * Ưu tiên service role (SUPABASE_SERVICE_ROLE_KEY) nếu có — fallback anon.
 */
export function createSupabaseWriteClient({ url, anonKey }) {
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (serviceKey) {
    return {
      client: createClient(url, serviceKey),
      mode: 'service_role',
    }
  }
  return {
    client: createClient(url, anonKey),
    mode: 'anon',
  }
}

export async function fetchCredentialsPayload(client) {
  const { data, error } = await client
    .from('app_credentials')
    .select('payload, updated_at')
    .eq('id', 'singleton')
    .maybeSingle()
  if (error) throw new Error(`Đọc app_credentials: ${error.message}`)
  return data ?? null
}

export async function upsertCredentialsPayload(client, payload) {
  const { data, error } = await client
    .from('app_credentials')
    .upsert(
      { id: 'singleton', payload, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
    .select('id, updated_at')
  if (error) throw new Error(`Ghi app_credentials: ${error.message}`)
  if (!data?.length) {
    throw new Error('Ghi app_credentials thất bại: Supabase không trả về dòng (kiểm tra RLS / anon key / service role)')
  }
  return data[0]
}
