/**
 * Kiểm tra Supabase bằng credentials đã nhúng trong bản Production hiện tại.
 * Không in ra URL/key — chỉ spawn verify-supabase.mjs với env tương ứng.
 *
 * Chạy: node scripts/verify-from-production.mjs
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

async function loadProductionSupabaseEnv() {
  const html = await fetch(BASE).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  if (!jsMatch) throw new Error('Không tìm thấy bundle JS trên Production')

  const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]

  if (!url || !key) {
    throw new Error(
      'Production chưa nhúng Supabase URL/key hợp lệ — kiểm tra VITE_SUPABASE_* trên Vercel và Redeploy.',
    )
  }

  return { url, key, keyLen: key.length, urlLen: url.length }
}

console.log(`\nLấy Supabase env từ Production: ${BASE}\n`)

const { url, key, keyLen, urlLen } = await loadProductionSupabaseEnv()
console.log(`  ✓ Tìm thấy Supabase URL (len=${urlLen}) và anon key (len=${keyLen})`)

const result = spawnSync('npx', ['vite-node', 'scripts/verify-supabase.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: key,
  },
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
