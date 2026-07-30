/**
 * Build preview bundle với Supabase env từ Production (khi .env.local là placeholder).
 * Usage: node scripts/build-preview-with-production-env.mjs
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'

console.log(`\nBuild preview với Supabase env từ ${BASE}\n`)

const { url, key, keyLen, urlLen } = await loadProductionSupabaseEnv(BASE)
console.log(`  ✓ Supabase URL (len=${urlLen}) + anon key (len=${keyLen})`)

const result = spawnSync('node', ['./node_modules/vite/bin/vite.js', 'build'], {
  cwd: ROOT,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: key,
  },
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
