/**
 * Verify Admin Service Management center logic.
 * Run: npx vite-node scripts/verify-service-management-center.mjs
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
  ensureBranchCatalogSeeded,
  getActiveServicesForBranchV2,
  getBranchPricingMatrix,
  getCatalogAdminTree,
  ITEM_STATUS,
  loadBranchCatalog,
  setBranchDurationPrice,
  setDurationVisibility,
  setServiceVisibility,
} = await import('../src/utils/serviceCatalogV2Storage.js')

const { verifyNoInvoiceReferencesRemote } = await import('../src/repositories/serviceInvoiceGuardRepository.js')
const {
  buildServiceManagementRows,
  filterServiceRows,
  parseCommissionPercentInput,
  parsePriceInput,
} = await import('../src/utils/serviceManagementHelpers.js')

const { computeServiceReport, filterInvoices } = await import('../src/utils/report.js')
const { lookupServiceStats: lookupFromRepo } = await import('../src/repositories/serviceInvoiceStatsRepository.js')

const BRANCH_A = 'soc-trang'
const BRANCH_B = 'tra-vinh'
const TRAM_SPA = 'tram-spa'

ensureBranchCatalogSeeded(BRANCH_A)
ensureBranchCatalogSeeded(BRANCH_B)
ensureBranchCatalogSeeded(TRAM_SPA)

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

async function testAsync(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✗ ${name}`)
    console.error(`    ${error.message}`)
  }
}

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

test('B: price update updates matrix', () => {
  const row = getBranchPricingMatrix(BRANCH_A).find((r) => r.serviceName === 'Test Svc Mgmt')
  assert.ok(row)
  setBranchDurationPrice(BRANCH_A, row.durationId, { price: 175000, commissionPercent: row.commissionPercent }, { log: false })
  const updated = getBranchPricingMatrix(BRANCH_A).find((r) => r.durationId === row.durationId)
  assert.equal(updated.price, 175000)
})

test('C: commission percent accepts 0–100 and rejects out of range', () => {
  assert.equal(parseCommissionPercentInput('0'), 0)
  assert.equal(parseCommissionPercentInput('100'), 100)
  assert.equal(parseCommissionPercentInput('35'), 35)
  assert.ok(Number.isNaN(parseCommissionPercentInput('-1')))
  assert.ok(Number.isNaN(parseCommissionPercentInput('101')))
})

test('D: inactive service excluded from active picker', () => {
  const row = getBranchPricingMatrix(BRANCH_A).find((r) => r.serviceName === 'Test Svc Mgmt')
  assert.ok(row)
  setServiceVisibility(BRANCH_A, row.serviceId, ITEM_STATUS.INACTIVE)
  setDurationVisibility(BRANCH_A, row.durationId, ITEM_STATUS.INACTIVE)
  const active = getActiveServicesForBranchV2(BRANCH_A)
  assert.ok(!active.some((s) => s.id === row.durationId))
  setServiceVisibility(BRANCH_A, row.serviceId, ITEM_STATUS.ACTIVE)
  setDurationVisibility(BRANCH_A, row.durationId, ITEM_STATUS.ACTIVE)
})

test('Seed: tram-spa keeps admin-added service after reload', () => {
  const tramCategoryId = getCatalogAdminTree(TRAM_SPA)[0]?.id
  assert.ok(tramCategoryId)
  const before = getBranchPricingMatrix(TRAM_SPA).length
  const { duration } = createServiceWithPricing({
    branchId: TRAM_SPA,
    categoryId: tramCategoryId,
    name: 'Tram Spa Persist Test',
    durationMinutes: 30,
    price: 99000,
    commissionPercent: 20,
  })
  ensureBranchCatalogSeeded(TRAM_SPA)
  loadBranchCatalog(TRAM_SPA)
  const after = getBranchPricingMatrix(TRAM_SPA)
  assert.ok(after.some((r) => r.durationId === duration.id), 'service survives reload')
  assert.equal(after.length, before + 1)
})

test('Seed: tram-spa keeps edited price after reload', () => {
  const row = getBranchPricingMatrix(TRAM_SPA).find((r) => r.serviceName === 'Tram Spa Persist Test')
  assert.ok(row)
  setBranchDurationPrice(TRAM_SPA, row.durationId, { price: 120000, commissionPercent: 25 }, { log: false })
  ensureBranchCatalogSeeded(TRAM_SPA)
  const updated = getBranchPricingMatrix(TRAM_SPA).find((r) => r.durationId === row.durationId)
  assert.equal(updated.price, 120000)
  assert.equal(updated.commissionPercent, 25)
})

test('Stats: computeServiceReport matches report revenue principle', () => {
  const invoices = [
    {
      id: 'inv-1',
      date: '2026-07-10',
      branchId: BRANCH_A,
      services: [{ id: 'dur-test', name: 'Test', price: 150000 }],
      serviceIds: ['dur-test'],
      serviceTotal: 150000,
    },
    {
      id: 'inv-2',
      date: '2026-07-11',
      branchId: BRANCH_A,
      services: [{ id: 'dur-test', name: 'Test', price: 175000 }],
      serviceIds: ['dur-test'],
      serviceTotal: 175000,
    },
  ]
  const filtered = filterInvoices(invoices, {
    branchId: BRANCH_A,
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
  })
  const report = computeServiceReport(filtered)
  const entry = report.find((r) => r.serviceId === 'dur-test')
  assert.equal(entry.count, 2)
  assert.equal(entry.revenue, 325000)

  const statsMap = { byServiceId: new Map(report.map((r) => [String(r.serviceId), { soldCount: r.count, revenue: r.revenue }])) }
  const lookup = lookupFromRepo(statsMap, { durationId: 'dur-test' })
  assert.equal(lookup.soldCount, 2)
  assert.equal(lookup.revenue, 325000)
})

test('F: filter by name, group, duration', () => {
  const rows = buildServiceManagementRows(BRANCH_A)
  const first = rows[0]
  assert.ok(filterServiceRows(rows, { search: first.serviceName.slice(0, 4) }).length >= 1)
  assert.ok(filterServiceRows(rows, { search: first.categoryName.slice(0, 3) }).length >= 1)
  if (first.durationMinutes) {
    assert.ok(filterServiceRows(rows, { search: String(first.durationMinutes) }).length >= 1)
  }
})

await testAsync('Guard: fail closed when Supabase not configured', async () => {
  const result = await verifyNoInvoiceReferencesRemote({
    branchId: BRANCH_A,
    durationId: 'any-id',
  })
  assert.equal(result.ok, false)
  assert.match(result.error, /xác minh/i)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
