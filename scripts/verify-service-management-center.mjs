/**
 * Verify Admin Service Management center logic.
 * Run: node scripts/verify-service-management-center.mjs
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

if (import.meta.env) {
  import.meta.env.VITE_SUPABASE_URL = ''
  import.meta.env.VITE_SUPABASE_ANON_KEY = ''
}

sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  id: 'admin-1',
  name: 'Admin Test',
  role: 'admin',
  branchId: 'soc-trang',
}))

const { seedDefaultTestEmployees } = await import('./test-employee-fixtures.mjs')
const { syncMissingDefaultBranches } = await import('../src/utils/branchStorage.js')
syncMissingDefaultBranches()
seedDefaultTestEmployees()

const {
  createServiceWithPricing,
  deleteDurationSafe,
  deleteServiceSafe,
  ensureBranchCatalogSeeded,
  getActiveServicesForBranchV2,
  getBranchPricingMatrix,
  getCatalogAdminTree,
  ITEM_STATUS,
  setBranchDurationPrice,
  setDurationVisibility,
  setServiceVisibility,
} = await import('../src/utils/serviceCatalogV2Storage.js')

const { hasServiceInvoiceReferences } = await import('../src/utils/serviceInvoiceGuard.js')
const { getServiceChangeLogs } = await import('../src/utils/serviceChangeLogStorage.js')
const {
  filterServiceRows,
  parseCommissionPercentInput,
  parsePriceInput,
  buildServiceManagementRows,
} = await import('../src/utils/serviceManagementHelpers.js')

const BRANCH_A = 'soc-trang'
const BRANCH_B = 'tra-vinh'

ensureBranchCatalogSeeded(BRANCH_A)
ensureBranchCatalogSeeded(BRANCH_B)

const categoryId = getCatalogAdminTree(BRANCH_A)[0]?.id
assert.ok(categoryId, 'branch A must have at least one category')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✗ ${name}`)
    console.error(`    ${error.message}`)
  }
}

// A. Add service
test('A: create service with pricing appears only in selected branch', () => {
  const treeBefore = getBranchPricingMatrix(BRANCH_B).length
  const { duration } = createServiceWithPricing({
    branchId: BRANCH_A,
    categoryId,
    name: 'Test Svc Mgmt',
    description: 'Mô tả ngắn',
    durationMinutes: 45,
    price: 150000,
    commissionPercent: 25,
  })

  const rowA = getBranchPricingMatrix(BRANCH_A).find((r) => r.durationId === duration.id)
  assert.ok(rowA, 'row exists in branch A')
  assert.equal(rowA.price, 150000)
  assert.equal(rowA.commissionPercent, 25)
  assert.equal(getBranchPricingMatrix(BRANCH_B).length, treeBefore)
})

// B. Edit price — old invoice snapshot preserved (guard via separate invoice storage)
test('B: price update logs change and updates matrix', () => {
  const row = getBranchPricingMatrix(BRANCH_A).find((r) => r.serviceName === 'Test Svc Mgmt')
  assert.ok(row)
  setBranchDurationPrice(BRANCH_A, row.durationId, { price: 175000, commissionPercent: row.commissionPercent })
  const updated = getBranchPricingMatrix(BRANCH_A).find((r) => r.durationId === row.durationId)
  assert.equal(updated.price, 175000)
  const logs = getServiceChangeLogs(BRANCH_A, row.durationId)
  assert.ok(logs.some((l) => l.newPrice === 175000))
})

// C. Commission percent validation
test('C: commission percent accepts 0–100 and rejects out of range', () => {
  assert.equal(parseCommissionPercentInput('0'), 0)
  assert.equal(parseCommissionPercentInput('100'), 100)
  assert.equal(parseCommissionPercentInput('35'), 35)
  assert.ok(Number.isNaN(parseCommissionPercentInput('-1')))
  assert.ok(Number.isNaN(parseCommissionPercentInput('101')))
})

test('C: commission update applies to pricing row', () => {
  const row = getBranchPricingMatrix(BRANCH_A).find((r) => r.serviceName === 'Test Svc Mgmt')
  setBranchDurationPrice(BRANCH_A, row.durationId, { price: row.price, commissionPercent: 40 })
  const updated = getBranchPricingMatrix(BRANCH_A).find((r) => r.durationId === row.durationId)
  assert.equal(updated.commissionPercent, 40)
})

// D. Status toggle
test('D: inactive service excluded from active picker', () => {
  const row = getBranchPricingMatrix(BRANCH_A).find((r) => r.serviceName === 'Test Svc Mgmt')
  setServiceVisibility(BRANCH_A, row.serviceId, ITEM_STATUS.INACTIVE)
  setDurationVisibility(BRANCH_A, row.durationId, ITEM_STATUS.INACTIVE)
  const active = getActiveServicesForBranchV2(BRANCH_A)
  assert.ok(!active.some((s) => s.id === row.durationId))
  setServiceVisibility(BRANCH_A, row.serviceId, ITEM_STATUS.ACTIVE)
  setDurationVisibility(BRANCH_A, row.durationId, ITEM_STATUS.ACTIVE)
})

// E. Delete without invoices
test('E: service without invoices can be deleted', () => {
  const row = getBranchPricingMatrix(BRANCH_A).find((r) => r.serviceName === 'Test Svc Mgmt')
  assert.ok(!hasServiceInvoiceReferences({ branchId: BRANCH_A, durationId: row.durationId }))
  const result = deleteDurationSafe(BRANCH_A, row.durationId, row.serviceId)
  assert.equal(result.ok, true)
  deleteServiceSafe(BRANCH_A, row.serviceId)
  assert.ok(!getBranchPricingMatrix(BRANCH_A).some((r) => r.durationId === row.durationId))
})

test('E: simulated invoice blocks hard delete', () => {
  const row = getBranchPricingMatrix(BRANCH_A)[0]
  localStorage.setItem('spa-manager-invoices', JSON.stringify([{
    id: 'inv-test-1',
    branchId: BRANCH_A,
    date: '2026-07-01',
    serviceIds: [row.durationId],
    services: [{ id: row.durationId, price: row.price }],
    serviceTotal: row.price,
  }]))

  const result = deleteDurationSafe(BRANCH_A, row.durationId, row.serviceId)
  assert.equal(result.ok, false)
  assert.match(result.error, /hóa đơn/i)
  localStorage.removeItem('spa-manager-invoices')
})

// F. Search and filter
test('F: filter by name, group, duration', () => {
  const rows = buildServiceManagementRows(BRANCH_A)
  const first = rows[0]
  assert.ok(filterServiceRows(rows, { search: first.serviceName.slice(0, 4) }).length >= 1)
  assert.ok(filterServiceRows(rows, { search: first.categoryName.slice(0, 3) }).length >= 1)
  if (first.durationMinutes) {
    assert.ok(filterServiceRows(rows, { search: String(first.durationMinutes) }).length >= 1)
  }
  assert.ok(filterServiceRows(rows, { statusFilter: 'active' }).every((r) => r.isActive))
})

test('F: parsePriceInput strips non-digits', () => {
  assert.equal(parsePriceInput('189.000'), 189000)
  assert.ok(Number.isNaN(parsePriceInput('abc')))
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
