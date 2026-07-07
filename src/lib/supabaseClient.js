import { createClient } from '@supabase/supabase-js'

/**
 * Cấu hình Supabase qua biến môi trường (Vite). Nếu chưa thiết lập —
 * ví dụ khi chạy local lần đầu, chạy smoke test, hoặc chưa có project
 * Supabase — ứng dụng phải tiếp tục hoạt động bình thường bằng
 * LocalStorage, KHÔNG được throw lỗi ở đây.
 *
 * Thiết lập tại Vercel (Project Settings → Environment Variables) hoặc
 * file .env.local khi phát triển:
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbG....
 */
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

let client = null

if (isSupabaseConfigured) {
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

/** `null` khi chưa cấu hình hoặc khởi tạo lỗi — luôn kiểm tra `isSupabaseConfigured`/`supabase` trước khi gọi. */
export const supabase = client
