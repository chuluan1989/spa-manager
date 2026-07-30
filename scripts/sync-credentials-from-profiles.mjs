/**
 * Đồng bộ app_credentials từ hồ sơ nhân viên + MK quản lý chuẩn.
 * - NV: hash(tên hiện tại + tên chi nhánh passwordName)
 * - QL: hash(managerPassword canonical)
 * - Giữ admin hiện tại
 *
 * Run: npx vite-node scripts/sync-credentials-from-profiles.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadProductionSupabaseEnv, isPlaceholderSupabaseKey } from './lib/loadProductionSupabaseEnv.mjs'
import {
  createSupabaseWriteClient,
  fetchCredentialsPayload,
  upsertCredentialsPayload,
} from './lib/supabaseCredentialsWrite.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence')
const CSV_PATH = path.join(OUT_DIR, 'CREDENTIALS_FROM_PROFILES.csv')
const REPORT_PATH = path.join(OUT_DIR, 'CREDENTIALS_FROM_PROFILES_REPORT.json')

mkdirSync(OUT_DIR, { recursive: true })

async function bootstrapEnv() {
  let url = process.env.VITE_SUPABASE_URL
  let key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || isPlaceholderSupabaseKey(key)) {
    return loadProductionSupabaseEnv()
  }
  return { url, key }
}

const supabaseEnv = await bootstrapEnv()
if (!import.meta.env) Object.defineProperty(import.meta, 'env', { value: {} })
import.meta.env.VITE_SUPABASE_URL = supabaseEnv.url
import.meta.env.VITE_SUPABASE_ANON_KEY = supabaseEnv.key

await import('./_polyfill-storage.mjs')
await import('../src/constants/branches.js')

const { rowToCamel } = await import('../src/repositories/caseUtils.js')
const {
  DEPRECATED_BRANCH_IDS,
  CANONICAL_BRANCHES,
  CANONICAL_BRANCH_BY_ID,
  resolveCanonicalBranchId,
  getPasswordBranchName,
} = await import('../src/constants/canonicalBranches.js')
const { normalizeEmployee, isEmployeeLoginEligible } = await import('../src/utils/employeeStorage.js')
const { hashPassword, verifyPassword } = await import('../src/utils/passwordHash.js')
const {
  computeEmployeeProfileDefaultPassword,
  getBranchManagerCanonicalPassword,
} = await import('../src/utils/credentialsStorage.js')

const { client, mode: writeMode } = createSupabaseWriteClient({
  url: supabaseEnv.url,
  anonKey: supabaseEnv.key,
})

function escapeCsv(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function normalizeForPassword(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

console.log('\n=== Sync credentials từ hồ sơ hiện tại ===\n')
console.log(`  writeMode: ${writeMode}`)

const before = await fetchCredentialsPayload(client)
const currentAdmin = before?.payload?.admin
if (!currentAdmin) {
  console.error('FAIL — không đọc được admin hash từ Supabase')
  process.exit(1)
}

const { data: branchRows, error: branchError } = await client
  .from('branches')
  .select('id,name,status')
if (branchError) throw new Error(branchError.message)

const { data: empRows, error: empError } = await client
  .from('employees')
  .select('id,name,branch_id,status,position,updated_at,branch_history')
if (empError) throw new Error(empError.message)

const employees = (empRows ?? []).map((row) => normalizeEmployee(rowToCamel(row)))
const eligible = employees.filter(isEmployeeLoginEligible)

localStorage.setItem('spa-manager-branches', JSON.stringify(branchRows ?? []))
localStorage.setItem('spa-manager-employees', JSON.stringify(employees))

console.log(`  Chi nhánh DB: ${(branchRows ?? []).length}`)
console.log(`  NV đủ điều kiện: ${eligible.length}`)

const resetAt = new Date().toISOString()
const branches = {}
const branchPasswordMeta = {}
const managerRows = []

for (const branch of (branchRows ?? [])) {
  const plain = getBranchManagerCanonicalPassword(branch.id)
  branches[branch.id] = await hashPassword(plain)
  branchPasswordMeta[branch.id] = {
    passwordUpdatedAt: resetAt,
    customPassword: false,
  }
  const canonical = CANONICAL_BRANCH_BY_ID[resolveCanonicalBranchId(branch.id)]
  managerRows.push({
    role: 'Quản lý chi nhánh',
    name: branch.name || canonical?.name || branch.id,
    branchName: branch.name || '',
    branchId: branch.id,
    defaultPassword: plain,
  })
}

// Đảm bảo đủ 8 chi nhánh canonical
for (const branch of CANONICAL_BRANCHES) {
  if (branches[branch.id]) continue
  const plain = branch.managerPassword
  branches[branch.id] = await hashPassword(plain)
  branchPasswordMeta[branch.id] = {
    passwordUpdatedAt: resetAt,
    customPassword: false,
  }
  managerRows.push({
    role: 'Quản lý chi nhánh',
    name: branch.name,
    branchName: branch.name,
    branchId: branch.id,
    defaultPassword: plain,
  })
}

const employeesCred = {}
const employeeRows = []

for (const employee of eligible) {
  const plain = computeEmployeeProfileDefaultPassword(employee.name, employee.branchId)
  const expectedAlt = normalizeForPassword(employee.name)
    + normalizeForPassword(getPasswordBranchName(employee.branchId))
  if (plain !== expectedAlt) {
    console.warn(`  ! password helper mismatch ${employee.id}: ${plain} vs ${expectedAlt}`)
  }
  employeesCred[employee.id] = {
    branchId: employee.branchId ?? '',
    name: employee.name ?? '',
    loginUsername: '',
    password: await hashPassword(plain.toLowerCase()),
    passwordUpdatedAt: resetAt,
    customPassword: false,
  }
  const branchName = CANONICAL_BRANCH_BY_ID[resolveCanonicalBranchId(employee.branchId)]?.name
    || (branchRows ?? []).find((b) => b.id === employee.branchId)?.name
    || employee.branchId
  employeeRows.push({
    role: 'Nhân viên',
    name: employee.name,
    branchName,
    branchId: employee.branchId,
    employeeId: employee.id,
    defaultPassword: plain,
  })
}

const payload = {
  admin: currentAdmin,
  branches,
  branchPasswordMeta,
  employees: employeesCred,
}

console.log('\n--- Ghi app_credentials ---')
const writeResult = await upsertCredentialsPayload(client, payload)
console.log(`  ✓ updated_at=${writeResult.updated_at}`)

console.log('\n--- Đọc lại + verify ---')
const after = await fetchCredentialsPayload(client)
const remote = after?.payload
if (!remote) {
  console.error('FAIL — read-back null')
  process.exit(1)
}

const mismatches = []
if (remote.admin !== currentAdmin) mismatches.push('admin hash changed')

for (const [branchId, hash] of Object.entries(branches)) {
  if (remote.branches?.[branchId] !== hash) mismatches.push(`branch hash ${branchId}`)
  const plain = getBranchManagerCanonicalPassword(branchId)
  if (!(await verifyPassword(plain, remote.branches?.[branchId]))) {
    mismatches.push(`branch verify ${branchId}`)
  }
}

for (const row of employeeRows) {
  const remoteEntry = remote.employees?.[row.employeeId]
  if (!remoteEntry) {
    mismatches.push(`missing employee ${row.employeeId}`)
    continue
  }
  if (remoteEntry.name !== row.name) mismatches.push(`name stale ${row.employeeId}`)
  if (remoteEntry.customPassword !== false) mismatches.push(`customPassword ${row.employeeId}`)
  if (!(await verifyPassword(row.defaultPassword, remoteEntry.password))) {
    mismatches.push(`employee verify ${row.employeeId} (${row.name})`)
  }
}

const csvLines = [
  ['Vai trò', 'Tên hiện tại', 'Chi nhánh', 'branch_id', 'Mật khẩu mặc định'].join(','),
  ...managerRows
    .filter((r) => !DEPRECATED_BRANCH_IDS.includes(r.branchId))
    .map((r) => [r.role, r.name, r.branchName, r.branchId, r.defaultPassword].map(escapeCsv).join(',')),
  ...employeeRows.map((r) => [r.role, r.name, r.branchName, r.branchId, r.defaultPassword].map(escapeCsv).join(',')),
]
writeFileSync(CSV_PATH, `\uFEFF${csvLines.join('\n')}\n`, 'utf8')

const report = {
  generatedAt: new Date().toISOString(),
  writeMode,
  updatedAt: writeResult.updated_at,
  managers: managerRows.length,
  employees: employeeRows.length,
  mismatches,
  csvPath: CSV_PATH,
  allPassed: mismatches.length === 0,
  managerPasswords: managerRows.map((r) => ({ branchId: r.branchId, password: r.defaultPassword })),
}
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)

if (mismatches.length) {
  console.error(`FAIL — ${mismatches.length} lỗi:`)
  for (const m of mismatches.slice(0, 30)) console.error(`  • ${m}`)
  process.exit(1)
}

console.log(`  ✓ Verify 100% — QL ${managerRows.length}, NV ${employeeRows.length}`)
console.log(`  ✓ CSV: ${CSV_PATH}`)
console.log('\nPASS\n')
