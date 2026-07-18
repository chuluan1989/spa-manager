/**
 * Verify self-change password rules (employee / manager / admin).
 * Run: npx vite-node scripts/verify-self-change-password.mjs
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

const {
  saveCredentials,
  changeOwnEmployeePassword,
  changeOwnBranchPassword,
  changeOwnAdminPassword,
  verifyEmployeePassword,
  verifyBranchPassword,
  verifyAdminPassword,
  validateNewPassword,
  MIN_PASSWORD_LENGTH,
} = await import('../src/utils/credentialsStorage.js')
const { hashPassword } = await import('../src/utils/passwordHash.js')

assert.equal(MIN_PASSWORD_LENGTH, 8)

localStorage.setItem('spa-manager-employees', JSON.stringify([
  {
    id: 'emp-pw-1',
    name: 'Nguyen Van A',
    branchId: 'soc-trang',
    status: 'active',
    phone: '0901234567',
    cccd: '001234567890',
  },
]))

const oldHash = await hashPassword('oldpass12')
saveCredentials({
  admin: await hashPassword('admin123'),
  branches: {
    'soc-trang': await hashPassword('branch123'),
  },
  employees: {
    'emp-pw-1': {
      branchId: 'soc-trang',
      name: 'Nguyen Van A',
      password: oldHash,
      passwordUpdatedAt: '2026-07-16T10:00:00.000Z',
      customPassword: true,
    },
  },
}, { skipRemoteSync: true })

sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'employee',
  branch: 'soc-trang',
  employeeId: 'emp-pw-1',
}))

// Test 1: wrong current password
{
  const result = await changeOwnEmployeePassword({
    employeeId: 'emp-pw-1',
    currentPassword: 'wrong-pass',
    newPassword: 'newpass99',
    confirmPassword: 'newpass99',
  })
  assert.equal(result.success, false, 'Test1: wrong current must fail')
  assert.equal(await verifyEmployeePassword('emp-pw-1', 'oldpass12'), true, 'Test1: old still valid')
}

// Test 2: too short
{
  const result = await changeOwnEmployeePassword({
    employeeId: 'emp-pw-1',
    currentPassword: 'oldpass12',
    newPassword: 'ab12',
    confirmPassword: 'ab12',
  })
  assert.equal(result.success, false, 'Test2: short password must fail')
  assert.match(result.error ?? '', /tối thiểu 8/i)
}

// Test 3: confirm mismatch
{
  const result = await changeOwnEmployeePassword({
    employeeId: 'emp-pw-1',
    currentPassword: 'oldpass12',
    newPassword: 'newpass99',
    confirmPassword: 'newpass88',
  })
  assert.equal(result.success, false, 'Test3: confirm mismatch must fail')
}

// Test 4: same as current
{
  const result = await changeOwnEmployeePassword({
    employeeId: 'emp-pw-1',
    currentPassword: 'oldpass12',
    newPassword: 'oldpass12',
    confirmPassword: 'oldpass12',
  })
  assert.equal(result.success, false, 'Test4: same as current must fail')
}

// letter+digit required
{
  const noDigit = validateNewPassword('abcdefgh', 'abcdefgh')
  assert.equal(noDigit.ok, false)
  const noLetter = validateNewPassword('12345678', '12345678')
  assert.equal(noLetter.ok, false)
  const leadingSpace = validateNewPassword(' newpass1', ' newpass1')
  assert.equal(leadingSpace.ok, false)
}

// ownership: cannot change another employee
{
  const result = await changeOwnEmployeePassword({
    employeeId: 'emp-other',
    currentPassword: 'oldpass12',
    newPassword: 'newpass99',
    confirmPassword: 'newpass99',
  })
  assert.equal(result.success, false, 'ownership: other employee blocked')
}

// Test 5: success
{
  const result = await changeOwnEmployeePassword({
    employeeId: 'emp-pw-1',
    currentPassword: 'oldpass12',
    newPassword: 'newpass99',
    confirmPassword: 'newpass99',
  })
  assert.equal(result.success, true, `Test5: change succeeds (${result.error ?? 'ok'})`)
}

// Test 6: old rejected
assert.equal(await verifyEmployeePassword('emp-pw-1', 'oldpass12'), false, 'Test6: old password rejected')

// Test 7: new accepted
assert.equal(await verifyEmployeePassword('emp-pw-1', 'newpass99'), true, 'Test7: new password accepted')

// Test 8: manager + admin
sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'branch_manager',
  branch: 'soc-trang',
}))
{
  const fail = await changeOwnBranchPassword({
    branchId: 'soc-trang',
    currentPassword: 'wrong',
    newPassword: 'branch999',
    confirmPassword: 'branch999',
  })
  assert.equal(fail.success, false, 'manager wrong current fails')

  const ok = await changeOwnBranchPassword({
    branchId: 'soc-trang',
    currentPassword: 'branch123',
    newPassword: 'branch999',
    confirmPassword: 'branch999',
  })
  assert.equal(ok.success, true, `manager change succeeds (${ok.error ?? 'ok'})`)
  assert.equal(await verifyBranchPassword('soc-trang', 'branch999'), true)
  assert.equal(await verifyBranchPassword('soc-trang', 'branch123'), false)
}

sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'admin',
  branch: 'all',
}))
{
  const fail = await changeOwnAdminPassword({
    currentPassword: 'wrong',
    newPassword: 'admin9999',
    confirmPassword: 'admin9999',
  })
  assert.equal(fail.success, false, 'admin wrong current fails')

  const ok = await changeOwnAdminPassword({
    currentPassword: 'admin123',
    newPassword: 'admin9999',
    confirmPassword: 'admin9999',
  })
  assert.equal(ok.success, true, `admin change succeeds (${ok.error ?? 'ok'})`)
  assert.equal(await verifyAdminPassword('admin9999'), true)
  assert.equal(await verifyAdminPassword('admin123'), false)
}

// employee cannot call admin change
sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'employee',
  branch: 'soc-trang',
  employeeId: 'emp-pw-1',
}))
{
  const result = await changeOwnAdminPassword({
    currentPassword: 'admin9999',
    newPassword: 'hacked123',
    confirmPassword: 'hacked123',
  })
  assert.equal(result.success, false, 'employee cannot change admin password')
}

console.log('PASS — self-change password rules (Tests 1–8)')
