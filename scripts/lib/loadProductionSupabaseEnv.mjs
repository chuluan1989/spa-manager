/**
 * Lấy Supabase URL + anon key đã nhúng trong bundle Production/Preview.
 * Không log giá trị key — chỉ trả về object nội bộ cho verify scripts.
 */
export async function loadProductionSupabaseEnv(base = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn') {
  const html = await fetch(base).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"']+\.js/)
  if (!jsMatch) throw new Error(`Không tìm thấy bundle JS tại ${base}`)

  const js = await fetch(`${base}${jsMatch[0]}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]

  if (!url || !key || key.length < 40) {
    throw new Error(
      'Bundle chưa nhúng Supabase URL/key hợp lệ — kiểm tra VITE_SUPABASE_* trên Vercel và redeploy.',
    )
  }

  return { url, key, keyLen: key.length, urlLen: url.length, base }
}

export function isPlaceholderSupabaseKey(key) {
  const text = String(key ?? '').trim()
  if (!text || text.length < 40) return true
  return /\.\.\.|placeholder|KEY_THẬT|example|mẫu/i.test(text)
}
