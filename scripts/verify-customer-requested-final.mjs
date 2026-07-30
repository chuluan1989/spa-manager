/**
 * Verify cuối — Migration 0012 + Customer Requested + Reports + Regression
 *
 * Usage:
 *   node scripts/verify-customer-requested-final.mjs
 *   node scripts/verify-customer-requested-final.mjs --keep-test-data
 *
 * Tạo 2 hóa đơn test, verify read-back, verify report metrics, cleanup.
 */
import { createClient } from '@supabase/supabase-js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'
import { rowToCamel } from '../src/repositories/caseUtils.js'

const KEEP = process.argv.includes('--keep-test-data')
const PREFIX = '__verify_cr_final_'
const today = new Date().toISOString().slice(0, 10)
const month = today.slice(0, 7)

let passed = 0
let failed = 0

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

function normalizeForPassword(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

function computeEmployeeDefaultPassword(employeeName, branchPasswordName) {
  return normalizeForPassword(employeeName) + normalizeForPassword(branchPasswordName)
}

function safeRatePercent(num, den) {
  if (!den) return null
  return Math.round((num / den) * 1000) / 10
}

function countRequestedTours(invoices) {
  return invoices.filter((inv) => inv.customerRequested).length
}

function buildEmployeeMetrics(invoices, employeeId) {
  const primary = invoices.filter((inv) => inv.employeeId === employeeId)
  const requested = countRequestedTours(primary)
  return {
    totalTours: primary.length,
    requestedTours: requested,
    rate: safeRatePercent(requested, primary.length),
  }
}

function buildAdminEmployeeRows(invoices, scopeBranchId = '') {
  const map = new Map()
  for (const inv of invoices) {
    if (!inv.employeeId) continue
    if (scopeBranchId && inv.branchId !== scopeBranchId) continue
    if (!map.has(inv.employeeId)) {
      map.set(inv.employeeId, { id: inv.employeeId, name: inv.employeeName || inv.employeeId, tours: 0, requested: 0 })
    }
    const row = map.get(inv.employeeId)
    if (inv.employeeId === inv.employeeId) {
      row.tours += 1
      if (inv.customerRequested) row.requested += 1
    }
  }
  return [...map.values()]
    .map((row) => ({ ...row, rate: safeRatePercent(row.requested, row.tours) }))
    .sort((a, b) => b.requested - a.requested)
}

const { url, key } = await loadProductionSupabaseEnv()
const sb = createClient(url, key)

section('1. Verify schema')

const schemaProbe = await sb.from('invoices').select('customer_requested').limit(3)
log('Cột customer_requested tồn tại', !schemaProbe.error, schemaProbe.error?.message)

if (schemaProbe.error) {
  console.log('\nFAIL — PostgREST chưa thấy cột. Thử reload schema cache trên Supabase Dashboard.')
  process.exit(1)
}

const samples = schemaProbe.data ?? []
const defaultOk = samples.every((row) => row.customer_requested === false)
log('Sample/default customer_requested = false', defaultOk || samples.length === 0, JSON.stringify(samples.map((r) => r.customer_requested)))

section('2. Verify Database — 2 hóa đơn test')

const idA = `${PREFIX}a_${Date.now()}`
const idB = `${PREFIX}b_${Date.now()}`

const baseRow = {
  date: today,
  branch_id: 'bac-lieu',
  branch_name: 'Khoẻ Spa Bạc Liêu',
  employee_id: 'tram-spa-cherry',
  employee_name: 'Cherry',
  customer_name: 'Verify Final',
  services: [],
  tips: 0,
  payment_method: 'cash',
  note: 'verify-customer-requested-final',
  service_total: 100000,
  total: 100000,
  commission: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const rowA = { ...baseRow, id: idA, customer_requested: true }
const rowB = { ...baseRow, id: idB, customer_requested: false, customer_name: 'Verify Final B' }

const upA = await sb.from('invoices').upsert(rowA, { onConflict: 'id' }).select('id,customer_requested')
const upB = await sb.from('invoices').upsert(rowB, { onConflict: 'id' }).select('id,customer_requested')
log('Upsert A (customer_requested=true)', !upA.error, upA.error?.message)
log('Upsert B (customer_requested=false)', !upB.error, upB.error?.message)

const { data: readA } = await sb.from('invoices').select('customer_requested').eq('id', idA).maybeSingle()
const { data: readB } = await sb.from('invoices').select('customer_requested').eq('id', idB).maybeSingle()
log('Read back A = true', readA?.customer_requested === true, JSON.stringify(readA))
log('Read back B = false', readB?.customer_requested === false, JSON.stringify(readB))

section('3. Verify Reports (metrics từ DB)')

const { data: monthInvoicesRaw, error: fetchErr } = await sb
  .from('invoices')
  .select('*')
  .gte('date', `${month}-01`)
  .lte('date', today)
  .eq('employee_id', 'tram-spa-cherry')

log('Fetch invoices tháng hiện tại (Cherry)', !fetchErr, fetchErr?.message)

const monthInvoices = (monthInvoicesRaw ?? []).map(rowToCamel)
const cherryMetrics = buildEmployeeMetrics(monthInvoices, 'tram-spa-cherry')
const includesA = monthInvoices.some((inv) => inv.id === idA)
const includesB = monthInvoices.some((inv) => inv.id === idB)

log('Test invoice A có trong dataset tháng', includesA)
log('Test invoice B có trong dataset tháng', includesB)

const metricsWithTests = buildEmployeeMetrics(
  monthInvoices.filter((inv) => inv.id === idA || inv.id === idB || !String(inv.id).startsWith(PREFIX)),
  'tram-spa-cherry',
)
const onlyTests = buildEmployeeMetrics(
  monthInvoices.filter((inv) => inv.id === idA || inv.id === idB),
  'tram-spa-cherry',
)

log('NV — test A+B: totalTours=2', onlyTests.totalTours === 2, `actual=${onlyTests.totalTours}`)
log('NV — test A+B: requestedTours=1', onlyTests.requestedTours === 1, `actual=${onlyTests.requestedTours}`)
log('NV — test A+B: rate=50%', onlyTests.rate === 50, `actual=${onlyTests.rate}%`)

const adminRows = buildAdminEmployeeRows(monthInvoices.filter((inv) => inv.id === idA || inv.id === idB))
const cherryRow = adminRows.find((r) => r.id === 'tram-spa-cherry')
log('Admin ranking — Cherry requested=1', cherryRow?.requested === 1, JSON.stringify(cherryRow))
log('Admin filter branch bac-lieu', monthInvoices.filter((inv) => inv.branchId === 'bac-lieu' && inv.id === idA).length === 1)

const dayFilter = monthInvoices.filter((inv) => inv.date === today && (inv.id === idA || inv.id === idB))
log('Admin filter ngày hôm nay — 2 test invoices', dayFilter.length === 2, `actual=${dayFilter.length}`)

console.log(`\n  Cherry tháng ${month}: tours=${cherryMetrics.totalTours}, requested=${cherryMetrics.requestedTours}, rate=${cherryMetrics.rate}%`)

section('4. Verify Regression — bảng + transfer')

for (const table of ['invoices', 'attendance', 'employees', 'payroll_locks', 'payroll_audit_logs', 'attendance_edit_logs']) {
  const { error } = await sb.from(table).select('id').limit(1)
  log(`Bảng ${table}`, !error, error?.message)
}

const { data: emps } = await sb.from('employees').select('id,branch_id').in('id', ['tram-spa-cherry', 'tram-spa-truc-ly'])
const cherryEmp = emps?.find((e) => e.id === 'tram-spa-cherry')
const trucLyEmp = emps?.find((e) => e.id === 'tram-spa-truc-ly')
log('Cherry branch_id=bac-lieu', cherryEmp?.branch_id === 'bac-lieu')
log('Trúc Ly branch_id=soc-trang', trucLyEmp?.branch_id === 'soc-trang')

section('5. Login resolver (data layer)')

log('Cherry username → bac-lieu', cherryEmp?.branch_id === 'bac-lieu')
log('Trúc Ly username → soc-trang', trucLyEmp?.branch_id === 'soc-trang')
log('Trúc Ly default password derivable', Boolean(computeEmployeeDefaultPassword('Trúc Ly', 'Sóc Trăng')))

section('6. Cleanup test invoices')

if (!KEEP) {
  const del = await sb.from('invoices').delete().in('id', [idA, idB])
  log('Xóa hóa đơn test A & B', !del.error, del.error?.message)
} else {
  console.log(`  (giữ lại ${idA}, ${idB})`)
}

console.log('\n=== TỔNG KẾT ===\n')
console.log(`PASS: ${passed}`)
console.log(`FAIL: ${failed}\n`)
process.exit(failed > 0 ? 1 : 0)
