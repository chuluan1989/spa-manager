/**
 * Verify 100% QL + NV đăng nhập theo hồ sơ hiện tại (hash trên Supabase).
 * Run: node --env-file=.env.local node_modules/.bin/vite-node scripts/verify-login-from-profiles.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadProductionSupabaseEnv, isPlaceholderSupabaseKey } from './lib/loadProductionSupabaseEnv.mjs'
import {
  createSupabaseWriteClient,
  fetchCredentialsPayload,
} from './lib/supabaseCredentialsWrite.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence')
mkdirSync(OUT_DIR, { recursive: true })
const REPORT_PATH = path.join(OUT_DIR, 'LOGIN_FROM_PROFILES_VERIFY.json')

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
  CANONICAL_BRANCHES,
  DEPRECATED_BRANCH_IDS,
  resolveCanonicalBranchId,
  getPasswordBranchName,
} = await import('../src/constants/canonicalBranches.js')
const { normalizeEmployee, isEmployeeLoginEligible } = await import('../src/utils/employeeStorage.js')
const { verifyPassword } = await import('../src/utils/passwordHash.js')
const {
  computeEmployeeProfileDefaultPassword,
  getBranchManagerCanonicalPassword,
} = await import('../src/utils/credentialsStorage.js')
const { createSupabaseWriteClient: _c } = await import('./lib/supabaseCredentialsWrite.mjs')

const { client } = createSupabaseWriteClient({
  url: supabaseEnv.url,
  anonKey: supabaseEnv.key,
})

const remote = await fetchCredentialsPayload(client)
const payload = remote?.payload
if (!payload) {
  console.error('FAIL — không đọc được app_credentials')
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

const failures = []
const managerResults = []
const employeeResults = []

const activeBranches = (branchRows ?? []).filter(
  (b) => b.status !== 'inactive' && !DEPRECATED_BRANCH_IDS.includes(b.id),
)

for (const branch of activeBranches) {
  const plain = getBranchManagerCanonicalPassword(branch.id)
  const hash = payload.branches?.[branch.id]
  const ok = Boolean(hash) && (await verifyPassword(plain, hash))
  managerResults.push({
    branchId: branch.id,
    branchName: branch.name,
    password: plain,
    ok,
  })
  if (!ok) failures.push(`QL ${branch.name} (${branch.id})`)
}

// Đảm bảo đủ canonical ids có trong credentials
for (const branch of CANONICAL_BRANCHES) {
  if (managerResults.some((r) => r.branchId === branch.id)) continue
  const plain = branch.managerPassword
  const hash = payload.branches?.[branch.id]
  const ok = Boolean(hash) && (await verifyPassword(plain, hash))
  managerResults.push({ branchId: branch.id, branchName: branch.name, password: plain, ok })
  if (!ok) failures.push(`QL canonical ${branch.name}`)
}

for (const employee of eligible) {
  const plain = computeEmployeeProfileDefaultPassword(employee.name, employee.branchId)
  const entry = payload.employees?.[employee.id]
  const nameOk = entry?.name === employee.name
  const hashOk = Boolean(entry?.password) && (await verifyPassword(plain, entry.password))
  const customOk = entry?.customPassword === false
  const ok = nameOk && hashOk && customOk
  employeeResults.push({
    employeeId: employee.id,
    name: employee.name,
    branchId: employee.branchId,
    branchName: getPasswordBranchName(resolveCanonicalBranchId(employee.branchId)),
    password: plain,
    ok,
    nameOk,
    hashOk,
    customOk,
  })
  if (!ok) {
    failures.push(
      `NV ${employee.name} (${employee.id}) nameOk=${nameOk} hashOk=${hashOk} customOk=${customOk}`,
    )
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  credentialsUpdatedAt: remote.updated_at,
  managersTotal: managerResults.length,
  managersPassed: managerResults.filter((r) => r.ok).length,
  employeesTotal: employeeResults.length,
  employeesPassed: employeeResults.filter((r) => r.ok).length,
  failures,
  allPassed: failures.length === 0,
}
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)

console.log('\n=== Verify login từ hồ sơ ===\n')
console.log(`  QL: ${report.managersPassed}/${report.managersTotal}`)
console.log(`  NV: ${report.employeesPassed}/${report.employeesTotal}`)
if (failures.length) {
  console.error(`FAIL — ${failures.length} lỗi`)
  for (const f of failures.slice(0, 40)) console.error(`  • ${f}`)
  process.exit(1)
}
console.log('\nPASS — 100%\n')
