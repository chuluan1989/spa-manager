/**
 * Kiểm tra end-to-end import dữ liệu cũ từ LocalStorage lên Supabase.
 * Chạy: npx vite-node scripts/verify-legacy-import.mjs
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
    get length() {
      return store.size
    },
    key: (index) => [...store.keys()][index] ?? null,
  }
}

const storeA = createStorage()
const storeB = createStorage()
globalThis.sessionStorage = createStorage()
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

function useDevice(store) {
  globalThis.localStorage = store
}

function setSession(user) {
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify(user))
}

let passed = 0
let failed = 0

async function step(name, fn) {
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

const { isSupabaseConfigured, supabase } = await import('../src/lib/supabaseClient.js')
const { normalizeSupabaseUrl, normalizeSupabaseAnonKey } = await import('../src/lib/supabaseClient.js')

function trimEnv(value) {
  return String(value ?? '').trim().replace(/^['"]|['"]$/g, '')
}

if (!isSupabaseConfigured) {
  const rawUrl = import.meta.env?.VITE_SUPABASE_URL ?? ''
  const rawKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? ''
  const url = normalizeSupabaseUrl(rawUrl)
  const key = normalizeSupabaseAnonKey(rawKey)
  if (!trimEnv(rawUrl) || !trimEnv(rawKey) || !url || !key) {
    console.error('\n✗ Thiếu hoặc sai VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY\n')
    process.exit(1)
  }
}

const { checkLegacyData, importLegacyDataToCloud } = await import('../src/utils/legacyCloudSync.js')
const { scanLocalStorageForLegacyData, LEGACY_IMPORT_COMPLETED_KEY } = await import(
  '../src/utils/legacyStorageScanner.js',
)
const { pullAllFromSupabase } = await import('../src/utils/supabaseSync.js')
const { loadInvoices } = await import('../src/utils/invoiceStorage.js')
const { loadEmployees } = await import('../src/utils/employeeStorage.js')
const { deleteEmployeeRow } = await import('../src/repositories/employeesRepository.js')
const { deleteInvoiceRow } = await import('../src/repositories/invoicesRepository.js')

const ADMIN = { role: 'admin', branch: 'all' }
const TEST_EMP_ID = `legacy-import-emp-${Date.now()}`
const TEST_INV_ID = `legacy-import-inv-${Date.now()}`

console.log('\nSpa Manager — verify import dữ liệu cũ\n')

await step('1. Tạo dữ liệu giả trong LocalStorage (key cũ + key chuẩn)', async () => {
  useDevice(storeA)
  setSession(ADMIN)
  storeA.clear()

  storeA.setItem(
    'old-spa-tours',
    JSON.stringify([
      {
        date: '2026-06-01',
        branch_id: 'vinh-long',
        branch_name: 'Vĩnh Long',
        employee_id: TEST_EMP_ID,
        employee_name: 'NV Import Test',
        customer_name: 'Khách cũ',
        services: [{ id: 'svc-body', name: 'Body 60', price: 180000, commissionPercent: 20, commissionAmount: 36000 }],
        tip: 20000,
        total: 200000,
        service_total: 180000,
        commission: 56000,
      },
    ]),
  )

  storeA.setItem(
    'spa-manager-employees',
    JSON.stringify([
      {
        id: TEST_EMP_ID,
        name: 'NV Import Test',
        branchId: 'vinh-long',
        phone: '0903333444',
        status: 'active',
      },
    ]),
  )

  storeA.setItem(
    'spa-manager-invoices',
    JSON.stringify([
      {
        id: TEST_INV_ID,
        date: '2026-06-02',
        branchId: 'vinh-long',
        branchName: 'Vĩnh Long',
        employeeId: TEST_EMP_ID,
        employeeName: 'NV Import Test',
        serviceIds: ['svc-body'],
        services: [{ id: 'svc-body', name: 'Body 60', price: 180000, commissionPercent: 20, commissionAmount: 36000 }],
        tips: 0,
        total: 180000,
        serviceTotal: 180000,
        commission: 36000,
        createdAt: new Date().toISOString(),
      },
    ]),
  )

  const scan = scanLocalStorageForLegacyData({ storage: storeA })
  assert.ok(scan.totalRecords >= 2, 'Phải quét được ít nhất 2 bản ghi (tour + invoice/employee)')
  assert.ok(scan.keyReports.some((row) => row.key === 'old-spa-tours'), 'Phải nhận diện key tour cũ')
})

await step('2. Kiểm tra dữ liệu cũ (chưa import)', async () => {
  useDevice(storeA)
  setSession(ADMIN)
  const check = checkLegacyData(ADMIN)
  assert.equal(check.hasLegacyData, true)
  assert.ok(check.scopedCounts.invoices >= 1)
  assert.ok(check.scopedCounts.employees >= 1)
})

await step('3. Import lên Supabase', async () => {
  useDevice(storeA)
  setSession(ADMIN)
  const result = await importLegacyDataToCloud(ADMIN)
  assert.equal(result.success, true, JSON.stringify(result.errors))
  assert.ok(result.importedTotal >= 1, 'Phải import ít nhất 1 bản ghi mới')
  assert.equal(storeA.getItem(LEGACY_IMPORT_COMPLETED_KEY), 'true', 'Phải đánh dấu legacy_import_completed')
  assert.ok(storeA.getItem('spa-manager-invoices'), 'LocalStorage không được xóa')
})

await step('4. Admin thiết bị B thấy dữ liệu sau pull', async () => {
  useDevice(storeB)
  setSession(ADMIN)
  storeB.clear()
  await pullAllFromSupabase()

  const employees = loadEmployees()
  assert.ok(employees.some((e) => e.id === TEST_EMP_ID), 'Admin B phải thấy nhân viên import')

  const invoices = loadInvoices()
  assert.ok(
    invoices.some((inv) => inv.id === TEST_INV_ID || inv.employeeId === TEST_EMP_ID),
    'Admin B phải thấy hóa đơn/tour import',
  )
})

await step('5. Import lần 2 không tạo trùng', async () => {
  useDevice(storeA)
  setSession(ADMIN)
  const result = await importLegacyDataToCloud(ADMIN)
  assert.equal(result.success, true)
  assert.ok(result.skippedTotal >= 1, 'Lần 2 phải bỏ qua bản ghi đã có trên Cloud')
  assert.equal(result.importedTotal, 0, 'Lần 2 không import thêm bản ghi trùng')
})

await step('6. Dọn dẹp dữ liệu test', async () => {
  await deleteEmployeeRow(TEST_EMP_ID)
  await deleteInvoiceRow(TEST_INV_ID)
  const { data: tours } = await supabase.from('invoices').select('id').like('id', 'legacy-inv-%')
  for (const row of tours ?? []) {
    await deleteInvoiceRow(row.id)
  }
})

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
