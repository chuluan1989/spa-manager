/**
 * Verify password absolute rule: sync/repair must not overwrite passwords.
 * Run: npx vite-node scripts/verify-password-absolute.mjs
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
  loadCredentials,
  syncEmployeeCredentialsFromEmployees,
  repairEmployeeCredentials,
  syncEmployeeCredentialForEmployee,
  changeOwnEmployeePassword,
  updateEmployeePassword,
  mergeCredentialsPreservingPasswords,
  verifyEmployeePassword,
} = await import('../src/utils/credentialsStorage.js')
const { hashPassword } = await import('../src/utils/passwordHash.js')

// Seed employees cache used by sync helpers
localStorage.setItem('spa-manager-employees', JSON.stringify([
  {
    id: 'emp-test-1',
    name: 'Test User',
    branchId: 'soc-trang',
    status: 'active',
    phone: '0901234567',
    cccd: '001234567890',
  },
]))

sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'admin',
  branch: 'all',
}))

const customHash = await hashPassword('custom-secret-99')
saveCredentials({
  admin: await hashPassword('admin123'),
  branches: {},
  employees: {
    'emp-test-1': {
      branchId: 'soc-trang',
      name: 'Test User',
      password: customHash,
      passwordUpdatedAt: '2026-07-16T10:00:00.000Z',
      customPassword: true,
    },
  },
}, { skipRemoteSync: true })

await syncEmployeeCredentialsFromEmployees()
assert.equal(
  loadCredentials().employees['emp-test-1'].password,
  customHash,
  'C: syncEmployeeCredentialsFromEmployees must not overwrite password',
)

await repairEmployeeCredentials()
assert.equal(
  loadCredentials().employees['emp-test-1'].password,
  customHash,
  'repair must not overwrite password',
)

await syncEmployeeCredentialForEmployee('emp-test-1')
assert.equal(
  loadCredentials().employees['emp-test-1'].password,
  customHash,
  'sync one employee must not overwrite password',
)

const merged = mergeCredentialsPreservingPasswords(
  loadCredentials(),
  {
    admin: loadCredentials().admin,
    branches: {},
    employees: {
      'emp-test-1': {
        branchId: 'soc-trang',
        name: 'Test User Renamed',
        password: await hashPassword('default-should-not-win'),
        passwordUpdatedAt: '2026-07-01T00:00:00.000Z',
        customPassword: false,
      },
    },
  },
)
assert.equal(merged.employees['emp-test-1'].password, customHash, 'D: pull merge keeps newer custom password')

sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'employee',
  branch: 'soc-trang',
  employeeId: 'emp-test-1',
}))

const changed = await changeOwnEmployeePassword({
  employeeId: 'emp-test-1',
  currentPassword: 'custom-secret-99',
  newPassword: 'newpass-123',
  confirmPassword: 'newpass-123',
})
assert.equal(changed.success, true, 'A: change own password succeeds')
assert.equal(await verifyEmployeePassword('emp-test-1', 'newpass-123'), true, 'A: new password verifies')
assert.equal(await verifyEmployeePassword('emp-test-1', 'custom-secret-99'), false, 'A: old password rejected')

sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'admin',
  branch: 'all',
}))
const reset = await updateEmployeePassword('emp-test-1', 'admin-reset-456', 'admin-reset-456')
assert.equal(reset.success, true, `B: admin reset succeeds (${reset.error ?? 'ok'})`)
assert.equal(await verifyEmployeePassword('emp-test-1', 'admin-reset-456'), true, 'B: reset password verifies')

console.log('PASS — password absolute rules (A/B/C/D sync paths)')
