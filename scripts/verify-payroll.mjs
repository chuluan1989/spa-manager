/**
 * Kiểm tra Module Lương trên Supabase thật.
 *
 * Chạy: npx vite-node scripts/verify-payroll.mjs
 * Production: node scripts/verify-payroll-from-production.mjs
 */
import assert from 'node:assert/strict'

function createStorage() {
  const store = new Map()
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

globalThis.localStorage = createStorage()
globalThis.sessionStorage = createStorage()

const { isSupabaseConfigured, supabase } = await import('../src/lib/supabaseClient.js')
const { fetchEmployeesFiltered } = await import('../src/repositories/employeesRepository.js')
const { fetchAttendanceFiltered } = await import('../src/repositories/attendanceRepository.js')
const { fetchInvoicesFiltered } = await import('../src/repositories/invoicesRepository.js')
const {
  fetchPayrollAdjustments,
  fetchPayrollLocks,
  isMissingSchemaTableError,
} = await import('../src/repositories/payrollRepository.js')
const { normalizeEmployee } = await import('../src/utils/employeeStorage.js')
const { computePayrollReport, computeEmployeePayrollRow } = await import('../src/utils/payrollEngine.js')
const { getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { aggregateBranchSummaries } = await import('../src/utils/payrollViewHelpers.js')
const { loadBranches } = await import('../src/utils/branchStorage.js')
const { isPayrollListEmployee } = await import('../src/utils/branchEmployeeMatch.js')

let passed = 0
let failed = 0

function ok(name, detail = '') {
  passed += 1
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, error) {
  failed += 1
  console.error(`  ✗ ${name}`)
  console.error(`    ${error?.message ?? String(error)}`)
}

async function checkTableReadable(table) {
  const { error } = await supabase.from(table).select('id').limit(1)
  if (error) throw error
}

console.log('\nSpa Manager — kiểm tra Module Lương (Supabase)\n')

if (!isSupabaseConfigured) {
  console.error('✗ Supabase chưa cấu hình — cần VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY\n')
  process.exit(1)
}

const month = new Date().toISOString().slice(0, 7)
const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)

console.log(`Tháng kiểm tra: ${month} (${fromDate} → ${toDate})\n`)

console.log('1. Bảng payroll trên Supabase:')
for (const table of ['payroll_adjustments', 'payroll_locks', 'payroll_audit_logs']) {
  try {
    await checkTableReadable(table)
    ok(`Bảng ${table} đọc được`)
  } catch (error) {
    if (isMissingSchemaTableError(error)) {
      fail(`Bảng ${table}`, new Error('Chưa có trong schema cache — chạy RUN_PAYROLL_SETUP.sql'))
    } else {
      fail(`Bảng ${table}`, error)
    }
  }
}

let employees = []
let invoices = []
let attendance = []
let adjustments = []
let locks = []

console.log('\n2. Tải dữ liệu nguồn lương:')
try {
  employees = (await fetchEmployeesFiltered({})).map(normalizeEmployee)
  ok('employees', `${employees.length} nhân viên`)
} catch (error) {
  fail('employees', error)
}

try {
  const scope = { fromDate, toDate, branchId: '', employeeId: '' }
  invoices = await fetchInvoicesFiltered(scope) ?? []
  ok('invoices', `${invoices.length} hóa đơn trong kỳ`)
} catch (error) {
  fail('invoices', error)
}

try {
  const scope = { fromDate, toDate, branchId: '', employeeId: '' }
  attendance = await fetchAttendanceFiltered(scope) ?? []
  ok('attendance', `${attendance.length} bản ghi chấm công`)
} catch (error) {
  fail('attendance', error)
}

try {
  adjustments = await fetchPayrollAdjustments({ month }) ?? []
  ok('payroll_adjustments', `${adjustments.length} điều chỉnh`)
} catch (error) {
  fail('payroll_adjustments', error)
}

try {
  locks = await fetchPayrollLocks({ month }) ?? []
  ok('payroll_locks', `${locks.length} khóa tháng`)
} catch (error) {
  fail('payroll_locks', error)
}

console.log('\n3. Tính lương tổng hợp (không lỗi schema):')
let report = null
try {
  report = computePayrollReport({
    month,
    branchId: '',
    employeeId: '',
    employees,
    invoices,
    attendanceRecords: attendance,
    adjustments,
  })
  assert.ok(Array.isArray(report.rows), 'report.rows phải là mảng')
  ok('computePayrollReport', `${report.rows.length} dòng nhân viên, tổng net=${report.dashboard.netSalary}`)
} catch (error) {
  fail('computePayrollReport', error)
}

console.log('\n4. Nhân viên chưa có dữ liệu → 0đ:')
try {
  const invoiceEmployeeIds = new Set(invoices.flatMap((inv) => [inv.employeeId, inv.supportEmployeeId].filter(Boolean)))
  const attendanceEmployeeIds = new Set(attendance.map((row) => row.employeeId).filter(Boolean))
  const adjustmentEmployeeIds = new Set(adjustments.map((row) => row.employeeId).filter(Boolean))

  const emptyCandidates = employees.filter((emp) =>
    isPayrollListEmployee(emp)
    && !invoiceEmployeeIds.has(emp.id)
    && !attendanceEmployeeIds.has(emp.id)
    && !adjustmentEmployeeIds.has(emp.id),
  )

  const sample = emptyCandidates[0] ?? employees.find((emp) => isPayrollListEmployee(emp))
  assert.ok(sample, 'Cần ít nhất 1 nhân viên để kiểm tra')

  const row = computeEmployeePayrollRow(sample, invoices, attendance, adjustments)
  assert.equal(row.netSalary, 0, 'netSalary phải là 0')
  assert.equal(row.commission, 0, 'commission phải là 0')
  assert.equal(row.tips, 0, 'tips phải là 0')
  ok(`Nhân viên không có dữ liệu (${sample.name})`, 'netSalary = 0đ')
} catch (error) {
  fail('Nhân viên 0đ', error)
}

console.log('\n5. Nhân viên có hóa đơn/tips/chấm công:')
try {
  const withData = report?.rows?.filter((row) =>
    row.invoiceCount > 0 || row.tips > 0 || row.attendancePenalty > 0 || row.commission > 0,
  ) ?? []

  if (withData.length === 0) {
    ok('Dữ liệu tháng hiện tại', 'chưa có hóa đơn/tips/chấm công — bỏ qua đối chiếu số')
  } else {
    const sample = withData[0]
    const employee = employees.find((emp) => emp.id === sample.employeeId)
    assert.ok(employee, 'Tìm thấy nhân viên mẫu')
    const recomputed = computeEmployeePayrollRow(employee, invoices, attendance, adjustments)
    assert.equal(recomputed.netSalary, sample.netSalary, 'netSalary khớp')
    assert.equal(recomputed.commission, sample.commission, 'commission khớp')
    assert.equal(recomputed.tips, sample.tips, 'tips khớp')
    ok(
      `Đối chiếu ${sample.employeeName}`,
      `net=${sample.netSalary}, HH=${sample.commission}, tips=${sample.tips}, HĐ=${sample.invoiceCount}`,
    )
  }
} catch (error) {
  fail('Đối chiếu hóa đơn/tips/chấm công', error)
}

console.log('\n6. Drill-down Chi nhánh → Nhân viên:')
try {
  const branches = loadBranches()
  const summaries = aggregateBranchSummaries(branches, employees, report?.rows ?? [])
  assert.ok(summaries.length > 0, 'Phải có ít nhất 1 chi nhánh')
  const totalFromBranches = summaries.reduce((sum, row) => sum + Number(row.netSalary ?? 0), 0)
  const totalFromReport = (report?.rows ?? []).reduce((sum, row) => sum + Number(row.netSalary ?? 0), 0)
  assert.equal(totalFromBranches, totalFromReport, 'Tổng lương chi nhánh khớp tổng nhân viên')
  ok('aggregateBranchSummaries', `${summaries.length} chi nhánh, tổng net=${totalFromBranches}`)
} catch (error) {
  fail('Drill-down chi nhánh', error)
}

console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
