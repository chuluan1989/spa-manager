/**
 * Runner: load Production Supabase env rồi spawn vite-node E2E verify.
 * Run: node scripts/run-verify-attendance-audit-e2e.mjs
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const { url, key, base } = await loadProductionSupabaseEnv()

console.log(`\nSpawning attendance audit E2E against ${base}\n`)

const result = spawnSync('npx', ['vite-node', 'scripts/verify-attendance-audit-e2e.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: key,
    PRODUCTION_URL: base,
  },
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
