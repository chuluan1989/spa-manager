/**
 * UAT CUỐI — Admin bypass lock + NV khóa approved + snapshot không đổi.
 *
 * Cases:
 * 1. Admin 03/08: tạo/sửa/xóa — không hỏi lý do
 * 2. Admin sửa 25/07 approved: lý do + audit + mark adjustment
 * 3. Admin xóa 25/07 approved: lý do + audit + mark adjustment
 * 4. Manager: không bypass
 * 5. NV 03/08 OK; 25/07 không sửa/xóa
 * 6. Sau Admin sửa 25/07: snapshot approved không bị đổi âm thầm
 *
 * Run: npx vite-node scripts/verify-admin-invoice-bypass-lock-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { saveCurrentUser } from '../src/utils/authStorage.js'
import { ROLES } from '../src/constants/roles.js'
import {
  canAddInvoiceForDate,
  canDeleteInvoice,
  canEditInvoice,
  isAdmin,
} from '../src/constants/auth.js'
import {
  assertCanModifyInvoice,
  getInvoiceModifyBlockReason,
} from '../src/utils/invoiceEditPolicy.js'
import {
  isEmployeeDateLockedByApprovedCloseSync,
  isRecordDateInApprovedCloseRange,
  seedApprovedCloseCache,
} from '../src/utils/payrollCycleClose/approvedCloseLock.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

function asAdmin() {
  saveCurrentUser({ role: ROLES.ADMIN, branch: 'all', name: 'Admin UAT' })
}
function asEmployee() {
  saveCurrentUser({
    role: ROLES.EMPLOYEE,
    branch: 'bac-lieu',
    employeeId: 'cherry',
    name: 'Cherry',
  })
}
function asManager() {
  saveCurrentUser({
    role: ROLES.BRANCH_MANAGER,
    branch: 'bac-lieu',
    name: 'QL Bac Lieu',
  })
}

const cherryApproved = {
  employeeId: 'cherry',
  billingMonth: '2026-07',
  cycle: 'period2',
  fromDate: '2026-07-16',
  toDate: '2026-07-31',
  status: 'approved',
  netSalary: 5_000_000,
  snapshot: { netSalary: 5_000_000, totals: { net: 5_000_000 } },
}

seedApprovedCloseCache([cherryApproved])

const invAug = {
  id: 'inv-aug-0308',
  employeeId: 'cherry',
  date: '2026-08-03',
  branchId: 'bac-lieu',
}
const invJul = {
  id: 'inv-jul-2507',
  employeeId: 'cherry',
  date: '2026-07-25',
  branchId: 'bac-lieu',
}

console.log('\n=== UAT CUỐI — Admin / Manager / NV + snapshot ===\n')

// ---------------------------------------------------------------------------
// 1. Admin — 03/08: tạo / sửa / xóa — không hỏi lý do
// ---------------------------------------------------------------------------
{
  asAdmin()
  assert.equal(isAdmin(), true)
  assert.equal(isEmployeeDateLockedByApprovedCloseSync('cherry', '2026-08-03'), false)
  assert.equal(isRecordDateInApprovedCloseRange('2026-08-03', cherryApproved), false)

  assert.equal(canAddInvoiceForDate('2026-08-03', ROLES.ADMIN, 'all', { employeeId: 'cherry' }), true)
  assert.equal(canEditInvoice(invAug), true)
  assert.equal(canDeleteInvoice(invAug), true)
  assert.equal(getInvoiceModifyBlockReason(invAug, { role: ROLES.ADMIN }), '')

  await assertCanModifyInvoice(invAug, { editReason: '' })
  await assertCanModifyInvoice(invAug, {})

  const page = read('src/pages/Invoice.jsx')
  // Lý do Admin chỉ khi closedTarget (approved lock) — không bắt cho tháng 8
  assert.match(page, /isAdmin\(\) && closedTarget && !adminEditReason\.trim\(\)/)
  assert.match(page, /isAdmin\(\) && closed/)
  assert.match(page, /!isAdmin\(\) && \(/)

  console.log('  [PASS] 1. Admin 03/08: tạo/sửa/xóa được — không hỏi lý do')
}

// ---------------------------------------------------------------------------
// 2. Admin — sửa 25/07 approved: lý do + audit + mark
// ---------------------------------------------------------------------------
{
  asAdmin()
  assert.equal(isEmployeeDateLockedByApprovedCloseSync('cherry', '2026-07-25'), true)
  assert.equal(canEditInvoice(invJul), true)

  await assert.rejects(
    () => assertCanModifyInvoice(invJul, { editReason: '' }),
    /lý do/i,
  )
  await assertCanModifyInvoice(invJul, { editReason: 'UAT bổ sung sau duyệt' })

  const policy = read('src/utils/invoiceEditPolicy.js')
  assert.match(policy, /recordInvoiceAdminAuditIfNeeded/)
  assert.match(policy, /writeInvoiceOverrideAudit/)
  assert.match(policy, /markPostApprovalSourceAdjustment/)
  assert.match(policy, /post_approval_invoice_/)

  const storage = read('src/utils/invoiceStorage.js')
  assert.match(storage, /recordInvoiceAdminAuditIfNeeded/)
  assert.match(storage, /editReason: options\.editReason/)

  console.log('  [PASS] 2. Admin sửa 25/07 approved: bắt lý do + audit + mark adjustment')
}

// ---------------------------------------------------------------------------
// 3. Admin — xóa 25/07 approved: lý do + audit + mark
// ---------------------------------------------------------------------------
{
  asAdmin()
  assert.equal(canDeleteInvoice(invJul), true)
  await assert.rejects(
    () => assertCanModifyInvoice(invJul, { editReason: '' }),
    /lý do/i,
  )
  await assertCanModifyInvoice(invJul, { editReason: 'UAT xóa sau duyệt' })

  const page = read('src/pages/Invoice.jsx')
  assert.match(page, /Nhập lý do xóa hóa đơn/)
  assert.match(page, /isAdmin\(\) && closed/)

  const storage = read('src/utils/invoiceStorage.js')
  assert.match(storage, /action: 'delete'/)
  assert.match(storage, /canDeleteInvoice\(current\)/)

  const policy = read('src/utils/invoiceEditPolicy.js')
  // mark gắn sau audit cho mọi action (create/update/delete) khi locked
  assert.match(policy, /markPostApprovalSourceAdjustment\(employeeId, invoice\.date/)

  console.log('  [PASS] 3. Admin xóa 25/07 approved: bắt lý do + audit + mark adjustment')
}

// ---------------------------------------------------------------------------
// 4. Manager — đúng quyền, không bypass
// ---------------------------------------------------------------------------
{
  asManager()
  assert.ok(getInvoiceModifyBlockReason(invJul, { role: ROLES.BRANCH_MANAGER }))
  assert.equal(canEditInvoice(invJul, ROLES.BRANCH_MANAGER), false)
  assert.equal(canDeleteInvoice(invJul, ROLES.BRANCH_MANAGER), false)
  // Aug: không khóa approved — vẫn phụ thuộc quyền settings/branch (không tự = Admin)
  assert.equal(getInvoiceModifyBlockReason(invAug, { role: ROLES.BRANCH_MANAGER }), '')
  assert.notEqual(isAdmin(), true)

  const auth = read('src/constants/auth.js')
  assert.match(auth, /allowManagerEditBranchInvoice/)
  assert.match(auth, /role === ROLES\.ADMIN \|\| isAdmin\(\)/)

  console.log('  [PASS] 4. Manager: không bypass; kỳ approved vẫn bị khóa')
}

// ---------------------------------------------------------------------------
// 5. Nhân viên — 03/08 OK; 25/07 không sửa/xóa
// ---------------------------------------------------------------------------
{
  asEmployee()
  assert.equal(isEmployeeDateLockedByApprovedCloseSync('cherry', '2026-08-03'), false)
  assert.equal(getInvoiceModifyBlockReason(invAug, { role: ROLES.EMPLOYEE }), '')
  assert.equal(canAddInvoiceForDate('2026-08-03', ROLES.EMPLOYEE, 'bac-lieu', { employeeId: 'cherry' }), true)

  assert.equal(isEmployeeDateLockedByApprovedCloseSync('cherry', '2026-07-25'), true)
  const block = getInvoiceModifyBlockReason(invJul, { role: ROLES.EMPLOYEE })
  assert.ok(block)
  assert.match(block, /yêu cầu|Admin/i)
  assert.equal(canEditInvoice(invJul, ROLES.EMPLOYEE), false)
  assert.equal(canDeleteInvoice(invJul, ROLES.EMPLOYEE), false)

  console.log('  [PASS] 5. NV 03/08 tạo/sửa/xóa không khóa kỳ; 25/07 không sửa/xóa')
}

// ---------------------------------------------------------------------------
// 6. Snapshot approved không đổi âm thầm; flag điều chỉnh sau duyệt
// ---------------------------------------------------------------------------
{
  const lock = read('src/utils/payrollCycleClose/approvedCloseLock.js')
  assert.match(lock, /markPostApprovalSourceAdjustment/)
  assert.match(lock, /postApprovalAdjustment: true/)
  assert.match(lock, /snapshot: close\.snapshot/)
  assert.match(lock, /attendanceSnapshot: close\.attendanceSnapshot/)
  assert.match(lock, /netSalary: close\.netSalary/)
  assert.match(lock, /status: CLOSE_CYCLE_STATUS\.APPROVED/)
  assert.match(lock, /snapshotUnchanged: true/)
  // Invalidate không đụng phiếu approved
  assert.match(lock, /if \(existing\.status === CLOSE_CYCLE_STATUS\.APPROVED\) return null/)

  const guard = read('supabase/migrations/0041_payroll_cycle_closes_post_approval_validation.sql')
  assert.match(guard, /new\.snapshot is distinct from old\.snapshot/)
  assert.match(guard, /new\.net_salary is distinct from old\.net_salary/)
  assert.match(guard, /không được sửa snapshot\/lương\/status/)

  // approveCloseCycle giữ snapshot
  const submit = read('src/utils/payrollCycleClose/submitCloseCycle.js')
  assert.match(submit, /Khóa snapshot hiện tại|snapshot: existing\.snapshot/)

  console.log('  [PASS] 6. Không âm thầm đổi snapshot; flag postApprovalAdjustment + guard DB')
}

console.log('\n=== DONE — UAT CUỐI 1–6 PASS (chưa commit / chưa deploy) ===\n')
