/**
 * Verify: payroll1 chỉ nhắc Hồ sơ + Chấm công, không khóa hóa đơn.
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

const before = summarizeEmployeePayroll1Status({
  employee,
  attendanceRecords: attendance,
  invoices: [],
  dayReviews: [],
  now: new Date('2026-07-16T10:00:00+07:00'),
})
assert.equal(before.deadlinePassed, false)
assert.ok(before.pendingTasks.length > 0, 'Vẫn nhắc hồ sơ/chấm công nếu thiếu')
assert.equal('invoiceCreateLocked' in before, false, 'Không còn field invoiceCreateLocked')

const afterIncomplete = summarizeEmployeePayroll1Status({
  employee,
  attendanceRecords: attendance,
  invoices: [],
  dayReviews: [],
  now: new Date('2026-07-19T00:05:00+07:00'),
})
assert.equal(afterIncomplete.deadlinePassed, true)
assert.ok(afterIncomplete.pendingTasks.some((t) => t.id === 'attendance'), 'Vẫn nhắc chấm công')
assert.ok(!afterIncomplete.pendingTasks.some((t) => t.id === 'invoices'), 'Không nhắc nhiệm vụ hóa đơn')

const incompleteProfile = summarizeEmployeePayroll1Status({
  employee: { ...employee, phone: '', cccd: '' },
  attendanceRecords: attendance,
  invoices: [],
  dayReviews: [],
  now: new Date('2026-07-20T08:00:00+07:00'),
})
assert.equal(incompleteProfile.profileComplete, false)
assert.ok(incompleteProfile.pendingTasks.some((t) => t.id === 'profile'), 'Vẫn nhắc hồ sơ')

console.log('PASS — payroll1 remind only; no invoice lock fields')
