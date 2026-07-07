/**
 * Kiểm tra luồng "Đồng bộ dữ liệu cũ lên Cloud":
 *  - Thiết bị A có dữ liệu LocalStorage cũ chưa có trên Supabase
 *  - Bấm sync (syncLegacyDataToCloud) → dữ liệu xuất hiện trên Supabase
 *  - Thiết bị B (Admin) pull về và thấy dữ liệu đó
 *
 * Chạy: npx vite-node scripts/verify-legacy-sync.mjs
 * Hoặc: node scripts/verify-from-production.mjs (nếu dùng env Production)
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
    console.error('\n✗ Thiếu hoặc sai VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong .env.local\n')
    process.exit(1)
  }
}

const {
  detectPendingLegacyData,
  syncLegacyDataToCloud,
  scopeLegacySnapshot,
  countPendingLegacyItems,
} = await import('../src/utils/legacyCloudSync.js')
const { pullAllFromSupabase } = await import('../src/utils/supabaseSync.js')
const { loadEmployees, saveEmployees } = await import('../src/utils/employeeStorage.js')
const { loadInvoices, replaceAllInvoices } = await import('../src/utils/invoiceStorage.js')
const { deleteEmployeeRow } = await import('../src/repositories/employeesRepository.js')
const { deleteInvoiceRow } = await import('../src/repositories/invoicesRepository.js')

const TEST_EMPLOYEE_ID = `legacy-sync-emp-${Date.now()}`
const TEST_INVOICE_ID = `legacy-sync-inv-${Date.now()}`
const ADMIN_USER = { role: 'admin', branch: 'all' }

console.log('\nSpa Manager — kiểm tra đồng bộ dữ liệu cũ lên Cloud\n')

await step('1. Phát hiện dữ liệu local chưa có trên Supabase', async () => {
  useDevice(storeA)
  setSession(ADMIN_USER)

  const employees = loadEmployees()
  employees.push({
    id: TEST_EMPLOYEE_ID,
    name: 'NV Legacy Sync Test',
    branchId: 'vinh-long',
    status: 'active',
    phone: '0900000001',
  })
  saveEmployees(employees)

  const invoices = loadInvoices()
  invoices.push({
    id: TEST_INVOICE_ID,
    branchId: 'vinh-long',
    branchName: 'Vĩnh Long',
    employeeId: TEST_EMPLOYEE_ID,
    employeeName: 'NV Legacy Sync Test',
    date: '2026-07-07',
    services: [{ serviceId: 'test-svc', serviceName: 'Body 60', price: 200000, quantity: 1 }],
    tip: 0,
    total: 200000,
    createdAt: new Date().toISOString(),
  })
  replaceAllInvoices(invoices)

  const pending = await detectPendingLegacyData(ADMIN_USER)
  assert.equal(pending.hasPending, true, 'Phải phát hiện dữ liệu chưa sync')
  assert.ok(pending.totals.employees >= 1, 'Phải có ít nhất 1 nhân viên pending')
  assert.ok(pending.totals.invoices >= 1, 'Phải có ít nhất 1 hóa đơn pending')
})

await step('2. Đồng bộ dữ liệu cũ lên Supabase (upsert, không trùng)', async () => {
  useDevice(storeA)
  setSession(ADMIN_USER)

  const result = await syncLegacyDataToCloud(ADMIN_USER)
  assert.equal(result.success, true, `Sync phải thành công: ${JSON.stringify(result.errors)}`)
  assert.ok(result.synced.employees >= 1, 'Phải sync ít nhất 1 nhân viên')
  assert.ok(result.synced.invoices >= 1, 'Phải sync ít nhất 1 hóa đơn')

  const { data: remoteEmp } = await supabase
    .from('employees')
    .select('id, name')
    .eq('id', TEST_EMPLOYEE_ID)
    .maybeSingle()
  assert.equal(remoteEmp?.id, TEST_EMPLOYEE_ID, 'Nhân viên test phải có trên Supabase')

  const { data: remoteInv } = await supabase
    .from('invoices')
    .select('id')
    .eq('id', TEST_INVOICE_ID)
    .maybeSingle()
  assert.equal(remoteInv?.id, TEST_INVOICE_ID, 'Hóa đơn test phải có trên Supabase')
})

await step('3. Admin thiết bị B pull về và thấy dữ liệu cũ', async () => {
  useDevice(storeB)
  setSession(ADMIN_USER)
  localStorage.removeItem('spa-manager-employees')
  localStorage.removeItem('spa-manager-invoices')

  await pullAllFromSupabase()

  const employees = loadEmployees()
  assert.ok(
    employees.some((item) => item.id === TEST_EMPLOYEE_ID),
    'Thiết bị B phải thấy nhân viên sau pull',
  )

  const invoices = loadInvoices()
  assert.ok(
    invoices.some((item) => item.id === TEST_INVOICE_ID),
    'Thiết bị B phải thấy hóa đơn sau pull',
  )
})

await step('4. Chạy lại sync không tạo trùng (skipped / 0 pending)', async () => {
  useDevice(storeA)
  setSession(ADMIN_USER)

  const pending = await detectPendingLegacyData(ADMIN_USER)
  assert.equal(pending.hasPending, false, 'Không còn dữ liệu pending sau sync')

  const result = await syncLegacyDataToCloud(ADMIN_USER)
  assert.equal(result.success, true)
  assert.equal(result.skipped, true, 'Lần sync thứ hai phải bỏ qua vì không còn pending')
})

await step('5. Dọn dẹp dữ liệu test', async () => {
  await deleteEmployeeRow(TEST_EMPLOYEE_ID)
  await deleteInvoiceRow(TEST_INVOICE_ID)
})

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
