/**
 * Apply/verify fixed costs schema on Supabase.
 * Chạy: node --env-file=.env.local scripts/apply-fixed-costs-setup.mjs
 *
 * DDL phải chạy tay trên Supabase SQL Editor:
 *   supabase/RUN_FIXED_COSTS_SETUP.sql
 * Script này seed dữ liệu khi bảng đã tồn tại.
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
const sqlPath = path.join(process.cwd(), 'supabase/RUN_FIXED_COSTS_SETUP.sql')

const DEFAULT_RENT = [
  { id: 'fc-soc-trang-mat-bang', branch_id: 'soc-trang', amount: 10_000_000 },
  { id: 'fc-vinh-long-mat-bang', branch_id: 'vinh-long', amount: 20_000_000 },
  { id: 'fc-song-khoe-spa-mat-bang', branch_id: 'song-khoe-spa', amount: 15_000_000 },
  { id: 'fc-bac-lieu-mat-bang', branch_id: 'bac-lieu', amount: 15_000_000 },
  { id: 'fc-tra-vinh-mat-bang', branch_id: 'tra-vinh', amount: 13_000_000 },
  { id: 'fc-tram-spa-mat-bang', branch_id: 'tram-spa', amount: 10_000_000 },
]

const DEFAULT_CATEGORIES = [
  { id: 'mat-bang', label: 'Mặt bằng', sort_order: 1, is_system: true, is_fixed: true },
  { id: 'quang-cao-facebook', label: 'Quảng cáo Facebook', sort_order: 10, is_system: true, is_fixed: false },
  { id: 'quang-cao-tiktok', label: 'Quảng cáo TikTok', sort_order: 11, is_system: true, is_fixed: false },
  { id: 'dien', label: 'Điện', sort_order: 20, is_system: true, is_fixed: false },
  { id: 'nuoc', label: 'Nước', sort_order: 21, is_system: true, is_fixed: false },
  { id: 'wifi', label: 'Wifi', sort_order: 22, is_system: true, is_fixed: false },
  { id: 'shopee', label: 'Shopee', sort_order: 30, is_system: true, is_fixed: false },
  { id: 'sua-chua', label: 'Sửa chữa', sort_order: 40, is_system: true, is_fixed: false },
  { id: 'khac', label: 'Chi phí khác', sort_order: 99, is_system: true, is_fixed: false },
]

async function tableExists(name) {
  const { error } = await sb.from(name).select('*').limit(1)
  if (!error) return true
  if (/does not exist|schema cache|Could not find the table/i.test(error.message)) return false
  // permission / empty still means table exists
  return !/relation .* does not exist/i.test(error.message)
}

console.log('\n=== Fixed costs setup ===\n')
console.log(`SQL file: ${sqlPath}`)
console.log(`Exists: ${fs.existsSync(sqlPath)}`)

const hasFixed = await tableExists('branch_fixed_costs')
const hasCats = await tableExists('expense_categories')
const hasLogs = await tableExists('expense_change_logs')

console.log(`branch_fixed_costs: ${hasFixed ? 'OK' : 'MISSING'}`)
console.log(`expense_categories: ${hasCats ? 'OK' : 'MISSING'}`)
console.log(`expense_change_logs: ${hasLogs ? 'OK' : 'MISSING'}`)

if (!hasFixed || !hasCats || !hasLogs) {
  console.error('\n⚠ Chưa có đủ bảng. Hãy chạy SQL trên Supabase SQL Editor:')
  console.error('  supabase/RUN_FIXED_COSTS_SETUP.sql\n')
  process.exit(2)
}

const rentRows = DEFAULT_RENT.map((row) => ({
  ...row,
  expense_type: 'mat-bang',
  expense_type_label: 'Mặt bằng',
  updated_by: 'system',
  updated_at: new Date().toISOString(),
}))

const { error: rentErr } = await sb.from('branch_fixed_costs').upsert(rentRows, { onConflict: 'id' })
if (rentErr) {
  console.error('Seed fixed costs failed:', rentErr.message)
  process.exit(1)
}
console.log(`✓ Seeded ${rentRows.length} fixed rent rows`)

const { error: catErr } = await sb.from('expense_categories').upsert(DEFAULT_CATEGORIES, { onConflict: 'id' })
if (catErr) {
  console.error('Seed categories failed:', catErr.message)
  process.exit(1)
}
console.log(`✓ Seeded ${DEFAULT_CATEGORIES.length} expense categories`)

const { data: fixed } = await sb.from('branch_fixed_costs').select('branch_id,amount').order('branch_id')
console.log('\nFixed rent:')
for (const row of fixed ?? []) {
  console.log(`  ${row.branch_id}: ${Number(row.amount).toLocaleString('vi-VN')}đ`)
}

console.log('\nDone.\n')
