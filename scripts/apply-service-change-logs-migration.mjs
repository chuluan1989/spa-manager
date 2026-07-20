/**
 * Verify service_change_logs table on Supabase.
 * DDL: chạy supabase/migrations/0032_service_change_logs.sql trên SQL Editor.
 *
 * Chạy: node --env-file=.env.local scripts/apply-service-change-logs-migration.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const sb = createClient(url, key)
const migrationPath = path.join(process.cwd(), 'supabase/migrations/0032_service_change_logs.sql')

async function tableReady() {
  const { error } = await sb.from('service_change_logs').select('id').limit(1)
  if (!error) return true
  if (/does not exist|schema cache|Could not find the table/i.test(error.message)) return false
  throw error
}

console.log('\n=== Service change logs migration ===\n')
console.log(`Migration file: ${migrationPath}`)
console.log(`Exists: ${fs.existsSync(migrationPath)}`)

try {
  const ready = await tableReady()
  if (ready) {
    console.log('service_change_logs: OK')
    process.exit(0)
  }
  console.error('service_change_logs: MISSING')
  console.error('\nChạy SQL trên Supabase Dashboard → SQL Editor:')
  console.error('  supabase/migrations/0032_service_change_logs.sql\n')
  process.exit(2)
} catch (error) {
  console.error('Lỗi kiểm tra:', error.message)
  process.exit(1)
}
