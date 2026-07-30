/**
 * Audit read-only — branch_history + record.branch_id vs timeline (Design Freeze §7)
 *
 * Usage: node scripts/audit-employee-branch-timeline.mjs
 *
 * Không sửa DB. Xuất báo cáo mismatch / history thiếu hoặc không hợp lệ.
 */
import { createClient } from '@supabase/supabase-js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'
import { rowToCamel } from '../src/repositories/caseUtils.js'
import {
  validateBranchHistory,
  compareRecordBranchToTimeline,
  getEmployeeBranchAtDate,
} from '../src/utils/employeeBranchTimeline.js'
import { normalizeEmployee } from '../src/utils/employeeStorage.js'

const MAX_MISMATCH_SAMPLES = 5

const { url, key } = await loadProductionSupabaseEnv()
const sb = createClient(url, key)

console.log('\n=== AUDIT branch timeline (READ-ONLY) ===\n')

const { data: employeeRows, error: empErr } = await sb
  .from('employees')
  .select('id,name,branch_id,branch_history,status')

if (empErr) {
  console.error('Lỗi tải employees:', empErr.message)
  process.exit(1)
}

const employees = (employeeRows ?? []).map((row) => normalizeEmployee(rowToCamel(row)))
const activeEmployees = employees.filter((e) => e.status !== 'resigned' && e.status !== 'archived')

const report = {
  totalEmployees: employees.length,
  activeEmployees: activeEmployees.length,
  missingHistory: [],
  invalidHistory: [],
  invoiceMismatches: [],
  attendanceMismatches: [],
  payrollMismatches: [],
  cherryTrucLy: {},
}

for (const employee of employees) {
  const validation = validateBranchHistory(employee)

  if (!validation.ok) {
    report.invalidHistory.push({
      id: employee.id,
      name: employee.name,
      issues: validation.issues,
    })
  }

  const invoiceIssues = await auditRecords(sb, 'invoices', employee, 'date', 'date')
  const attendanceIssues = await auditRecords(sb, 'attendance', employee, 'date', 'attendance_date')
  const payrollIssues = await auditRecords(sb, 'payroll_adjustments', employee, 'date', 'date')

  if (invoiceIssues.length) {
    report.invoiceMismatches.push({ id: employee.id, name: employee.name, samples: invoiceIssues })
  }
  if (attendanceIssues.length) {
    report.attendanceMismatches.push({ id: employee.id, name: employee.name, samples: attendanceIssues })
  }
  if (payrollIssues.length) {
    report.payrollMismatches.push({ id: employee.id, name: employee.name, samples: payrollIssues })
  }

  if (validation.history.length === 0) {
    const dominant = await getDominantRecordBranch(sb, employee.id)
    if (dominant && employee.branchId && dominant !== employee.branchId) {
      report.missingHistory.push({
        id: employee.id,
        name: employee.name,
        currentBranch: employee.branchId,
        dominantRecordBranch: dominant,
        note: 'Có record.branch_id khác current branch nhưng không có branch_history',
      })
    }
  }
}

for (const id of ['tram-spa-cherry', 'tram-spa-truc-ly']) {
  const emp = employees.find((e) => e.id === id)
  if (!emp) continue
  const { count: invTram } = await sb.from('invoices').select('id', { count: 'exact', head: true })
    .eq('employee_id', id).eq('branch_id', 'tram-spa')
  const { count: invNew } = await sb.from('invoices').select('id', { count: 'exact', head: true })
    .eq('employee_id', id).eq('branch_id', emp.branchId)
  report.cherryTrucLy[id] = {
    currentBranch: emp.branchId,
    historyEntries: (emp.branchHistory ?? []).length,
    branchAt20260701: getEmployeeBranchAtDate(emp, '2026-07-01'),
    branchAtToday: getEmployeeBranchAtDate(emp, new Date().toISOString().slice(0, 10)),
    invoicesTramSpa: invTram ?? 0,
    invoicesCurrentBranch: invNew ?? 0,
  }
}

function printSection(title, items, formatter) {
  console.log(`\n--- ${title} (${items.length}) ---`)
  if (items.length === 0) {
    console.log('  (none)')
    return
  }
  for (const item of items.slice(0, 20)) {
    console.log(formatter(item))
  }
  if (items.length > 20) console.log(`  ... +${items.length - 20} more`)
}

printSection('branch_history không hợp lệ', report.invalidHistory, (item) =>
  `  • ${item.id} (${item.name}): ${item.issues[0]}`)

printSection('Thiếu branch_history (record CN ≠ current CN)', report.missingHistory, (item) =>
  `  • ${item.id}: current=${item.currentBranch}, records=${item.dominantRecordBranch}`)

printSection('invoice.branch_id ≠ timeline', report.invoiceMismatches, (item) =>
  `  • ${item.id}: ${item.samples.map((s) => `${s.recordDate} got=${s.recordBranch} expected=${s.expectedBranch}`).join('; ')}`)

printSection('attendance.branch_id ≠ timeline', report.attendanceMismatches, (item) =>
  `  • ${item.id}: ${item.samples.map((s) => `${s.recordDate} got=${s.recordBranch} expected=${s.expectedBranch}`).join('; ')}`)

printSection('payroll_adjustments.branch_id ≠ timeline', report.payrollMismatches, (item) =>
  `  • ${item.id}: ${item.samples.map((s) => `${s.recordDate} got=${s.recordBranch} expected=${s.expectedBranch}`).join('; ')}`)

console.log('\n--- Cherry / Trúc Ly snapshot ---')
for (const [id, snap] of Object.entries(report.cherryTrucLy)) {
  console.log(`  ${id}:`)
  console.log(`    currentBranch=${snap.currentBranch}, history=${snap.historyEntries}`)
  console.log(`    at 2026-07-01 → ${snap.branchAt20260701}, today → ${snap.branchAtToday}`)
  console.log(`    invoices tram-spa=${snap.invoicesTramSpa}, invoices current CN=${snap.invoicesCurrentBranch}`)
}

const totalIssues = report.invalidHistory.length
  + report.missingHistory.length
  + report.invoiceMismatches.length
  + report.attendanceMismatches.length
  + report.payrollMismatches.length

console.log('\n=== TỔNG KẾT ===')
console.log(`Employees: ${report.totalEmployees} (active ${report.activeEmployees})`)
console.log(`Issue buckets: ${totalIssues}`)
console.log(totalIssues === 0 ? '\nPASS — không phát hiện mismatch\n' : '\nREVIEW — xem chi tiết trên\n')

process.exit(0)

async function auditRecords(sbClient, table, employee, dateField, dbDateField = dateField) {
  const { data } = await sbClient
    .from(table)
    .select(`id,branch_id,${dbDateField},employee_id`)
    .eq('employee_id', employee.id)
    .limit(500)

  const mismatches = []
  for (const row of data ?? []) {
    const record = {
      branchId: row.branch_id,
      date: row[dbDateField] ?? '',
    }
    const cmp = compareRecordBranchToTimeline(record, employee, 'date')
    if (!cmp.skipped && !cmp.ok) {
      mismatches.push(cmp)
      if (mismatches.length >= MAX_MISMATCH_SAMPLES) break
    }
  }
  return mismatches
}

async function getDominantRecordBranch(sbClient, employeeId) {
  const { data } = await sbClient
    .from('invoices')
    .select('branch_id')
    .eq('employee_id', employeeId)
    .limit(200)
  const counts = {}
  for (const row of data ?? []) {
    counts[row.branch_id] = (counts[row.branch_id] ?? 0) + 1
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] ?? ''
}
