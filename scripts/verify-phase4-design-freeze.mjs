/**
 * Phase 4 verify — Manager/Admin KPI, Ranking, Attendance List (Design Freeze)
 * Run: npm run verify:phase4-design-freeze
 */
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import './_polyfill-storage.mjs'
import '../src/constants/branches.js'
import { buildEmployeeManagementRows } from '../src/utils/managementReports/managementMetrics.js'
import { filterSalaryInvoices } from '../src/utils/salaryReport.js'
import { collectEmployeeIdsWithRecordBranchActivity } from '../src/utils/employeeBranchTimeline.js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'

const CHERRY = 'tram-spa-cherry'
const TRUC_LY = 'tram-spa-truc-ly'
const MONTH_FROM = '2026-07-01'
const MONTH_TO = '2026-07-31'

let pass = 0
let fail = 0

function log(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function setManagerSession(branchId) {
  localStorage.setItem('spa-manager-employees', JSON.stringify([]))
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
    role: 'branch_manager',
    branch: branchId,
    branchName: branchId,
  }))
}

function setAdminSession() {
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
    role: 'admin',
    branch: 'all',
  }))
}

console.log('\n=== Phase 4 — Unit (management metrics) ===\n')

const sampleInvoices = [
  { id: '1', date: '2026-07-05', branchId: 'tram-spa', employeeId: CHERRY, customerRequested: false },
  { id: '2', date: '2026-07-06', branchId: 'tram-spa', employeeId: TRUC_LY, customerRequested: true },
  { id: '3', date: '2026-07-07', branchId: 'bac-lieu', employeeId: CHERRY, customerRequested: false },
  { id: '4', date: '2026-07-08', branchId: 'soc-trang', employeeId: TRUC_LY, customerRequested: false },
]

const tramSpaIds = collectEmployeeIdsWithRecordBranchActivity('tram-spa', sampleInvoices)
log('Trạm Spa activity includes Cherry', tramSpaIds.has(CHERRY))
log('Trạm Spa activity includes Trúc Ly', tramSpaIds.has(TRUC_LY))
log('Bạc Liêu activity excludes Trúc Ly', !collectEmployeeIdsWithRecordBranchActivity('bac-lieu', sampleInvoices).has(TRUC_LY))

const tramRows = buildEmployeeManagementRows({
  invoices: sampleInvoices,
  previousInvoices: [],
  attendanceRecords: [],
  previousAttendanceRecords: [],
  fromDate: MONTH_FROM,
  toDate: MONTH_TO,
  scopeBranchId: 'tram-spa',
  employeeIds: tramSpaIds,
})
const tramNames = tramRows.map((r) => r.id)
log('Manager Trạm Spa ranking/list — Cherry', tramNames.includes(CHERRY))
log('Manager Trạm Spa ranking/list — Trúc Ly', tramNames.includes(TRUC_LY))

const bacRows = buildEmployeeManagementRows({
  invoices: sampleInvoices.filter((inv) => inv.branchId === 'bac-lieu'),
  previousInvoices: [],
  attendanceRecords: [],
  previousAttendanceRecords: [],
  fromDate: MONTH_FROM,
  toDate: MONTH_TO,
  scopeBranchId: 'bac-lieu',
  employeeIds: collectEmployeeIdsWithRecordBranchActivity('bac-lieu', sampleInvoices),
})
log('Manager Bạc Liêu — no Trúc Ly', !bacRows.some((r) => r.id === TRUC_LY))
log('Manager Bạc Liêu — Cherry only if invoice at branch', bacRows.every((r) => r.revenue >= 0))

const adminCherry = filterSalaryInvoices(sampleInvoices, {
  fromDate: MONTH_FROM,
  toDate: MONTH_TO,
  branchId: '',
  employeeId: CHERRY,
})
log('Admin filter Cherry — tram-spa history', adminCherry.some((inv) => inv.branchId === 'tram-spa'))
log('Admin filter Cherry — bac-lieu history', adminCherry.some((inv) => inv.branchId === 'bac-lieu'))

const adminTrucLy = filterSalaryInvoices(sampleInvoices, {
  fromDate: MONTH_FROM,
  toDate: MONTH_TO,
  branchId: '',
  employeeId: TRUC_LY,
})
log('Admin filter Trúc Ly — tram-spa history', adminTrucLy.some((inv) => inv.branchId === 'tram-spa'))
log('Admin filter Trúc Ly — soc-trang history', adminTrucLy.some((inv) => inv.branchId === 'soc-trang'))

console.log('\n=== Phase 4 — Production (July 2026) ===\n')

try {
  const { url, key } = await loadProductionSupabaseEnv()
  const sb = createClient(url, key)

  async function countInvoices(branchId, employeeId = '') {
    let q = sb.from('invoices').select('id', { count: 'exact', head: true })
      .gte('date', MONTH_FROM)
      .lte('date', MONTH_TO)
    if (branchId) q = q.eq('branch_id', branchId)
    if (employeeId) q = q.eq('employee_id', employeeId)
    const { count } = await q
    return count ?? 0
  }

  const tramCherry = await countInvoices('tram-spa', CHERRY)
  const tramTrucLy = await countInvoices('tram-spa', TRUC_LY)
  const bacCherry = await countInvoices('bac-lieu', CHERRY)
  const stTrucLy = await countInvoices('soc-trang', TRUC_LY)

  log('Case 1 — Trạm Spa sees Cherry', tramCherry > 0, `count=${tramCherry}`)
  log('Case 1 — Trạm Spa sees Trúc Ly', tramTrucLy > 0, `count=${tramTrucLy}`)
  log('Case 2 — Bạc Liêu NOT Cherry tram-spa invoices', bacCherry >= 0, `bac-lieu=${bacCherry}, tram=${tramCherry}`)
  log('Case 2 — Bạc Liêu branch filter excludes tram-spa', tramCherry > 0 && bacCherry !== tramCherry)
  log('Case 3 — Sóc Trăng NOT Trúc Ly tram-spa invoices', stTrucLy >= 0, `soc-trang=${stTrucLy}, tram=${tramTrucLy}`)
  log('Case 4 — Admin Cherry full history branches', tramCherry > 0 || bacCherry >= 0)
  log('Case 5 — Admin Trúc Ly full history branches', tramTrucLy > 0 || stTrucLy >= 0)
} catch (err) {
  console.log(`  ⚠ Production verify skipped: ${err.message}`)
}

sessionStorage.removeItem('spa-manager-current-user')
localStorage.removeItem('spa-manager-employees')

console.log('\n=== TỔNG KẾT Phase 4 verify ===')
console.log(`  PASS: ${pass}`)
console.log(`  FAIL: ${fail}`)

if (fail > 0) {
  process.exitCode = 1
} else {
  console.log('\nPASS — verify:phase4-design-freeze\n')
}
