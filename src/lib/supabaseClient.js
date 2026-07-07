import { createClient } from '@supabase/supabase-js'

/**
 * Cấu hình Supabase qua biến môi trường (Vite). Nếu chưa thiết lập hoặc giá
 * trị không hợp lệ — ứng dụng phải tiếp tục hoạt động bình thường bằng
 * LocalStorage, KHÔNG được throw lỗi ở đây.
 *
 * Thiết lập tại Vercel (Project Settings → Environment Variables) hoặc
 * file .env.local khi phát triển:
 *   VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
 *   VITE_SUPABASE_ANON_KEY=sb_publishable_... hoặc eyJhbG...
 */
const PLACEHOLDER_PATTERN = /URL_THẬT|KEY_THẬT|YOUR_|XXXX|placeholder|điền|paste|example|mẫu/i

function normalizeEnvValue(value) {
  return String(value ?? '').trim().replace(/^['"]|['"]$/g, '')
}

function isPlaceholderValue(value) {
  const text = normalizeEnvValue(value)
  if (!text) return true
  return PLACEHOLDER_PATTERN.test(text)
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Chuẩn hoá Project URL: thêm https:// nếu thiếu, hoặc ghép từ project ref. */
export function normalizeSupabaseUrl(raw) {
  let url = normalizeEnvValue(raw)
  if (!url || isPlaceholderValue(url)) return ''

  if (!/^https?:\/\//i.test(url)) {
    if (/^[a-z0-9-]+\.supabase\.co$/i.test(url)) {
      url = `https://${url}`
    } else if (/^[a-z0-9]{8,30}$/i.test(url)) {
      url = `https://${url}.supabase.co`
    }
  }

  url = url.replace(/\/+$/, '')
  return isValidHttpUrl(url) ? url : ''
}

export function normalizeSupabaseAnonKey(raw) {
  const key = normalizeEnvValue(raw)
  if (!key || isPlaceholderValue(key)) return ''
  return key
}

const SUPABASE_URL = normalizeSupabaseUrl(import.meta.env?.VITE_SUPABASE_URL)
const SUPABASE_ANON_KEY = normalizeSupabaseAnonKey(import.meta.env?.VITE_SUPABASE_ANON_KEY)

let client = null

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  } catch (error) {
    console.warn('[Supabase] Không khởi tạo được client, dùng LocalStorage:', error?.message)
    client = null
  }
}

/** `true` khi env hợp lệ VÀ client khởi tạo thành công. */
export const isSupabaseConfigured = Boolean(client)

/** `null` khi chưa cấu hình hoặc khởi tạo lỗi — luôn kiểm tra trước khi gọi. */
export const supabase = client
