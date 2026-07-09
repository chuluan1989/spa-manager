/**
 * Kiểm tra đọc hóa đơn từ Supabase production (chỉ đọc).
 * Chạy: node scripts/verify-invoices-from-production.mjs
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
  if (!url || !key) throw new Error('Không tìm thấy Supabase credentials trên Production')
  return { url, key }
}

console.log(`\nKiểm tra hóa đơn Supabase — ${BASE}\n`)

const { url, key } = await loadProductionSupabaseEnv()
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(url, key)

const { count, error: countErr } = await sb.from('invoices').select('*', { count: 'exact', head: true })
if (countErr) {
  console.error('✗ Đếm invoices:', countErr.message)
  process.exit(1)
}
console.log(`✓ Tổng hóa đơn trên Supabase: ${count}`)

const { data: latest, error: latestErr } = await sb
  .from('invoices')
  .select('id,date,branch_id,employee_id,customer_name,total,created_at')
  .order('created_at', { ascending: false })
  .order('date', { ascending: false })
  .limit(3)
if (latestErr) {
  console.error('✗ Query latest:', latestErr.message)
  process.exit(1)
}
console.log('✓ 3 hóa đơn mới nhất (created_at DESC):')
for (const row of latest ?? []) {
  console.log(`  - ${row.date} | ${row.branch_id} | ${row.customer_name || '(no name)'} | ${row.total}`)
}

const { data: july7, error: julyErr } = await sb
  .from('invoices')
  .select('id,date,branch_id,total')
  .eq('date', '2026-07-07')
if (julyErr) {
  console.error('✗ Query 2026-07-07:', julyErr.message)
  process.exit(1)
}
console.log(`✓ Hóa đơn ngày 2026-07-07: ${july7?.length ?? 0} dòng`)

console.log('\nOK — Supabase invoices readable.\n')
