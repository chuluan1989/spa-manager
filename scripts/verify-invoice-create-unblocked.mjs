/**
 * Verify: App không còn modal bắt buộc / chuỗi khóa HĐ; canAddInvoice luôn true cho NV.
 * Run: npx vite-node scripts/verify-invoice-create-unblocked.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

const appSrc = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8')
assert.equal(appSrc.includes('Payroll1NoticeModal'), false, 'App không được mở Payroll1NoticeModal')
assert.equal(appSrc.includes('EmployeeAttendanceLanding'), false, 'App không được chặn bằng EmployeeAttendanceLanding')
assert.equal(appSrc.includes('PREVIEW_BUILD_MARKER'), false, 'App không hiện banner Preview')
assert.equal(appSrc.includes('buildMarker'), false, 'App không import buildMarker')
assert.ok(appSrc.includes('CompletionRemindBanner'), 'App phải có banner nhắc có thể bỏ qua')

const invoiceSrc = readFileSync(join(process.cwd(), 'src/pages/Invoice.jsx'), 'utf8')
assert.equal(invoiceSrc.includes('payroll1Locked'), false, 'Invoice không dùng payroll1Locked')
assert.equal(invoiceSrc.includes('profileLocked'), false, 'Invoice không dùng profileLocked')
assert.equal(invoiceSrc.includes('PAYROLL1_INVOICE'), false, 'Invoice không chứa chuỗi khóa payroll1')

localStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'employee',
  branch: 'soc-trang',
  employeeId: 'emp-1',
}))
localStorage.setItem('spa-manager-system-settings', JSON.stringify({
  allowEmployeeEditOwnInvoice: true,
  allowManagerEditBranchInvoice: true,
}))

const { canAddInvoice } = await import('../src/constants/auth.js')
assert.equal(canAddInvoice('employee'), true)
assert.equal(canAddInvoice('branch_manager'), true)
assert.equal(canAddInvoice('admin'), true)

console.log('PASS — invoice create unblocked for employee/manager/admin')
