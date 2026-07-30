/**
 * Apply / verify migration 0034_attendance_edit_logs_preserve_on_delete.sql
 *
 * Requires: SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 * Run: node --env-file=.env.local scripts/apply-0034-attendance-edit-logs-migration.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Thiếu SUPABASE_URL/VITE_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY')
  console.error('Chạy thủ công trên Supabase SQL Editor:')
  console.error('  supabase/migrations/0034_attendance_edit_logs_preserve_on_delete.sql')
  process.exit(2)
}

const sqlPath = path.join(
  process.cwd(),
  'supabase/migrations/0034_attendance_edit_logs_preserve_on_delete.sql',
)
const sql = fs.readFileSync(sqlPath, 'utf8')

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function verifyFk() {
  const { data, error } = await sb.rpc('exec_sql', { query: `
    select
      c.conname,
      pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'attendance_edit_logs'
      and c.contype = 'f'
      and c.conname = 'attendance_edit_logs_attendance_id_fkey'
  ` })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : null
  return row?.def?.includes('ON DELETE SET NULL') ?? false
}

async function applyMigration() {
  const statements = sql
    .split(';')
    .map((part) => part.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean)

  for (const statement of statements) {
    const { error } = await sb.rpc('exec_sql', { query: `${statement};` })
    if (error) throw error
  }
}

console.log('\n=== Migration 0034: attendance_edit_logs preserve on delete ===\n')

try {
  let ready = false
  try {
    ready = await verifyFk()
  } catch (verifyError) {
    if (!/exec_sql|function .* does not exist/i.test(verifyError.message ?? '')) {
      throw verifyError
    }
    console.warn('Không có rpc exec_sql — áp dụng migration trực tiếp...')
  }

  if (ready) {
    console.log('OK — FK attendance_edit_logs_attendance_id_fkey đã ON DELETE SET NULL')
    process.exit(0)
  }

  await applyMigration()
  ready = await verifyFk()
  if (!ready) {
    console.error('Migration chạy xong nhưng chưa xác nhận được FK SET NULL')
    process.exit(1)
  }
  console.log('OK — Migration 0034 đã áp dụng')
  process.exit(0)
} catch (error) {
  console.error('Lỗi:', error.message)
  console.error('\nChạy thủ công trên Supabase Dashboard → SQL Editor:')
  console.error(`  ${sqlPath}\n`)
  process.exit(1)
}
