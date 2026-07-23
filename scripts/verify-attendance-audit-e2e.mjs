/**
 * E2E verify attendance audit trên Supabase Production.
 * Gọi attendanceService thật (Quản lý sửa ngày/giờ, Hủy, Không hợp lệ).
 *
 * Yêu cầu: migration 0035 đã chạy trên Supabase.
 * Run: npx vite-node scripts/verify-attendance-audit-e2e.mjs
 */
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'

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
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

function setBranchManagerSession(branchId = 'soc-trang') {
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
    role: 'branch_manager',
    branch: branchId,
  }))
}

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

const { url, key, base } = await loadProductionSupabaseEnv()
process.env.VITE_SUPABASE_URL = url
process.env.VITE_SUPABASE_ANON_KEY = key

console.log(`\n=== Attendance audit E2E (${base}) ===\n`)

const { supabase } = await import('../src/lib/supabaseClient.js')
const { fetchAttendanceEditLogs } = await import('../src/repositories/attendanceRepository.js')
const {
  adminUpdateAttendance,
  adminCreateAttendance,
} = await import('../src/utils/attendanceService.js')
const { getAttendanceEditor } = await import('../src/constants/auth.js')
const { ATTENDANCE_STATUS } = await import('../src/constants/attendanceTypes.js')
const { pullAllFromSupabase } = await import('../src/utils/supabaseSync.js')

// Bootstrap app data
try {
  await pullAllFromSupabase()
  log('Bootstrap Supabase data', true)
} catch (error) {
  const { data: branches } = await supabase.from('branches').select('*')
  const { data: employees } = await supabase.from('employees').select('*')
  localStorage.setItem('spa-manager-branches', JSON.stringify(branches ?? []))
  localStorage.setItem('spa-manager-employees', JSON.stringify(employees ?? []))
  log('Bootstrap branches/employees (fallback)', false, error.message)
}

setBranchManagerSession('soc-trang')
const editor = getAttendanceEditor()

const tableProbe = await supabase.from('attendance_edit_logs').select('id').limit(1)
if (tableProbe.error) {
  console.error('\n✗ Bảng attendance_edit_logs chưa tồn tại — chạy migration 0035 trước.\n')
  process.exit(1)
}
log('Bảng attendance_edit_logs sẵn sàng', true)

const monthPrefix = new Date().toISOString().slice(0, 7)
const testDate = `${monthPrefix}-28`

const { data: existingEmp } = await supabase
  .from('employees')
  .select('id,name,branch_id,status')
  .eq('branch_id', 'soc-trang')
  .eq('status', 'active')
  .limit(1)
  .maybeSingle()

const employeeId = existingEmp?.id
if (!employeeId) {
  console.error('Không tìm thấy nhân viên active soc-trang')
  process.exit(1)
}

// Dọn bản ghi test cũ nếu có
await supabase.from('attendance').delete().eq('employee_id', employeeId).eq('attendance_date', testDate)
await supabase.from('attendance').delete().eq('employee_id', employeeId).eq('attendance_date', `${monthPrefix}-27`)

const checkIn = new Date(`${testDate}T08:00:00`).toISOString()
const checkOut = new Date(`${testDate}T17:00:00`).toISOString()

let record
try {
  record = await adminCreateAttendance({
    employeeId,
    employeeName: existingEmp.name,
    branchId: 'soc-trang',
    date: testDate,
    status: ATTENDANCE_STATUS.ON_TIME,
    reason: 'E2E audit test',
    note: 'Tạo bởi verify-attendance-audit-e2e',
    editNote: 'Tạo bản ghi test audit',
    submittedAt: checkIn,
    updatedAt: checkOut,
    editor,
  })
  log('Tạo bản ghi chấm công test', Boolean(record?.id))
} catch (error) {
  log('Tạo bản ghi chấm công test', false, error.message)
  process.exit(1)
}

const attendanceId = record.id

async function countLogs() {
  const rows = await fetchAttendanceEditLogs(attendanceId)
  return rows
}

let logs = await countLogs()
log('Audit sau create', logs.some((l) => l.fieldName === 'create'), `logs=${logs.length}`)

// 1. Sửa ngày
const newDate = `${monthPrefix}-27`
try {
  record = await adminUpdateAttendance({
    record,
    nextDate: newDate,
    editNote: 'E2E: sửa ngày chấm công',
    editor,
  })
  logs = await countLogs()
  const dateLog = logs.find((l) => l.fieldName === 'date')
  log('Quản lý sửa ngày → audit log', Boolean(dateLog), dateLog ? `${dateLog.oldValue} → ${dateLog.newValue}` : '')
} catch (error) {
  log('Quản lý sửa ngày → audit log', false, error.message)
}

// 2. Sửa giờ vào
const newCheckIn = new Date(`${newDate}T09:15:00`).toISOString()
try {
  record = await adminUpdateAttendance({
    record,
    nextSubmittedAt: newCheckIn,
    editNote: 'E2E: sửa giờ vào',
    editor,
  })
  logs = await countLogs()
  log('Quản lý sửa giờ vào → audit log', logs.some((l) => l.fieldName === 'check_in'))
} catch (error) {
  log('Quản lý sửa giờ vào → audit log', false, error.message)
}

// 3. Sửa giờ ra
const newCheckOut = new Date(`${newDate}T18:30:00`).toISOString()
try {
  record = await adminUpdateAttendance({
    record,
    nextUpdatedAt: newCheckOut,
    editNote: 'E2E: sửa giờ ra',
    editor,
  })
  logs = await countLogs()
  log('Quản lý sửa giờ ra → audit log', logs.some((l) => l.fieldName === 'check_out'))
} catch (error) {
  log('Quản lý sửa giờ ra → audit log', false, error.message)
}

// 4. Hủy bản ghi
try {
  const { adminVoidAttendance } = await import('../src/utils/attendanceService.js')
  record = await adminVoidAttendance({
    record,
    voidType: 'cancelled',
    editNote: 'E2E: hủy bản ghi test',
    editor,
  })
  logs = await countLogs()
  const cancelLog = logs.find((l) => l.fieldName === 'status' && l.newValue === ATTENDANCE_STATUS.CANCELLED)
  log('Hủy bản ghi → audit log status=cancelled', Boolean(cancelLog))
} catch (error) {
  log('Hủy bản ghi → audit log', false, error.message)
}

// 5. Không hợp lệ — tạo bản ghi mới để void invalid
const testDate2 = `${monthPrefix}-26`
await supabase.from('attendance').delete().eq('employee_id', employeeId).eq('attendance_date', testDate2)
let record2
try {
  record2 = await adminCreateAttendance({
    employeeId,
    employeeName: existingEmp.name,
    branchId: 'soc-trang',
    date: testDate2,
    status: ATTENDANCE_STATUS.ON_TIME,
    editNote: 'E2E: tạo cho test invalid',
    submittedAt: checkIn,
    updatedAt: checkOut,
    editor,
  })
  const { adminVoidAttendance } = await import('../src/utils/attendanceService.js')
  await adminVoidAttendance({
    record: record2,
    voidType: 'invalid',
    editNote: 'E2E: đánh dấu không hợp lệ',
    editor,
  })
  const logs2 = await fetchAttendanceEditLogs(record2.id)
  log('Không hợp lệ → audit log status=invalid', logs2.some(
    (l) => l.fieldName === 'status' && l.newValue === ATTENDANCE_STATUS.INVALID,
  ))
} catch (error) {
  log('Không hợp lệ → audit log', false, error.message)
}

// Verify "Chỉnh sửa gần nhất" data shape
logs = await fetchAttendanceEditLogs(attendanceId)
const latest = logs[0]
log('"Chỉnh sửa gần nhất" — có editorName', Boolean(latest?.editorName))
log('"Chỉnh sửa gần nhất" — có editedAt', Boolean(latest?.editedAt))
log('"Chỉnh sửa gần nhất" — có note (lý do)', Boolean(latest?.note?.trim()))
log('Lịch sử audit đầy đủ (≥4 entries)', logs.length >= 4, `count=${logs.length}`)

// Attendance / Payroll / Dashboard / Report không throw
try {
  const { fetchAttendanceFiltered } = await import('../src/repositories/attendanceRepository.js')
  const rows = await fetchAttendanceFiltered({ branchId: 'soc-trang', fromDate: `${monthPrefix}-01`, toDate: `${monthPrefix}-31` })
  log('Attendance query OK', Array.isArray(rows))
} catch (error) {
  log('Attendance query OK', false, error.message)
}

try {
  const { fetchPayrollLocks } = await import('../src/repositories/payrollRepository.js')
  await fetchPayrollLocks({ month: monthPrefix })
  log('Payroll locks query OK', true)
} catch (error) {
  log('Payroll locks query OK', false, error.message)
}

try {
  const { computeDashboardStats } = await import('../src/utils/dashboardStats.js')
  const stats = computeDashboardStats([], [])
  log('Dashboard stats compute OK', typeof stats === 'object')
} catch (error) {
  log('Dashboard stats compute OK', false, error.message)
}

try {
  const { computeReportData } = await import('../src/utils/report.js')
  const report = computeReportData([], [], { fromDate: `${monthPrefix}-01`, toDate: `${monthPrefix}-31` })
  log('Báo cáo compute OK', typeof report?.summary === 'object')
} catch (error) {
  log('Báo cáo compute OK', false, error.message)
}

// DB row count
const { count } = await supabase
  .from('attendance_edit_logs')
  .select('*', { count: 'exact', head: true })
  .eq('attendance_id', attendanceId)
log('attendance_edit_logs có dữ liệu trên DB', (count ?? 0) > 0, `rows=${count}`)

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
