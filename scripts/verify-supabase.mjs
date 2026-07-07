/**
 * Kiểm tra thực tế tích hợp Supabase — CHỈ chạy khi đã có VITE_SUPABASE_URL
 * + VITE_SUPABASE_ANON_KEY (trong .env.local hoặc biến môi trường shell).
 *
 * Chạy: npx vite-node scripts/verify-supabase.mjs
 *
 * Script sẽ:
 *  1. Xác nhận kết nối Supabase + liệt kê số dòng từng bảng.
 *  2. Giả lập 2 "thiết bị" (2 bộ LocalStorage độc lập trong cùng tiến
 *     trình) để kiểm tra tạo/sửa nhân viên + tạo hóa đơn ở thiết bị A và
 *     xác nhận thiết bị B thấy được sau khi đồng bộ.
 *  3. Kiểm tra Realtime: đăng ký lắng nghe thay đổi bảng employees, sau đó
 *     ghi 1 dòng và xác nhận nhận được sự kiện trong vài giây.
 *  4. Dọn sạch toàn bộ dữ liệu test (KHÔNG để lại rác trong database thật).
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

function explainEnvProblem() {
  const rawUrl = import.meta.env?.VITE_SUPABASE_URL ?? ''
  const rawKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? ''
  const url = normalizeSupabaseUrl(rawUrl)
  const key = normalizeSupabaseAnonKey(rawKey)

  if (!trimEnv(rawUrl) || !trimEnv(rawKey)) {
    return 'Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env.local'
  }
  if (!url || !key) {
    const keyText = trimEnv(rawKey)
    if (keyText.includes('...') || (keyText && keyText.length < 40)) {
      return [
        'VITE_SUPABASE_ANON_KEY bị cắt ngắn hoặc chứa "..." — cần dán TOÀN BỘ key từ Supabase Dashboard.',
        'Key hợp lệ thường dài hơn 100 ký tự (sb_publishable_... hoặc eyJ...).',
        'Không ghi "..." — copy nguyên văn rồi lưu .env.local và redeploy Vercel.',
      ].join('\n')
    }
    return [
      'Giá trị trong .env.local chưa hợp lệ (có thể vẫn là text mô tả/placeholder).',
      'Hãy mở Supabase Dashboard → Project Settings → API, copy NGUYÊN VĂN:',
      '  • Project URL  → dạng https://xxxxx.supabase.co',
      '  • anon public key (sb_publishable_... hoặc eyJ...)',
      'Dán vào .env.local, lưu file, rồi chạy lại lệnh kiểm tra.',
    ].join('\n')
  }
  return 'Không khởi tạo được Supabase client — kiểm tra lại URL/key.'
}

if (!isSupabaseConfigured) {
  console.error(`\n✗ ${explainEnvProblem()}\n`)
  process.exit(1)
}

console.log('\nSpa Manager — kiểm tra thực tế tích hợp Supabase\n')

const TABLES = [
  'branches',
  'employees',
  'services',
  'branch_pricing',
  'invoices',
  'expenses',
  'app_credentials',
  'app_permissions',
  'app_settings',
]

console.log('1. Kết nối + số dòng từng bảng:')
let allTablesOk = true
for (const table of TABLES) {
  try {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (error) throw error
    console.log(`  ✓ ${table}: ${count ?? 0} dòng`)
  } catch (error) {
    allTablesOk = false
    console.error(`  ✗ ${table}: ${error.message}`)
  }
}
if (!allTablesOk) {
  console.error('\n✗ Một số bảng chưa tồn tại hoặc không truy cập được — kiểm tra lại migration SQL.\n')
  process.exit(1)
}

useDevice(storeA)
const { loadBranches } = await import('../src/utils/branchStorage.js')
const { ROLES, ADMIN_BRANCH } = await import('../src/constants/auth.js')
const {
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  loadEmployees,
} = await import('../src/utils/employeeStorage.js')
const { saveInvoice, deleteInvoice, loadInvoices } = await import('../src/utils/invoiceStorage.js')
const { addExpense, updateExpense, deleteExpense, loadExpenses } = await import('../src/utils/expenseStorage.js')
const { addService, updateService, softDeleteService, loadServices } = await import('../src/utils/serviceStorage.js')
const { pullAllFromSupabase } = await import('../src/utils/supabaseSync.js')

const branches = loadBranches()
const testBranch = branches[0]
assert.ok(testBranch, 'Cần ít nhất 1 chi nhánh để test')

const TEST_TAG = `__SUPA_VERIFY_${Date.now()}__`
let testEmployeeId = null
let testInvoiceId = null
let testExpenseId = null
let testServiceId = null

await step('2. Tạo nhân viên mới trên "thiết bị A" (LocalStorage A)', async () => {
  useDevice(storeA)
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  const result = addEmployee({
    name: TEST_TAG,
    phone: '0900000001',
    cccd: '000000000001',
    branchId: testBranch.id,
    position: 'Test',
  })
  assert.equal(result.success, true, result.error)
  testEmployeeId = result.employee.id
})

await wait(1500)

await step('3. Xác nhận bản ghi nhân viên xuất hiện trực tiếp trong Supabase', async () => {
  const { data, error } = await supabase.from('employees').select('*').eq('id', testEmployeeId).single()
  if (error) throw error
  assert.equal(data.name, TEST_TAG)
  assert.equal(data.branch_id, testBranch.id)
})

await step('4. "Thiết bị B" (LocalStorage rỗng, chưa từng thấy nhân viên này) pull về và thấy ngay', async () => {
  useDevice(storeB)
  const result = await pullAllFromSupabase()
  assert.equal(result.success, true, JSON.stringify(result.errors))
  const employees = loadEmployees()
  const found = employees.find((e) => e.id === testEmployeeId)
  assert.ok(found, 'Thiết bị B phải thấy nhân viên vừa tạo ở thiết bị A sau khi đồng bộ')
})

await step('5. Sửa hồ sơ nhân viên trên thiết bị A, xác nhận Supabase cập nhật', async () => {
  useDevice(storeA)
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  const result = updateEmployee(testEmployeeId, { position: 'Test đã sửa' })
  assert.equal(result.success, true, result.error)
  await wait(1500)
  const { data, error } = await supabase.from('employees').select('position').eq('id', testEmployeeId).single()
  if (error) throw error
  assert.equal(data.position, 'Test đã sửa')
})

await step('6. Thiết bị B pull lại, thấy bản sửa mới nhất', async () => {
  useDevice(storeB)
  await pullAllFromSupabase()
  const updated = getEmployeeById(testEmployeeId)
  assert.equal(updated?.position, 'Test đã sửa')
})

await step('7. Nhập hóa đơn/tour trên thiết bị A, xác nhận lưu vào Supabase', async () => {
  useDevice(storeA)
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  testInvoiceId = `verify-inv-${Date.now()}`
  const result = saveInvoice({
    id: testInvoiceId,
    date: new Date().toISOString().slice(0, 10),
    branchId: testBranch.id,
    branchName: testBranch.name,
    employeeId: testEmployeeId,
    employeeName: TEST_TAG,
    customerName: 'Khách test',
    serviceIds: [],
    services: [],
    tips: 10000,
    total: 10000,
    serviceTotal: 0,
    commission: 0,
    paymentMethod: 'cash',
    note: TEST_TAG,
  })
  assert.equal(result.success, true, result.error)
  await wait(1500)
  const { data, error } = await supabase.from('invoices').select('*').eq('id', testInvoiceId).single()
  if (error) throw error
  assert.equal(data.note, TEST_TAG)
})

await step('8. Thiết bị B pull lại, thấy hóa đơn mới', async () => {
  useDevice(storeB)
  await pullAllFromSupabase()
  const invoices = loadInvoices()
  assert.ok(invoices.some((inv) => inv.id === testInvoiceId), 'Thiết bị B phải thấy hóa đơn vừa tạo')
})

await step('8b. Expenses CRUD: tạo chi phí → Supabase → thiết bị B thấy', async () => {
  useDevice(storeA)
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  const result = addExpense({
    date: new Date().toISOString().slice(0, 10),
    branchId: testBranch.id,
    expenseType: 'other',
    content: TEST_TAG,
    amount: 50000,
    enteredBy: 'Verify Script',
    note: TEST_TAG,
  })
  assert.equal(result.success, true, result.error)
  testExpenseId = result.expense.id
  await wait(1500)
  const { data, error } = await supabase.from('expenses').select('*').eq('id', testExpenseId).single()
  if (error) throw error
  assert.equal(data.content, TEST_TAG)

  updateExpense(testExpenseId, { content: `${TEST_TAG}-updated` })
  await wait(1500)
  const { data: updated, error: updErr } = await supabase
    .from('expenses')
    .select('content')
    .eq('id', testExpenseId)
    .single()
  if (updErr) throw updErr
  assert.equal(updated.content, `${TEST_TAG}-updated`)

  useDevice(storeB)
  await pullAllFromSupabase()
  assert.ok(
    loadExpenses().some((exp) => exp.id === testExpenseId),
    'Thiết bị B phải thấy chi phí test',
  )
})

await step('8c. Services CRUD: thêm dịch vụ → Supabase → thiết bị B thấy', async () => {
  useDevice(storeA)
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  testServiceId = `verify-svc-${Date.now()}`
  addService({
    id: testServiceId,
    name: TEST_TAG,
    price: 100000,
    commissionPercent: 10,
  })
  await wait(1500)
  const { data, error } = await supabase.from('services').select('*').eq('id', testServiceId).single()
  if (error) throw error
  assert.equal(data.name, TEST_TAG)

  updateService(testServiceId, { name: `${TEST_TAG}-updated` })
  await wait(1500)
  const { data: updated, error: updErr } = await supabase
    .from('services')
    .select('name')
    .eq('id', testServiceId)
    .single()
  if (updErr) throw updErr
  assert.equal(updated.name, `${TEST_TAG}-updated`)

  useDevice(storeB)
  await pullAllFromSupabase()
  assert.ok(
    loadServices().some((svc) => svc.id === testServiceId),
    'Thiết bị B phải thấy dịch vụ test',
  )
})

await step('9. Realtime: sửa nhân viên và nhận được sự kiện postgres_changes', async () => {
  const eventPromise = new Promise((resolve, reject) => {
    const channel = supabase
      .channel(`verify-realtime-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'employees', filter: `id=eq.${testEmployeeId}` },
        (payload) => {
          supabase.removeChannel(channel)
          resolve(payload)
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`Realtime channel lỗi: ${status} — có thể chưa chạy migration 0002_enable_realtime.sql`))
        }
      })
  })

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Không nhận được sự kiện Realtime sau 8s')), 8000),
  )

  useDevice(storeA)
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  await wait(500)
  updateEmployee(testEmployeeId, { note: 'trigger-realtime' })

  await Promise.race([eventPromise, timeout])
})

await step('10. Dọn dẹp dữ liệu test khỏi Supabase', async () => {
  useDevice(storeA)
  setSession({ role: ROLES.ADMIN, branch: ADMIN_BRANCH })
  deleteInvoice(testInvoiceId)
  if (testExpenseId) deleteExpense(testExpenseId)
  if (testServiceId) softDeleteService(testServiceId)
  deleteEmployee(testEmployeeId)
  await wait(1500)

  const { data: emp } = await supabase.from('employees').select('id').eq('id', testEmployeeId).maybeSingle()
  const { data: inv } = await supabase.from('invoices').select('id').eq('id', testInvoiceId).maybeSingle()
  const { data: exp } = testExpenseId
    ? await supabase.from('expenses').select('id').eq('id', testExpenseId).maybeSingle()
    : { data: null }
  assert.equal(emp, null, 'Nhân viên test phải được xoá khỏi Supabase')
  assert.equal(inv, null, 'Hóa đơn test phải được xoá khỏi Supabase')
  assert.equal(exp, null, 'Chi phí test phải được xoá khỏi Supabase')
})

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
