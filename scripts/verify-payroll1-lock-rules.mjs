/**
 * Verify: hạn chế tạo HĐ chỉ dựa trên Hồ sơ + Chấm công, không dựa hóa đơn/tour.
 * Run: npx vite-node scripts/verify-payroll1-lock-rules.mjs
 */
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

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

localStorage.setItem('spa-manager-system-settings', JSON.stringify({
  payroll1Enabled: true,
  payroll1PeriodStart: '2026-07-01',
  payroll1LockDate: '2026-07-18',
}))

const { summarizeEmployeePayroll1Status } = await import('../src/utils/payroll1Policy.js')

const employee = {
  id: 'emp-1',
  name: 'An',
  phone: '0901234567',
  cccd: '001234567890',
  branchId: 'soc-trang',
  status: 'active',
}

const attendance = [
  { date: '2026-07-01', employeeId: 'emp-1' },
  { date: '2026-07-02', employeeId: 'emp-1' },
]

// Before deadline (16/07): never locked even if missing attendance for many days
const before = summarizeEmployeePayroll1Status({
  employee,
  attendanceRecords: attendance,
  invoices: [],
  dayReviews: [],
  now: new Date('2026-07-16T10:00:00+07:00'),
})
assert.equal(before.invoiceCreateLocked, false, 'Trước 19/07: không hạn chế tạo HĐ')
assert.equal(before.deadlinePassed, false)

// After deadline, profile+attendance incomplete for full period → locked
const afterIncomplete = summarizeEmployeePayroll1Status({
  employee,
  attendanceRecords: attendance,
  invoices: [],
  dayReviews: [],
  now: new Date('2026-07-19T00:05:00+07:00'),
})
assert.equal(afterIncomplete.deadlinePassed, true)
assert.equal(afterIncomplete.invoiceCreateLocked, true, 'Sau 19/07 thiếu chấm công → hạn chế HĐ')
assert.ok(!afterIncomplete.pendingTasks.some((t) => t.id === 'invoices'), 'Không nhắc nhiệm vụ hóa đơn')

// After deadline, profile OK + attendance complete for all days in range → unlocked
// Build attendance for every day 01/07..19/07
const dates = []
for (let d = 1; d <= 19; d += 1) {
  dates.push(`2026-07-${String(d).padStart(2, '0')}`)
}
const fullAttendance = dates.map((date) => ({ date, employeeId: 'emp-1' }))
const afterComplete = summarizeEmployeePayroll1Status({
  employee,
  attendanceRecords: fullAttendance,
  invoices: [], // zero invoices — must NOT lock
  dayReviews: [], // no day reviews — must NOT lock
  now: new Date('2026-07-19T12:00:00+07:00'),
})
assert.equal(afterComplete.profileComplete, true)
assert.equal(afterComplete.attendanceComplete, true)
assert.equal(afterComplete.dataComplete, true)
assert.equal(afterComplete.invoiceCreateLocked, false, 'Không khóa vì thiếu hóa đơn/tour')

// Missing invoices only, profile+attendance OK through today → still unlocked
const datesTo20 = []
for (let d = 1; d <= 20; d += 1) {
  datesTo20.push(`2026-07-${String(d).padStart(2, '0')}`)
}
const attendanceTo20 = datesTo20.map((date) => ({ date, employeeId: 'emp-1' }))
const noInvoices = summarizeEmployeePayroll1Status({
  employee,
  attendanceRecords: attendanceTo20,
  invoices: [],
  dayReviews: [],
  now: new Date('2026-07-20T08:00:00+07:00'),
})
assert.equal(noInvoices.attendanceComplete, true, 'Chấm công đủ đến 20/07')
assert.equal(noInvoices.invoiceCreateLocked, false, 'Thiếu hóa đơn không khóa tạo HĐ')

console.log('PASS — payroll1 lock rules: profile+attendance only; invoices ignored')
