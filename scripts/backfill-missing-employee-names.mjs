/**
 * Phase ổn định: backfill ĐÚNG 6 employee thiếu name (theo audit 2026-07-12).
 * Chỉ UPDATE field name. Không tạo / xóa / migrate gì khác.
 *
 * Điều kiện mỗi bản ghi:
 * - employee.id khớp
 * - employee.branch_id khớp
 * - đúng 1 credential trong app_credentials.employees
 * - name hiện tại đang trống
 *
 * Chạy: node scripts/backfill-missing-employee-names.mjs
 */
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'

/** Đúng 6 employee đã audit — name lấy từ credential. */
const TARGETS = [
  { id: 'bac-lieu-thao-cam', branch_id: 'bac-lieu', name: 'Thảo Cầm' },
  { id: 'soc-trang-bao-tran', branch_id: 'soc-trang', name: 'Bảo Trân' },
  { id: 'soc-trang-chi-7', branch_id: 'soc-trang', name: 'Chị 7' },
  { id: 'vinh-long-bo', branch_id: 'vinh-long', name: 'Bơ' },
  { id: 'vinh-long-dau', branch_id: 'vinh-long', name: 'Đậu' },
  { id: 'vinh-long-thao', branch_id: 'vinh-long', name: 'Thảo' },
]

async function loadProductionSupabase() {
  const html = await fetch(BASE).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  if (!jsMatch) throw new Error('Không tìm thấy bundle Production')
  const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if (!url || !key) throw new Error('Không lấy được Supabase credentials từ Production')
  return createClient(url, key)
}

function countCredentialsForEmployee(payload, employeeId) {
  const employees = payload?.employees ?? {}
  let count = 0
  if (employees[employeeId]) count += 1
  for (const [key, entry] of Object.entries(employees)) {
    if (key === employeeId) continue
    if (entry?.employeeId === employeeId || entry?.employee_id === employeeId) count += 1
  }
  return count
}

console.log('\n=== Backfill 6 employee missing name (safe) ===\n')

const sb = await loadProductionSupabase()
const { data: credRow, error: credErr } = await sb
  .from('app_credentials')
  .select('payload')
  .eq('id', 'singleton')
  .maybeSingle()

if (credErr) throw new Error(`Không đọc app_credentials: ${credErr.message}`)
const credPayload = credRow?.payload ?? {}

let updated = 0
let skipped = 0
let failed = 0

for (const target of TARGETS) {
  const { data: emp, error: empErr } = await sb
    .from('employees')
    .select('id,branch_id,name,phone,updated_at')
    .eq('id', target.id)
    .maybeSingle()

  if (empErr || !emp) {
    console.error(`  ✗ ${target.id} — không tìm thấy employee`)
    failed += 1
    continue
  }

  if (emp.branch_id !== target.branch_id) {
    console.error(`  ✗ ${target.id} — branch_id lệch (db=${emp.branch_id}, expect=${target.branch_id}) — SKIP`)
    skipped += 1
    continue
  }

  const credCount = countCredentialsForEmployee(credPayload, target.id)
  if (credCount !== 1) {
    console.error(`  ✗ ${target.id} — credential count=${credCount} (cần đúng 1) — SKIP`)
    skipped += 1
    continue
  }

  const currentName = String(emp.name ?? '').trim()
  if (currentName === target.name) {
    console.log(`  ○ ${target.id} — name đã đúng "${target.name}" — bỏ qua`)
    skipped += 1
    continue
  }
  if (currentName) {
    console.error(`  ✗ ${target.id} — name đã có "${currentName}" (không ghi đè) — SKIP`)
    skipped += 1
    continue
  }

  const { data: rows, error: updErr } = await sb
    .from('employees')
    .update({ name: target.name })
    .eq('id', target.id)
    .eq('branch_id', target.branch_id)
    .select('id,branch_id,name')

  if (updErr || !rows?.length) {
    console.error(`  ✗ ${target.id} — update thất bại: ${updErr?.message ?? '0 rows'}`)
    failed += 1
    continue
  }

  const after = rows[0]
  if (after.name !== target.name || after.branch_id !== target.branch_id) {
    console.error(`  ✗ ${target.id} — verify sau update lệch`)
    failed += 1
    continue
  }

  console.log(`  ✓ ${target.id} — name = "${target.name}" (branch=${after.branch_id})`)
  updated += 1
}

console.log(`\nKết quả: updated=${updated} skipped=${skipped} failed=${failed} (targets=${TARGETS.length})\n`)
if (failed > 0 || updated + skipped !== TARGETS.length) process.exit(1)
if (updated === 0 && skipped < TARGETS.length) process.exit(1)
