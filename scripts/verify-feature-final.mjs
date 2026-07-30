/**
 * Vòng verify cuối — feature/employee-transfer-login-customer-requested
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-feature-final.mjs
 *   node --env-file=.env.local scripts/verify-feature-final.mjs --write-test-invoice
 *
 * Cần VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (Production).
 * Migration 0012 phải đã chạy trước khi phần Customer Requested PASS.
 */
import { createClient } from '@supabase/supabase-js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'
import { isPlaceholderSupabaseKey } from './lib/loadProductionSupabaseEnv.mjs'

const WRITE_TEST = process.argv.includes('--write-test-invoice')

async function resolveSupabaseClient() {
  const localUrl = process.env.VITE_SUPABASE_URL
  const localKey = process.env.VITE_SUPABASE_ANON_KEY
  if (localUrl && localKey && !isPlaceholderSupabaseKey(localKey)) {
    return createClient(localUrl, localKey)
  }
  const { url, key } = await loadProductionSupabaseEnv()
  return createClient(url, key)
}

let passed = 0
let failed = 0
const blockers = []

function log(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}`)
    if (detail) console.error(`    ${detail}`)
  }
}

function section(title) {
  console.log(`\n=== ${title} ===\n`)
}

function shiftMonthValue(monthValue, deltaMonths) {
  const [yStr, mStr] = monthValue.split('-')
  const dt = new Date(Number(yStr), Number(mStr) - 1 + deltaMonths, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function isPayCycleClosedForRecordDate(recordDate, todayDate) {
  const day = Number(recordDate.slice(8, 10))
  const month = recordDate.slice(0, 7)
  const cycle = day <= 15 ? 'period1' : 'period2'
  const lockStart = cycle === 'period1' ? `${month}-16` : `${shiftMonthValue(month, 1)}-01`
  return todayDate >= lockStart
}

section('A. Migration 0012 — customer_requested')

const sb = await resolveSupabaseClient()

const colProbe = await sb.from('invoices').select('customer_requested').limit(1)
const migrationOk = !colProbe.error
log('Cột invoices.customer_requested tồn tại', migrationOk, colProbe.error?.message)
if (!migrationOk) {
  blockers.push('Chạy supabase/migrations/0012_invoice_customer_requested.sql trên Supabase SQL Editor')
}

if (migrationOk) {
  const { data: sample } = await sb.from('invoices').select('customer_requested').limit(5)
  const allDefaultFalse = (sample ?? []).every((row) => row.customer_requested === false)
  log('Default/sample customer_requested = false', allDefaultFalse || (sample ?? []).length === 0)
}

section('B. Cherry & Trúc Ly — branch transfer')

const { data: employees } = await sb
  .from('employees')
  .select('id,name,branch_id')
  .in('id', ['tram-spa-cherry', 'tram-spa-truc-ly'])

const cherry = employees?.find((e) => e.id === 'tram-spa-cherry')
const trucLy = employees?.find((e) => e.id === 'tram-spa-truc-ly')
log('Cherry branch_id = bac-lieu', cherry?.branch_id === 'bac-lieu', `actual=${cherry?.branch_id}`)
log('Trúc Ly branch_id = soc-trang', trucLy?.branch_id === 'soc-trang', `actual=${trucLy?.branch_id}`)

const { data: credRow } = await sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle()
const cred = credRow?.payload?.employees ?? {}
log('Credential Cherry branchId = bac-lieu', cred['tram-spa-cherry']?.branchId === 'bac-lieu')
log('Credential Trúc Ly branchId = soc-trang', cred['tram-spa-truc-ly']?.branchId === 'soc-trang')

section('C. Username trùng — login an toàn')

const [{ data: branches }, { data: allEmployees }] = await Promise.all([
  sb.from('branches').select('id,name'),
  sb.from('employees').select('id,name,branch_id,status'),
])
const buckets = new Map()
const add = (username, entry) => {
  const k = String(username ?? '').trim()
  if (!k) return
  if (!buckets.has(k)) buckets.set(k, [])
  buckets.get(k).push(entry)
}
add('admin', { type: 'admin' })
for (const b of branches ?? []) add(b.id, { type: 'branch_manager' })
for (const e of allEmployees ?? []) {
  if (e.status === 'resigned') continue
  add(e.id, { type: 'employee' })
}
const dupes = [...buckets.entries()].filter(([, v]) => v.length > 1)
log('Không có username trùng', dupes.length === 0, dupes.map(([u]) => u).join(', '))

section('D. Khóa kỳ lương — quy tắc lịch')

log('Kỳ 1 (10/07) khóa từ 16/07', isPayCycleClosedForRecordDate('2026-07-10', '2026-07-16'))
log('Kỳ 1 (10/07) mở ngày 15/07', !isPayCycleClosedForRecordDate('2026-07-10', '2026-07-15'))
log('Kỳ 2 (20/07) khóa từ 01/08', isPayCycleClosedForRecordDate('2026-07-20', '2026-08-01'))
log('Kỳ 2 (20/07) mở ngày 31/07', !isPayCycleClosedForRecordDate('2026-07-20', '2026-07-31'))

section('E. Customer Requested — DB upsert (nếu migration OK)')

let testInvoiceId = null
if (migrationOk && WRITE_TEST) {
  testInvoiceId = `__verify_cr_${Date.now()}`
  const today = new Date().toISOString().slice(0, 10)
  const row = {
    id: testInvoiceId,
    date: today,
    branch_id: cherry?.branch_id || 'bac-lieu',
    branch_name: 'Verify',
    employee_id: 'tram-spa-cherry',
    employee_name: 'Cherry',
    customer_name: 'Verify CR',
    customer_requested: true,
    services: [],
    tips: 0,
    payment_method: 'cash',
    note: 'verify-feature-final',
    service_total: 0,
    total: 0,
    commission: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { error: upErr } = await sb.from('invoices').upsert(row, { onConflict: 'id' })
  log('Upsert invoice customer_requested=true', !upErr, upErr?.message)

  if (!upErr) {
    const { data: readBack } = await sb
      .from('invoices')
      .select('customer_requested')
      .eq('id', testInvoiceId)
      .maybeSingle()
    log('Read back customer_requested=true', readBack?.customer_requested === true, JSON.stringify(readBack))

    await sb.from('invoices').delete().eq('id', testInvoiceId)
    testInvoiceId = null
    log('Cleanup test invoice', true)
  }
} else if (migrationOk) {
  const { count } = await sb
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('customer_requested', true)
  log(`Hóa đơn customer_requested=true hiện có: ${count ?? 0}`, true)
  console.log('    (Thêm --write-test-invoice để probe upsert/read)')
} else {
  log('Customer Requested upsert probe', false, 'Migration 0012 chưa chạy')
}

section('F. Regression — bảng cốt lõi')

for (const table of ['invoices', 'attendance', 'employees', 'payroll_locks', 'payroll_audit_logs', 'attendance_edit_logs']) {
  const { error } = await sb.from(table).select('id').limit(1)
  log(`Bảng ${table} readable`, !error, error?.message)
}

console.log('\n=== TỔNG KẾT ===\n')
console.log(`PASS: ${passed}`)
console.log(`FAIL: ${failed}`)
if (blockers.length) {
  console.log('\nBLOCKERS:')
  for (const b of blockers) console.log(`  • ${b}`)
}
console.log('')
process.exit(failed > 0 ? 1 : 0)
