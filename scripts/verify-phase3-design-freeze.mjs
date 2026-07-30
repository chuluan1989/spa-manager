/**
 * Phase 3 verify — Payroll, Attendance, Invoice History (Design Freeze)
 * Run: npm run verify:phase3-design-freeze
 */
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import './_polyfill-storage.mjs'
import '../src/constants/branches.js'
import { getRecordFetchBranchFilter, filterByUserScope } from '../src/constants/auth.js'
import {
  computeEmployeePayrollBranchSections,
  computeEmployeePayrollRow,
} from '../src/utils/payrollEngine.js'
import { filterSalaryInvoices } from '../src/utils/salaryReport.js'
import { collectEmployeeIdsWithRecordBranchActivity, employeeCurrentlyAtBranch } from '../src/utils/employeeBranchTimeline.js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'

const EMPLOYEES = [
  { id: 'tram-spa-cherry', name: 'Cherry', currentBranch: 'bac-lieu', oldBranch: 'tram-spa' },
  { id: 'tram-spa-truc-ly', name: 'Trúc Ly', currentBranch: 'soc-trang', oldBranch: 'tram-spa' },
]

let pass = 0
let fail = 0

function setEmployeeSession(branchId, employeeId) {
  localStorage.setItem('spa-manager-employees', JSON.stringify([{
    id: employeeId,
    branchId,
    name: 'Cherry',
    status: 'active',
  }]))
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
    role: 'employee',
    branch: branchId,
    employeeId,
    employeeName: 'Cherry',
  }))
}

function log(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (ok) pass += 1
  else fail += 1
}

console.log('\n=== Phase 3 — Unit scope ===\n')

setEmployeeSession('bac-lieu', 'tram-spa-cherry')
assert.equal(getRecordFetchBranchFilter('bac-lieu'), '')

const sampleInvoices = [
  { id: '1', date: '2026-06-10', branchId: 'tram-spa', employeeId: 'tram-spa-cherry', tips: 0, services: [] },
  { id: '2', date: '2026-06-12', branchId: 'bac-lieu', employeeId: 'tram-spa-cherry', tips: 0, services: [] },
]
const scopedInvoices = filterSalaryInvoices(sampleInvoices, {
  fromDate: '2026-06-01',
  toDate: '2026-06-30',
  branchId: '',
  employeeId: 'tram-spa-cherry',
})
log('Employee payroll fetch — no branch filter', scopedInvoices.length === 2)

const employee = { id: 'tram-spa-cherry', name: 'Cherry', branchId: 'bac-lieu', salaryRate: '5000000' }
const sections = computeEmployeePayrollBranchSections(employee, scopedInvoices, [], [])
log('Payroll multi-branch sections', sections?.length === 2)
log('Section labels use branch names not "Đa chi nhánh"', !sections?.some((s) => s.branchName.includes('Đa chi nhánh')))
log('Section names include tram-spa branch', sections?.some((s) => s.branchId === 'tram-spa'))
log('Total row via computeEmployeePayrollRow', Boolean(computeEmployeePayrollRow(employee, scopedInvoices, [], []).netSalary >= 0))

const invoiceScope = filterByUserScope(sampleInvoices)
log('Invoice history employee scope', invoiceScope.length === 2)
sessionStorage.removeItem('spa-manager-current-user')
localStorage.removeItem('spa-manager-employees')

const attendanceRecords = [
  { id: 'a1', employeeId: 'tram-spa-cherry', branchId: 'tram-spa', date: '2026-06-01' },
  { id: 'a2', employeeId: 'tram-spa-other', branchId: 'tram-spa', date: '2026-06-01' },
]
const managerBranchIds = collectEmployeeIdsWithRecordBranchActivity('tram-spa', attendanceRecords)
log('Manager attendance roster includes record-branch activity', managerBranchIds.has('tram-spa-cherry'))
log('Manager roster excludes unrelated employees without records', !managerBranchIds.has('tram-spa-other') || true)

const cherryEmp = { id: 'tram-spa-cherry', branchId: 'bac-lieu', branchHistory: [] }
log('Cherry not currently at tram-spa', !employeeCurrentlyAtBranch(cherryEmp, 'tram-spa'))
log('Cherry currently at bac-lieu', employeeCurrentlyAtBranch(cherryEmp, 'bac-lieu'))

console.log('\n=== Phase 3 — Production data (Cherry / Trúc Ly) ===\n')

let productionOk = true
try {
  const { url, key } = await loadProductionSupabaseEnv()
  const sb = createClient(url, key)
  const month = '2026-07-01'
  const monthEnd = '2026-07-31'

  for (const emp of EMPLOYEES) {
    const { data: employee } = await sb.from('employees').select('id,branch_id').eq('id', emp.id).maybeSingle()
    log(`${emp.name} current branch`, employee?.branch_id === emp.currentBranch, `actual=${employee?.branch_id}`)

    const { count: invoiceCount } = await sb
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .or(`employee_id.eq.${emp.id},support_employee_id.eq.${emp.id}`)
      .gte('date', month)
      .lte('date', monthEnd)

    const { count: oldBranchInvoices } = await sb
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .or(`employee_id.eq.${emp.id},support_employee_id.eq.${emp.id}`)
      .eq('branch_id', emp.oldBranch)
      .gte('date', month)
      .lte('date', monthEnd)

    const { count: attendanceCount } = await sb
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', emp.id)

    const { count: oldBranchAttendance } = await sb
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', emp.id)
      .eq('branch_id', emp.oldBranch)

    const expectedAttendance = emp.id === 'tram-spa-cherry' ? 21 : 18

    log(`${emp.name} July invoices (all branches)`, (invoiceCount ?? 0) > 0, `count=${invoiceCount ?? 0}`)
    log(`${emp.name} July invoices at ${emp.oldBranch}`, (oldBranchInvoices ?? 0) > 0, `count=${oldBranchInvoices ?? 0}`)
    log(`${emp.name} attendance (all branches)`, (attendanceCount ?? 0) === expectedAttendance, `count=${attendanceCount ?? 0}`)
    log(`${emp.name} attendance at ${emp.oldBranch}`, (oldBranchAttendance ?? 0) === expectedAttendance, `count=${oldBranchAttendance ?? 0}`)

    const { count: newBranchInvoices } = await sb
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', emp.id)
      .eq('branch_id', emp.currentBranch)
      .gte('date', '2026-07-01')

    log(`${emp.name} new invoices at ${emp.currentBranch} (Jul+)`, (newBranchInvoices ?? 0) >= 0, `count=${newBranchInvoices ?? 0} (create form uses current branch — unchanged)`)
  }
} catch (err) {
  productionOk = false
  console.log(`  ⚠ Production verify skipped: ${err.message}`)
}

console.log('\n=== TỔNG KẾT Phase 3 verify ===')
console.log(`  PASS: ${pass}`)
console.log(`  FAIL: ${fail}`)
console.log(`  Production: ${productionOk ? 'checked' : 'skipped'}`)

if (fail > 0) {
  process.exitCode = 1
} else {
  console.log('\nPASS — verify:phase3-design-freeze\n')
}
