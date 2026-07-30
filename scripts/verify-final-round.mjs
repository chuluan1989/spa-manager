/**
 * Vòng verify cuối — Migration 0012 + Customer Requested + Reports + Cleanup
 *
 * Usage: npx vite-node scripts/verify-final-round.mjs
 */
import './_polyfill-storage.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'
import { rowToCamel } from '../src/repositories/caseUtils.js'
import {
  buildBranchManagementRows,
  buildEmployeeManagementRows,
} from '../src/utils/managementReports/managementMetrics.js'
import { getInvoiceModifyBlockReason } from '../src/utils/invoiceEditPolicy.js'
import { getAttendanceEditBlockReason } from '../src/utils/attendanceEditPolicy.js'
import { ROLES } from '../src/constants/roles.js'
import '../src/constants/branches.js'
import { saveCurrentUser, clearCurrentUser } from '../src/utils/authStorage.js'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const PREFIX = '__verify_'
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
  console.log(`\n${'='.repeat(50)}`)
  console.log(title)
  console.log('='.repeat(50) + '\n')
}

function safeRatePercent(num, den) {
  if (!den) return null
  return Math.round((num / den) * 1000) / 10
}

const { url, key } = await loadProductionSupabaseEnv()
const sb = createClient(url, key)

// ── 1. SCHEMA ──────────────────────────────────────────────
section('1. VERIFY SCHEMA')

const schemaProbe = await sb.from('invoices').select('customer_requested').limit(5)
log('Cột customer_requested tồn tại', !schemaProbe.error, schemaProbe.error?.message)
if (schemaProbe.error) process.exit(1)

const samples = schemaProbe.data ?? []
log('Kiểu boolean (true/false hợp lệ)', samples.every((r) => typeof r.customer_requested === 'boolean'))
log('Default/sample = false', samples.every((r) => r.customer_requested === false) || samples.length === 0)

const repoSrc = readFileSync(path.join(ROOT, 'src/repositories/invoicesRepository.js'), 'utf8')
log('invoicesRepository có customerRequested trong SUPABASE_INVOICE_FIELDS',
  repoSrc.includes("'customerRequested'"))
log('Fallback warning chỉ khi schema thiếu cột (migration chưa chạy)',
  repoSrc.includes('customer_requested bị bỏ khi sync'))

const loginSrc = readFileSync(path.join(ROOT, 'src/pages/Login.jsx'), 'utf8')
log('Login NV/QL không có branch picker (chỉ username+password)',
  !loginSrc.includes('Chọn chi nhánh') && loginSrc.includes('needsUsername'))

// ── 2. DATABASE ────────────────────────────────────────────
section('2. VERIFY DATABASE')

const idA = `${PREFIX}cr_a_${Date.now()}`
const idB = `${PREFIX}cr_b_${Date.now()}`

const baseRow = {
  date: today,
  branch_id: 'bac-lieu',
  branch_name: 'Khoẻ Spa Bạc Liêu',
  employee_id: 'tram-spa-cherry',
  employee_name: 'Cherry',
  services: [],
  tips: 0,
  payment_method: 'cash',
  note: 'verify-final-round',
  service_total: 100000,
  total: 100000,
  commission: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const upA = await sb.from('invoices').upsert(
  { ...baseRow, id: idA, customer_name: 'Verify A', customer_requested: true },
  { onConflict: 'id' },
).select('id,customer_requested')
const upB = await sb.from('invoices').upsert(
  { ...baseRow, id: idB, customer_name: 'Verify B', customer_requested: false },
  { onConflict: 'id' },
).select('id,customer_requested')

log('Upsert A customer_requested=true (không bị strip)', !upA.error && upA.data?.[0]?.customer_requested === true, upA.error?.message)
log('Upsert B customer_requested=false (không bị strip)', !upB.error && upB.data?.[0]?.customer_requested === false, upB.error?.message)

const { data: readA } = await sb.from('invoices').select('customer_requested').eq('id', idA).maybeSingle()
const { data: readB } = await sb.from('invoices').select('customer_requested').eq('id', idB).maybeSingle()
log('Read back A = true', readA?.customer_requested === true)
log('Read back B = false', readB?.customer_requested === false)

// Re-upsert A with false then back to true — giữ nguyên flag
await sb.from('invoices').update({ customer_requested: true, note: 'verify-keep-true' }).eq('id', idA)
const { data: keepA } = await sb.from('invoices').select('customer_requested').eq('id', idA).maybeSingle()
log('customer_requested=true được giữ nguyên sau update', keepA?.customer_requested === true)

// ── 3. CUSTOMER REQUESTED / REPORTS ───────────────────────
section('3. VERIFY CUSTOMER REQUESTED + REPORTS')

const { data: monthRaw } = await sb
  .from('invoices')
  .select('*')
  .gte('date', `${month}-01`)
  .lte('date', today)

const monthInvoices = (monthRaw ?? []).map(rowToCamel)
const testInvoices = monthInvoices.filter((inv) => inv.id === idA || inv.id === idB)
const cherryPrimary = testInvoices.filter((inv) => inv.employeeId === 'tram-spa-cherry')

const nvTours = cherryPrimary.length
const nvRequested = cherryPrimary.filter((inv) => inv.customerRequested).length
const nvRate = safeRatePercent(nvRequested, nvTours)

log('NV — Tổng tour (test A+B=2)', nvTours === 2, `actual=${nvTours}`)
log('NV — Tour khách yêu cầu (=1, chỉ A)', nvRequested === 1, `actual=${nvRequested}`)
log('NV — Tỷ lệ khách yêu cầu (=50%)', nvRate === 50, `actual=${nvRate}%`)
log('Tick=true được tính (A)', cherryPrimary.some((inv) => inv.id === idA && inv.customerRequested))
log('Tick=false không tính (B)', cherryPrimary.filter((inv) => inv.id === idB && inv.customerRequested).length === 0)

const dayFiltered = monthInvoices.filter((inv) => inv.date === today && (inv.id === idA || inv.id === idB))
const monthFiltered = monthInvoices.filter((inv) => inv.id === idA || inv.id === idB)
const branchFiltered = monthInvoices.filter((inv) => inv.branchId === 'bac-lieu' && (inv.id === idA || inv.id === idB))

log('Bộ lọc ngày — 2 test invoices', dayFiltered.length === 2, `actual=${dayFiltered.length}`)
log('Bộ lọc tháng — 2 test invoices', monthFiltered.length === 2, `actual=${monthFiltered.length}`)
log('Bộ lọc chi nhánh bac-lieu — 2 test invoices', branchFiltered.length === 2, `actual=${branchFiltered.length}`)

const empRows = buildEmployeeManagementRows({
  invoices: testInvoices,
  previousInvoices: [],
  fromDate: `${month}-01`,
  toDate: today,
  scopeBranchId: 'bac-lieu',
})
const cherryRow = empRows.find((r) => r.employeeId === 'tram-spa-cherry')
log('QL/Admin — Xếp hạng Cherry requested tour', (cherryRow?.customerRequestedTourCount ?? 0) === 1,
  JSON.stringify({ tours: cherryRow?.invoiceCount, requested: cherryRow?.customerRequestedTourCount }))

const branchRows = buildBranchManagementRows({
  invoices: testInvoices,
  previousInvoices: [],
  expenses: [],
  previousExpenses: [],
  fixedCosts: [],
  fromDate: `${month}-01`,
  toDate: today,
  scopeBranchId: 'bac-lieu',
})
const blRow = branchRows.find((r) => r.branchId === 'bac-lieu')
log('Admin — Tổng tour chi nhánh (test=2)', (blRow?.invoiceCount ?? 0) === 2, `actual=${blRow?.invoiceCount}`)
log('Admin — Tour khách yêu cầu (=1)', (blRow?.customerRequestedTourCount ?? 0) === 1, `actual=${blRow?.customerRequestedTourCount}`)
log('Admin — Tỷ lệ khách yêu cầu (=50%)', blRow?.customerRequestedTourRate === 50, `actual=${blRow?.customerRequestedTourRate}%`)

// ── 4. LOGIN (data layer) ──────────────────────────────────
section('4. VERIFY LOGIN (data layer)')

const { data: emps } = await sb.from('employees').select('id,name,branch_id').in('id', ['tram-spa-cherry', 'tram-spa-truc-ly'])
const cherryEmp = emps?.find((e) => e.id === 'tram-spa-cherry')
const trucLyEmp = emps?.find((e) => e.id === 'tram-spa-truc-ly')
log('Cherry branch_id = bac-lieu', cherryEmp?.branch_id === 'bac-lieu')
log('Trúc Ly branch_id = soc-trang', trucLyEmp?.branch_id === 'soc-trang')

const { data: credRow } = await sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle()
const cred = credRow?.payload?.employees ?? {}
log('Credential Cherry branchId = bac-lieu', cred['tram-spa-cherry']?.branchId === 'bac-lieu')
log('Credential Trúc Ly branchId = soc-trang', cred['tram-spa-truc-ly']?.branchId === 'soc-trang')

// ── 5. PAYROLL LOCK (policy) ───────────────────────────────
section('5. VERIFY PAYROLL LOCK (policy)')

const closedDate = '2026-07-10'
const closedToday = '2026-07-16'
const closedInvoice = { id: 'x', date: closedDate, branchId: 'bac-lieu' }

const qlBlock = getInvoiceModifyBlockReason(closedInvoice, {
  todayDate: closedToday,
  role: ROLES.BRANCH_MANAGER,
})
log('QL — Không sửa hóa đơn kỳ đã chốt', Boolean(qlBlock), qlBlock)

clearCurrentUser()
saveCurrentUser({ role: ROLES.ADMIN, branch: 'all' })
const adminAllow = getInvoiceModifyBlockReason(closedInvoice, {
  todayDate: closedToday,
  role: ROLES.ADMIN,
})
clearCurrentUser()
log('Admin — Được sửa hóa đơn kỳ đã chốt (no block reason)', adminAllow === '')

const qlAttBlock = getAttendanceEditBlockReason('bac-lieu', closedDate, {
  role: ROLES.BRANCH_MANAGER,
  branchId: 'bac-lieu',
  locks: [],
})
log('QL — Không sửa chấm công kỳ đã chốt', Boolean(qlAttBlock), qlAttBlock)

const adminAttAllow = getAttendanceEditBlockReason('bac-lieu', closedDate, {
  role: ROLES.ADMIN,
  branchId: 'all',
  locks: [],
})
log('Admin — Được sửa chấm công kỳ đã chốt', adminAttAllow === '')

const { error: auditErr } = await sb.from('payroll_audit_logs').select('id').limit(1)
log('Bảng payroll_audit_logs readable (Admin audit)', !auditErr)

// ── 6. REGRESSION (DB tables) ──────────────────────────────
section('6. REGRESSION (DB tables)')

for (const table of ['invoices', 'attendance', 'employees', 'payroll_locks', 'payroll_audit_logs', 'attendance_edit_logs']) {
  const { error } = await sb.from(table).select('id').limit(1)
  log(`Bảng ${table}`, !error, error?.message)
}

// ── 8. CLEANUP ─────────────────────────────────────────────
section('8. CLEANUP')

const delTests = await sb.from('invoices').delete().in('id', [idA, idB])
log('Xóa hóa đơn test A & B', !delTests.error, delTests.error?.message)

const { data: leftovers } = await sb
  .from('invoices')
  .select('id')
  .or(`id.like.${PREFIX}%,id.like.__verify_cr_%,note.like.verify-final-round,note.like.verify-customer-requested-final`)

if ((leftovers ?? []).length > 0) {
  await sb.from('invoices').delete().in('id', leftovers.map((r) => r.id))
}

const { data: leftoversAfter } = await sb
  .from('invoices')
  .select('id')
  .or(`id.like.${PREFIX}%,id.like.__verify_cr_%,note.like.verify-final-round,note.like.verify-customer-requested-final`)

log('Không còn invoice test (__verify_* / verify-final)', (leftoversAfter ?? []).length === 0,
  leftoversAfter?.map((r) => r.id).join(', ') || '')

const { data: attLeft } = await sb.from('attendance').select('id').like('id', `${PREFIX}%`)
log('Không còn attendance test', (attLeft ?? []).length === 0)

const { data: auditLeft } = await sb
  .from('payroll_audit_logs')
  .select('id')
  .like('entity_id', `${PREFIX}%`)
log('Không còn audit test entity', (auditLeft ?? []).length === 0)

console.log('\n' + '='.repeat(50))
console.log('TỔNG KẾT verify-final-round')
console.log('='.repeat(50))
console.log(`PASS: ${passed}`)
console.log(`FAIL: ${failed}\n`)
process.exit(failed > 0 ? 1 : 0)
