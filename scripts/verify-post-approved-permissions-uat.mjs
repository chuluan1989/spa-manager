/**
 * UAT — quyền sau khi phiếu close status = approved
 * Ví dụ: Cherry Kỳ 2/7 approved.
 *
 * Run: npx vite-node scripts/verify-post-approved-permissions-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import {
  isEmployeeDateLockedByApprovedCloseSync,
  isRecordDateInApprovedCloseRange,
  markPostApprovalSourceAdjustment,
  seedApprovedCloseCache,
} from '../src/utils/payrollCycleClose/approvedCloseLock.js'
import { getInvoiceModifyBlockReason } from '../src/utils/invoiceEditPolicy.js'
import { getAttendanceEditBlockReason } from '../src/utils/attendanceEditPolicy.js'
import { canEditInvoice } from '../src/constants/auth.js'
import { ROLES } from '../src/constants/roles.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

console.log('\n=== UAT — Quyền sau APPROVED (Cherry Kỳ 2/7) ===\n')

const cherryClose = {
  employeeId: 'cherry',
  billingMonth: '2026-07',
  cycle: 'period2',
  fromDate: '2026-07-16',
  toDate: '2026-07-31',
  status: 'approved',
  netSalary: 5_000_000,
  snapshot: { netSalary: 5_000_000 },
}

seedApprovedCloseCache([cherryClose])

// 1. Cherry không sửa được HĐ 25/07
{
  assert.equal(isEmployeeDateLockedByApprovedCloseSync('cherry', '2026-07-25'), true)
  assert.equal(isRecordDateInApprovedCloseRange('2026-07-25', cherryClose), true)
  const reason = getInvoiceModifyBlockReason(
    { id: 'inv-2507', employeeId: 'cherry', date: '2026-07-25', branchId: 'bac-lieu' },
    { role: ROLES.EMPLOYEE },
  )
  assert.ok(reason, 'NV phải bị chặn sửa HĐ 25/07')
  console.log('  [PASS] 1. Cherry không sửa được HĐ 25/07')
}

// 2. Cherry không sửa được chấm công 28/07
{
  assert.equal(isEmployeeDateLockedByApprovedCloseSync('cherry', '2026-07-28'), true)
  const reason = getAttendanceEditBlockReason('bac-lieu', '2026-07-28', {
    role: ROLES.EMPLOYEE,
    branchId: 'bac-lieu',
    employeeId: 'cherry',
  })
  assert.ok(reason, 'NV phải bị chặn sửa CC 28/07')
  console.log('  [PASS] 2. Cherry không sửa được chấm công 28/07')
}

// 3. Admin: được sửa + lý do + audit + mark adjustment + không đụng snapshot
{
  const adminBlock = getInvoiceModifyBlockReason(
    { id: 'inv-2507', employeeId: 'cherry', date: '2026-07-25', branchId: 'bac-lieu' },
    { role: ROLES.ADMIN },
  )
  assert.equal(adminBlock, '', 'Admin không bị block UI modify reason')

  const policy = read('src/utils/invoiceEditPolicy.js')
  assert.match(policy, /Vui lòng nhập lý do khi Admin sửa dữ liệu kỳ lương đã duyệt/)
  assert.match(policy, /recordInvoiceAdminAuditIfNeeded/)
  assert.match(policy, /writeInvoiceOverrideAudit/)
  assert.match(policy, /markPostApprovalSourceAdjustment/)

  const lockSrc = read('src/utils/payrollCycleClose/approvedCloseLock.js')
  assert.match(lockSrc, /postApprovalAdjustment/)
  assert.match(lockSrc, /snapshotUnchanged/)
  assert.match(lockSrc, /snapshot: close\.snapshot/)
  assert.match(lockSrc, /netSalary: close\.netSalary/)
  assert.equal(typeof markPostApprovalSourceAdjustment, 'function')

  const guard = read('supabase/migrations/0041_payroll_cycle_closes_post_approval_validation.sql')
  assert.match(guard, /không được sửa snapshot\/lương\/status/)
  assert.match(guard, /validation/)
  console.log('  [PASS] 3. Admin sửa được + bắt buộc lý do + audit + mark adjustment + không đụng snapshot')
}

// 4. Quản lý: theo quyền hiện tại — kỳ approved thì không sửa HĐ (block)
{
  const mgrReason = getInvoiceModifyBlockReason(
    { id: 'inv-2507', employeeId: 'cherry', date: '2026-07-25', branchId: 'bac-lieu' },
    { role: ROLES.BRANCH_MANAGER },
  )
  assert.ok(mgrReason, 'QL bị chặn khi kỳ đã approved (không quyền override)')

  const auth = read('src/constants/auth.js')
  assert.match(auth, /allowManagerEditBranchInvoice/)
  assert.match(auth, /getInvoiceModifyBlockReason/)
  // canEditInvoice phụ thuộc session; kiểm tra policy block là đủ cho approved range
  void canEditInvoice
  console.log('  [PASS] 4. Quản lý: không sửa được khi kỳ approved (đúng quyền hiện tại)')
}

// 5. Admin tạo bổ sung HĐ 28/07: enteredBy + audit + lý do
{
  assert.equal(isEmployeeDateLockedByApprovedCloseSync('cherry', '2026-07-28'), true)
  const invoicePage = read('src/pages/Invoice.jsx')
  assert.match(invoicePage, /adminEditReason/)
  assert.match(invoicePage, /Lý do bổ sung\/sửa sau kỳ đã duyệt|editReason/)

  const storage = read('src/utils/invoiceStorage.js')
  assert.match(storage, /enteredBy/)
  assert.match(storage, /assertCanModifyInvoice/)
  assert.match(storage, /recordInvoiceAdminAuditIfNeeded/)

  const attPolicy = read('src/utils/attendanceEditPolicy.js')
  assert.match(attPolicy, /Admin được sửa kỳ đã duyệt khi có lý do/)
  console.log('  [PASS] 5. Admin tạo bổ sung HĐ 28/07: enteredBy + lý do + audit (code path)')
}

console.log('\n=== DONE — post-approved permissions UAT PASS ===\n')
console.log('Lưu ý: migration 0041 cần apply trên Preview/Prod trước khi mark validation ghi DB.')
console.log('Không deploy trong bước này.\n')
