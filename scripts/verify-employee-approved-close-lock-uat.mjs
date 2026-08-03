/**
 * UAT — khóa kỳ theo NV approved (không khóa lịch 16/01).
 * Run: npx vite-node scripts/verify-employee-approved-close-lock-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

console.log('\n=== UAT — Employee approved close lock ===\n')

{
  const lock = read('src/utils/payrollCycleClose/approvedCloseLock.js')
  assert.match(lock, /isEmployeeRecordLockedByApprovedClose/)
  assert.match(lock, /invalidateCloseAfterSourceChange/)
  assert.match(lock, /CLOSE_CYCLE_STATUS\.APPROVED|status === ['"]approved['"]|APPROVED/)
  assert.match(lock, /dataChangedAfterSubmit/)
  console.log('  [PASS] approvedCloseLock: per-employee approved + invalidate after change')
}

{
  const invoicePolicy = read('src/utils/invoiceEditPolicy.js')
  assert.doesNotMatch(invoicePolicy, /isPayCycleClosedForRecordDate/)
  assert.match(invoicePolicy, /isEmployeeRecordLockedByApprovedClose|isEmployeeDateLockedByApprovedCloseSync/)
  console.log('  [PASS] invoiceEditPolicy không dùng khóa lịch')
}

{
  const auth = read('src/constants/auth.js')
  assert.doesNotMatch(auth, /isPayCycleClosedForRecordDate/)
  assert.match(auth, /isEmployeeDateLockedByApprovedCloseSync/)
  console.log('  [PASS] canAddInvoiceForDate dùng approved lock sync')
}

{
  const attendance = read('src/utils/attendanceService.js')
  assert.doesNotMatch(attendance, /isPayCycleClosedForRecordDate/)
  assert.match(attendance, /isEmployeeRecordLockedByApprovedClose/)
  assert.match(attendance, /invalidateCloseAfterSourceChange/)
  console.log('  [PASS] attendanceService khóa theo approved + invalidate')
}

{
  const attPolicy = read('src/utils/attendanceEditPolicy.js')
  assert.doesNotMatch(attPolicy, /isPayCycleClosedForRecordDate/)
  console.log('  [PASS] attendanceEditPolicy bỏ khóa lịch')
}

{
  const invoicePage = read('src/pages/Invoice.jsx')
  assert.doesNotMatch(invoicePage, /isPayCycleClosedForRecordDate/)
  assert.match(invoicePage, /refreshApprovedCloseCache/)
  assert.match(invoicePage, /openNewInvoiceForm/)
  console.log('  [PASS] Invoice.jsx dùng cache approved + reset form tạo mới')
}

{
  const periodLock = read('src/utils/payrollPeriodLock.js')
  assert.match(periodLock, /DEPRECATED|approvedCloseLock/)
  console.log('  [PASS] payrollPeriodLock đánh dấu deprecated cho chặn NV')
}

console.log('\n=== DONE — code checks PASS; UAT tay trên Preview ===\n')
