/**
 * Operations Center retired — menu must stay hidden.
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

const { canAccessOpsCenter } = await import('../src/utils/opsCenter/opsCenterAccess.js')
const { ADMIN_NAV_ORDER, NAV_ITEMS } = await import('../src/constants/navigation.js')

assert.equal(canAccessOpsCenter(), false)
assert.ok(!ADMIN_NAV_ORDER.includes('ops-center'))
assert.ok(!NAV_ITEMS.some((item) => item.id === 'ops-center'))

console.log('PASS — verify:operations-center (retired / hidden)')
