/**
 * Apply / verify migration 0035_create_attendance_edit_logs.sql
 *
 * Requires: SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 * Run: node --env-file=.env.local scripts/apply-0035-attendance-edit-logs-migration.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Thiếu SUPABASE_URL/VITE_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY')
  console.error('Chạy thủ công trên Supabase SQL Editor:')
  console.error('  supabase/migrations/0035_create_attendance_edit_logs.sql')
  process.exit(2)
}

const sqlPath = path.join(
  process.cwd(),
  'supabase/migrations/0035_create_attendance_edit_logs.sql',
)
const sql = fs.readFileSync(sqlPath, 'utf8')

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function tableReady() {
  const { error } = await sb.from('attendance_edit_logs').select('id').limit(1)
  return !error
}

async function applyMigration() {
  const { error } = await sb.rpc('exec_sql', { query: sql })
  if (error) throw error
}

console.log('\n=== Migration 0035: create attendance_edit_logs ===\n')

try {
  if (await tableReady()) {
    console.log('OK — Bảng attendance_edit_logs đã tồn tại')
    process.exit(0)
  }

  await applyMigration()

  if (!(await tableReady())) {
    console.error('Migration chạy xong nhưng chưa truy cập được attendance_edit_logs')
    process.exit(1)
  }
  console.log('OK — Migration 0035 đã áp dụng')
  process.exit(0)
} catch (error) {
  if (/exec_sql|function .* does not exist/i.test(error.message ?? '')) {
    console.error('Không có rpc exec_sql — chạy file SQL thủ công trên Supabase Dashboard → SQL Editor:')
    console.error(`  ${sqlPath}\n`)
    process.exit(2)
  }
  console.error('Lỗi:', error.message)
  console.error('\nChạy thủ công trên Supabase Dashboard → SQL Editor:')
  console.error(`  ${sqlPath}\n`)
  process.exit(1)
}
