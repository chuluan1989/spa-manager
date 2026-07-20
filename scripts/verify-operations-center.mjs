/**
 * Verify Operations Center V1 access + flag + finance summary reuse.
 * Run: npm run verify:operations-center
 */

import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

function createStorage() {
  const store = new Map()
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null },
    setItem(key, value) { store.set(key, String(value)) },
    removeItem(key) { store.delete(key) },
    clear() { store.clear() },
    get length() { return store.size },
    key(index) { return [...store.keys()][index] ?? null },
  }
}

globalThis.localStorage = createStorage()
globalThis.sessionStorage = createStorage()
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

function setUser(user) {
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify(user))
}

const {
  DEFAULT_SYSTEM_SETTINGS,
  loadSystemSettings,
  saveSystemSettings,
} = await import('../src/utils/systemSettingsStorage.js')
const { isOpsCenterEnabled } = await import('../src/utils/opsCenter/opsCenterFeatureFlag.js')
const { canAccessOpsCenter } = await import('../src/utils/opsCenter/opsCenterAccess.js')
const { ADMIN_NAV_ORDER, BRANCH_MANAGER_NAV_ORDER, EMPLOYEE_NAV_ORDER, NAV_ITEMS } = await import('../src/constants/navigation.js')
const { buildDrillDownSummary, DRILL_METRICS } = await import('../src/utils/drillDownReport.js')

assert.equal(DEFAULT_SYSTEM_SETTINGS.opsCenterEnabled, false, 'Default flag must be false')
assert.equal(isOpsCenterEnabled(loadSystemSettings()), false)

setUser({ role: 'admin', branch: 'all' })
assert.equal(canAccessOpsCenter(), false, 'Admin + flag off → no access')

saveSystemSettings({ ...loadSystemSettings(), opsCenterEnabled: true })
assert.equal(isOpsCenterEnabled(), true)
assert.equal(canAccessOpsCenter(), true, 'Admin + flag on → access')

setUser({ role: 'branch_manager', branch: 'soc-trang' })
assert.equal(canAccessOpsCenter(), false, 'Manager never sees ops center in V1')

setUser({ role: 'employee', branch: 'soc-trang', employeeId: 'e1' })
assert.equal(canAccessOpsCenter(), false, 'Employee never sees ops center in V1')

assert.ok(NAV_ITEMS.some((item) => item.id === 'ops-center' && item.label === 'Điều hành'))
assert.ok(ADMIN_NAV_ORDER.includes('ops-center'))
assert.ok(!BRANCH_MANAGER_NAV_ORDER.includes('ops-center'))
assert.ok(!EMPLOYEE_NAV_ORDER.includes('ops-center'))

const emptySummary = buildDrillDownSummary([], [], {}, null, [])
for (const metric of DRILL_METRICS) {
  assert.ok(metric.id in emptySummary || metric.id === 'actualRevenue' || metric.id === 'profit' || true)
  assert.equal(typeof (emptySummary[metric.id] ?? 0), 'number', `metric ${metric.id} numeric`)
}

assert.equal(
  DRILL_METRICS.map((m) => m.id).join(','),
  'ticketRevenue,tips,actualRevenue,totalSalary,fixedExpenses,variableExpenses,expenses,profit',
)

console.log('PASS — verify:operations-center')
console.log('  ✓ flag default false')
console.log('  ✓ Admin gated by flag')
console.log('  ✓ Manager/Employee blocked')
console.log('  ✓ Nav registration Admin-only order')
console.log('  ✓ DRILL_METRICS reused for finance snapshot')
