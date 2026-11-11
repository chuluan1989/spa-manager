/**
 * Khóa sửa/xóa hóa đơn đã lưu của nhân viên — lớp ứng dụng.
 * Không ghi Supabase. Mọi đường save/update/delete trong script này trả về
 * trước khi upsert hoặc xóa dòng.
 *
 * Run: npx vite-node scripts/verify-employee-invoice-edit-lock.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { webcrypto } from 'node:crypto'

const LOCK_MESSAGE = 'Dịch vụ đã ghi nhận. Vui lòng liên hệ Quản lý hoặc Admin nếu cần điều chỉnh.'

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

const BRANCHES = [
  'soc-trang',
  'song-khoe-spa',
  'gia-lai-1',
  'tra-vinh',
  'bac-lieu',
  'vinh-long',
  'gia-lai-2',
  'tram-spa',
]

const employees = BRANCHES.map((branchId) => ({
  id: `emp-${branchId}`,
  name: `NV ${branchId}`,
  branchId,
  status: 'active',
}))

localStorage.setItem('spa-manager-employees', JSON.stringify(employees))
localStorage.setItem('spa-manager-system-settings', JSON.stringify({
  allowEmployeeEditOwnInvoice: true,
  allowManagerEditBranchInvoice: true,
  onlyAdminDeleteInvoice: true,
}))

const savedInvoice = {
  id: 'saved-1',
  date: '2026-01-15',
  branchId: 'soc-trang',
  branchName: 'Sóc Trăng Khoẻ Spa',
  employeeId: 'emp-soc-trang',
  employeeName: 'NV soc-trang',
  serviceIds: ['svc-1'],
  services: [{ id: 'svc-1', name: 'Massage 60', durationMinutes: 60, price: 100000 }],
  tips: 0,
  total: 100000,
  serviceTotal: 100000,
  discountAmount: 0,
}

localStorage.setItem('spa-manager-invoices', JSON.stringify([savedInvoice]))

function setSession(user) {
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify(user))
}

function invoiceCache() {
  return localStorage.getItem('spa-manager-invoices')
}

const { CANONICAL_BRANCH_IDS } = await import('../src/constants/canonicalBranches.js')
const {
  EMPLOYEE_SAVED_INVOICE_LOCK_MESSAGE,
  canAddInvoice,
  canDeleteInvoice,
  canEditInvoice,
} = await import('../src/constants/auth.js')
const { canEmployeeServeAtBranch } = await import('../src/utils/crossBranchSupport.js')
const {
  assertEmployeeInvoiceIdIsNew,
  deleteInvoice,
  releaseEmployeeInvoiceCreateReservation,
  saveInvoice,
  updateInvoice,
} = await import('../src/utils/invoiceStorage.js')

assert.equal(EMPLOYEE_SAVED_INVOICE_LOCK_MESSAGE, LOCK_MESSAGE)
assert.deepEqual(CANONICAL_BRANCH_IDS, BRANCHES)

const ownInvoice = {
  id: 'saved-1',
  branchId: 'soc-trang',
  employeeId: 'emp-soc-trang',
  date: '2026-01-15',
}

for (const branchId of BRANCHES) {
  setSession({
    role: 'employee',
    branch: branchId,
    employeeId: `emp-${branchId}`,
    employeeName: `NV ${branchId}`,
  })
  const invoice = {
    id: `inv-${branchId}`,
    branchId,
    employeeId: `emp-${branchId}`,
    date: '2026-11-01',
  }
  assert.equal(canAddInvoice(), true, `employee create ${branchId}`)
  assert.equal(canEditInvoice(invoice), false, `employee edit ${branchId}`)
  assert.equal(canEditInvoice(invoice, 'admin'), false, `employee cannot pass admin role ${branchId}`)
  assert.equal(canDeleteInvoice(invoice), false, `employee delete ${branchId}`)
  assert.equal(canEditInvoice(ownInvoice), false, `employee edit other/own saved ${branchId}`)
}

setSession({ role: 'admin', branch: 'all' })
for (const branchId of BRANCHES) {
  const invoice = {
    id: `inv-${branchId}`,
    branchId,
    employeeId: `emp-${branchId}`,
    date: '2026-11-01',
  }
  assert.equal(canEditInvoice(invoice), true, `admin edit ${branchId}`)
  assert.equal(canDeleteInvoice(invoice), true, `admin delete ${branchId}`)
}
assert.equal(canEditInvoice(ownInvoice, 'employee'), false)

for (const branchId of BRANCHES) {
  setSession({ role: 'branch_manager', branch: branchId })
  const own = {
    id: `inv-${branchId}`,
    branchId,
    employeeId: `emp-${branchId}`,
    date: '2026-11-01',
  }
  assert.equal(canEditInvoice(own), true, `manager edit own branch ${branchId}`)
  assert.equal(canAddInvoice(), true, `manager create ${branchId}`)
  assert.equal(canDeleteInvoice(own), false, `manager delete still admin-only by default ${branchId}`)
  for (const otherId of BRANCHES) {
    if (otherId === branchId) continue
    assert.equal(
      canEditInvoice({ ...own, branchId: otherId }),
      false,
      `manager ${branchId} cannot edit ${otherId}`,
    )
  }
}

localStorage.setItem('spa-manager-system-settings', JSON.stringify({
  allowEmployeeEditOwnInvoice: true,
  allowManagerEditBranchInvoice: true,
  onlyAdminDeleteInvoice: false,
}))
localStorage.setItem('spa-manager-branch-permissions', JSON.stringify({
  'soc-trang': { deleteInvoice: true },
}))
localStorage.setItem('spa-manager-employee-permissions', JSON.stringify({
  deleteInvoice: true,
  editInvoice: true,
}))
setSession({ role: 'branch_manager', branch: 'soc-trang' })
assert.equal(canDeleteInvoice(ownInvoice), true, 'manager delete permission unchanged when toggle allows it')
assert.equal(canEditInvoice(ownInvoice), true, 'manager edit unchanged')
setSession({
  role: 'employee',
  branch: 'soc-trang',
  employeeId: 'emp-soc-trang',
  employeeName: 'NV soc-trang',
})
assert.equal(canEditInvoice(ownInvoice), false, 'employee edit stays locked when setting and matrix allow it')
assert.equal(canDeleteInvoice(ownInvoice), false, 'employee delete stays locked when setting and matrix allow it')

const beforeCache = invoiceCache()
setSession({
  role: 'employee',
  branch: 'soc-trang',
  employeeId: 'emp-soc-trang',
  employeeName: 'NV soc-trang',
})

const updateResult = await updateInvoice('saved-1', {
  services: [{ id: 'svc-2', name: 'Đổi dịch vụ', durationMinutes: 90, price: 1 }],
  total: 1,
}, savedInvoice, { applyApprovedEditRequest: true })
assert.equal(updateResult.success, false)
assert.equal(updateResult.error, LOCK_MESSAGE)

const deleteResult = await deleteInvoice('saved-1', savedInvoice)
assert.equal(deleteResult.success, false)
assert.equal(deleteResult.error, LOCK_MESSAGE)

const overwrite = await saveInvoice({
  ...savedInvoice,
  services: [{ id: 'svc-9', name: 'Ghi đè', durationMinutes: 75, price: 9 }],
  total: 9,
  serviceTotal: 9,
})
assert.equal(overwrite.success, false)
assert.equal(overwrite.error, LOCK_MESSAGE)
assert.equal(invoiceCache(), beforeCache, 'local invoice cache unchanged')

const crossBranchDenied = await saveInvoice({
  id: 'brand-new-cross-denied',
  date: '2026-11-11',
  branchId: 'tra-vinh',
  employeeId: 'emp-gia-lai-1',
  services: [{ id: 'svc-1', name: 'Massage 60' }],
  serviceIds: ['svc-1'],
  total: 100000,
})
assert.equal(crossBranchDenied.success, false)
assert.equal(crossBranchDenied.error, 'Bạn không có quyền tạo hóa đơn tại chi nhánh này.')
assert.equal(invoiceCache(), beforeCache)

setSession({
  role: 'employee',
  branch: 'soc-trang',
  employeeId: 'emp-soc-trang',
  employeeName: 'NV soc-trang',
})
assert.equal(canEmployeeServeAtBranch('emp-soc-trang', 'tram-spa', 'soc-trang'), true)
assert.equal(canEmployeeServeAtBranch('emp-soc-trang', 'soc-trang', 'soc-trang'), true)
assert.equal(canEmployeeServeAtBranch('emp-gia-lai-1', 'tra-vinh', 'gia-lai-1'), false)

const localHit = await assertEmployeeInvoiceIdIsNew('saved-1', {
  lookupById: async () => {
    throw new Error('lookup must not run when the id is already local')
  },
})
assert.equal(localHit.ok, false)
assert.equal(localHit.error, LOCK_MESSAGE)

const serverHit = await assertEmployeeInvoiceIdIsNew('server-only-id', {
  lookupById: async () => true,
})
assert.equal(serverHit.ok, false)
assert.equal(serverHit.error, LOCK_MESSAGE)

const lookupFailed = await assertEmployeeInvoiceIdIsNew('unknown-while-offline', {
  lookupById: async () => {
    throw new Error('network')
  },
})
assert.equal(lookupFailed.ok, false)
assert.equal(lookupFailed.error, LOCK_MESSAGE)

const emptyId = await assertEmployeeInvoiceIdIsNew('  ')
assert.equal(emptyId.ok, false)

let releaseLookup
const pendingLookup = new Promise((resolve) => {
  releaseLookup = resolve
})
const firstCreate = assertEmployeeInvoiceIdIsNew('race-id', {
  lookupById: () => pendingLookup.then(() => false),
})
await Promise.resolve()
const secondCreate = await assertEmployeeInvoiceIdIsNew('race-id', {
  lookupById: async () => false,
})
assert.equal(secondCreate.ok, false, 'second create with the same id waits behind the in-flight reservation')
releaseLookup()
const firstResult = await firstCreate
assert.equal(firstResult.ok, true)
releaseEmployeeInvoiceCreateReservation('race-id')
const afterRelease = await assertEmployeeInvoiceIdIsNew('race-id', {
  lookupById: async () => false,
})
assert.equal(afterRelease.ok, true)
releaseEmployeeInvoiceCreateReservation('race-id')

setSession({ role: 'branch_manager', branch: 'soc-trang' })
const managerMissing = await updateInvoice('missing-manager-id', { note: 'x' })
assert.equal(managerMissing.success, false)
assert.equal(managerMissing.error, 'Không tìm thấy hóa đơn.')
const managerDeleteMissing = await deleteInvoice('missing-manager-id')
assert.equal(managerDeleteMissing.success, false)
assert.equal(managerDeleteMissing.error, 'Không tìm thấy hóa đơn.')

setSession({ role: 'admin', branch: 'all' })
const adminMissing = await updateInvoice('missing-admin-id', { note: 'x' })
assert.equal(adminMissing.success, false)
assert.equal(adminMissing.error, 'Không tìm thấy hóa đơn.')
const adminDeleteMissing = await deleteInvoice('missing-admin-id')
assert.equal(adminDeleteMissing.success, false)
assert.equal(adminDeleteMissing.error, 'Không tìm thấy hóa đơn.')
assert.equal(invoiceCache(), beforeCache)

const invoiceSrc = readFileSync(join(process.cwd(), 'src/pages/Invoice.jsx'), 'utf8')
const handleEdit = invoiceSrc.slice(
  invoiceSrc.indexOf('const handleEdit'),
  invoiceSrc.indexOf('const pendingEditIdRef'),
)
assert.ok(handleEdit.includes('EMPLOYEE_SAVED_INVOICE_LOCK_MESSAGE'))
assert.ok(handleEdit.indexOf('EMPLOYEE_SAVED_INVOICE_LOCK_MESSAGE') < handleEdit.indexOf('setEditingId'))
const handleDelete = invoiceSrc.slice(
  invoiceSrc.indexOf('const handleDelete'),
  invoiceSrc.indexOf('const handleViewInvoice'),
)
assert.ok(handleDelete.includes('EMPLOYEE_SAVED_INVOICE_LOCK_MESSAGE'))

const settingsSrc = readFileSync(join(process.cwd(), 'src/components/settings/SettingsSystemTab.jsx'), 'utf8')
assert.ok(settingsSrc.includes("if (key === 'allowEmployeeEditOwnInvoice') return"))
assert.ok(settingsSrc.includes('Nhân viên sửa hóa đơn của mình'))
assert.ok(settingsSrc.includes('Đã khóa trên toàn hệ thống. Nhân viên không sửa hoặc xóa hóa đơn đã lưu.'))
const toggleBlock = settingsSrc.slice(
  settingsSrc.indexOf('Nhân viên sửa hóa đơn của mình'),
  settingsSrc.indexOf('Quản lý sửa hóa đơn chi nhánh'),
)
assert.ok(toggleBlock.includes('disabled'))
assert.ok(toggleBlock.includes('checked={false}'))

console.log(`PASS — employee invoice edit lock (${BRANCHES.length} branches, no invoice write)`)
