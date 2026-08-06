/**
 * PRE-PRODUCTION — Dry Run ONE SOURCE OF TRUTH trên dữ liệu Production.
 * READ ONLY: không ghi DB, không migration, không backfill, không update, không deploy.
 *
 *   node scripts/dry-run-payroll-sot-production-readonly.mjs
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'

console.log('\n=== PRE-PROD DRY RUN · READ ONLY · ONE SOURCE OF TRUTH ===')
console.log(`Production: ${BASE}`)
console.log('Mode: READ ONLY (no write / migrate / backfill / deploy)\n')

const { url, key, keyLen } = await loadProductionSupabaseEnv(BASE)
console.log(`Supabase URL loaded · anon key length=${keyLen} (not logged)`)

const result = spawnSync(
  'npx',
  ['vite-node', 'scripts/dry-run-payroll-sot-production-core.mjs'],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_ANON_KEY: key,
      AUDIT_FROM_PRODUCTION: '1',
      DRY_RUN_READONLY: '1',
    },
    stdio: 'inherit',
  },
)

process.exit(result.status ?? 1)
