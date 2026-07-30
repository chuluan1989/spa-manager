/**
 * UAT Login V2 — full flow trên Production Supabase (chỉ tài khoản UAT).
 * Run: npm run uat:login-v2-production
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadProductionSupabaseEnv, isPlaceholderSupabaseKey } from './lib/loadProductionSupabaseEnv.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence')
const UAT_BRANCH = 'vinh-long'
const UAT_NAME = 'Thúy An'
const UAT_NAME_RENAMED = 'Thúy An UAT Renamed'
const UAT_ADMIN_USERNAME = 'uathuyan'

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
const { ROLES } = await import('../src/constants/roles.js')
const { verifyLoginWithUsername } = await import('../src/constants/loginCredentials.js')
const {
  allocateEmployeeLoginUsername,
  computeEmployeeDefaultPasswordFromUsername,
  getEmployeeLoginUsername,
} = await import('../src/utils/loginUsername.js')
const {
  UAT_LOGIN_V2_EMPLOYEE_IDS,
  UAT_LOGIN_V2_PREFIX,
  canUseBranchWideBulkReset,
  canUseSystemWideBulkReset,
  setForceLiveSupabaseMode,
} = await import('../src/utils/uatAccountGuard.js')
setForceLiveSupabaseMode(true)
const {
  changeOwnEmployeePassword,
  resetEmployeePasswordsBulk,
  resetEmployeePasswordToDefault,
  updateEmployeeLoginUsername,
  resetEmployeePasswordsByBranch,
  resetAllLoginPasswordsToDefault,
} = await import('../src/utils/credentialsStorage.js')
const { hashPassword } = await import('../src/utils/passwordHash.js')
const { normalizeEmployee, EMPLOYEE_STATUS } = await import('../src/utils/employeeStorage.js')

const sb = createClient(supabaseEnv.url, supabaseEnv.key)

const evidence = {
  generatedAt: new Date().toISOString(),
  environment: 'production-supabase',
  uatPrefix: UAT_LOGIN_V2_PREFIX,
  steps: [],
  summary: { passed: 0, failed: 0 },
}

function record(step, title, ok, detail = '') {
  evidence.steps.push({ step, title, ok, detail, at: new Date().toISOString() })
  if (ok) evidence.summary.passed += 1
  else evidence.summary.failed += 1
  console.log(`  ${ok ? '✓' : '✗'} ${step}: ${title}${detail ? ` — ${detail}` : ''}`)
}

function setSession(user) {
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify(user))
}

async function fetchPayload(table) {
  const { data, error } = await sb.from(table).select('payload').eq('id', 'singleton').maybeSingle()
  if (error) {
    if (/account_metadata|schema cache/i.test(error.message ?? '')) return {}
    throw new Error(error.message)
  }
  return data?.payload ?? {}
}

async function upsertPayload(table, payload) {
  const { error } = await sb.from(table).upsert({ id: 'singleton', payload })
  if (error) {
    if (table === 'account_metadata' && /account_metadata|schema cache/i.test(error.message ?? '')) {
      console.warn('Cảnh báo: account_metadata không tồn tại — bỏ qua sync lock state')
      return
    }
    throw new Error(error.message)
  }
}

async function hydrateLocalFromProduction() {
  const [credPayload, empRows, metaPayload] = await Promise.all([
    fetchPayload('app_credentials'),
    sb.from('employees').select('id,name,branch_id,status,position,updated_at,branch_history'),
    fetchPayload('account_metadata'),
  ])

  localStorage.setItem('spa-manager-credentials', JSON.stringify({
    admin: credPayload.admin ?? 'admin123',
    branches: credPayload.branches ?? {},
    branchPasswordMeta: credPayload.branchPasswordMeta ?? {},
    employees: credPayload.employees ?? {},
    loginUsernameRegistry: credPayload.loginUsernameRegistry ?? {},
  }))

  if (empRows.data?.length) {
    localStorage.setItem('spa-manager-employees', JSON.stringify(
      empRows.data.map((row) => normalizeEmployee(rowToCamel(row))),
    ))
  }

  localStorage.setItem('spa-manager-account-metadata', JSON.stringify(metaPayload ?? {}))
}

async function saveCredentialsToProduction() {
  const credentials = JSON.parse(localStorage.getItem('spa-manager-credentials'))
  const current = await fetchPayload('app_credentials')
  await upsertPayload('app_credentials', {
    ...current,
    admin: credentials.admin,
    branches: credentials.branches,
    branchPasswordMeta: credentials.branchPasswordMeta,
    employees: credentials.employees,
    loginUsernameRegistry: credentials.loginUsernameRegistry ?? {},
  })
}

async function upsertUatEmployee({ id, name, branchId }) {
  const { error } = await sb.from('employees').upsert({
    id,
    name,
    branch_id: branchId,
    status: 'active',
    position: 'KTV',
    branch_history: [],
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

async function provisionCredential(employeeId, name, branchId, username) {
  const plain = computeEmployeeDefaultPasswordFromUsername(username, branchId)
  const entry = {
    branchId,
    name,
    loginUsername: username,
    password: await hashPassword(plain),
    passwordUpdatedAt: null,
    customPassword: false,
  }

  const credPayload = await fetchPayload('app_credentials')
  credPayload.employees = credPayload.employees ?? {}
  credPayload.loginUsernameRegistry = credPayload.loginUsernameRegistry ?? {}
  credPayload.employees[employeeId] = entry
  credPayload.loginUsernameRegistry[employeeId] = username
  await upsertPayload('app_credentials', credPayload)
  return { username, defaultPassword: plain }
}

async function cleanupUatEmployees() {
  const ids = Object.values(UAT_LOGIN_V2_EMPLOYEE_IDS)
  await sb.from('employees').delete().in('id', ids)

  const credPayload = await fetchPayload('app_credentials')
  const metaPayload = await fetchPayload('account_metadata')

  for (const id of ids) {
    delete credPayload.employees?.[id]
    delete credPayload.loginUsernameRegistry?.[id]
    delete metaPayload[`employee:${id}`]
  }

  await upsertPayload('app_credentials', credPayload)
  await upsertPayload('account_metadata', metaPayload)
}

async function setEmployeeLocked(employeeId, locked) {
  const meta = JSON.parse(localStorage.getItem('spa-manager-account-metadata') ?? '{}')
  const key = `employee:${employeeId}`
  meta[key] = { ...(meta[key] ?? {}), locked: Boolean(locked), lastLogin: meta[key]?.lastLogin ?? null }
  localStorage.setItem('spa-manager-account-metadata', JSON.stringify(meta))
  try {
    const remote = await fetchPayload('account_metadata')
    remote[key] = meta[key]
    await upsertPayload('account_metadata', remote)
  } catch {
    /* local lock vẫn hiệu lực trong phiên UAT */
  }
}

console.log('\n=== UAT Login V2 — Production Flow (UAT accounts only) ===\n')

try {
  await cleanupUatEmployees()
  record('0', 'Dọn tài khoản UAT cũ', true)

  await hydrateLocalFromProduction()

  const user1 = allocateEmployeeLoginUsername(UAT_NAME)
  await upsertUatEmployee({
    id: UAT_LOGIN_V2_EMPLOYEE_IDS.THUY_AN_1,
    name: UAT_NAME,
    branchId: UAT_BRANCH,
  })
  await hydrateLocalFromProduction()
  const cred1 = await provisionCredential(
    UAT_LOGIN_V2_EMPLOYEE_IDS.THUY_AN_1,
    UAT_NAME,
    UAT_BRANCH,
    user1,
  )

  await hydrateLocalFromProduction()
  const user2 = allocateEmployeeLoginUsername(UAT_NAME)
  await upsertUatEmployee({
    id: UAT_LOGIN_V2_EMPLOYEE_IDS.THUY_AN_2,
    name: UAT_NAME,
    branchId: UAT_BRANCH,
  })
  await hydrateLocalFromProduction()
  await provisionCredential(
    UAT_LOGIN_V2_EMPLOYEE_IDS.THUY_AN_2,
    UAT_NAME,
    UAT_BRANCH,
    user2,
  )

  const dupOk = user1 !== user2
    && user1.startsWith('thuyan')
    && user2.startsWith('thuyan')
    && parseInt(user2.replace('thuyan', '') || '1', 10) > parseInt(user1.replace('thuyan', '') || '1', 10)
  record('1', 'Tạo 2 NV UAT cùng tên — username phân biệt', dupOk, `${user1}, ${user2}`)

  const flowId = UAT_LOGIN_V2_EMPLOYEE_IDS.THUY_AN_1
  let flowUser = user1
  let flowPassword = cred1.defaultPassword

  await hydrateLocalFromProduction()

  const loginDefault = await verifyLoginWithUsername({
    role: ROLES.EMPLOYEE,
    username: flowUser,
    password: flowPassword,
  })
  record('2', 'Đăng nhập MK mặc định', loginDefault.ok && loginDefault.user?.mustChangePassword === true, flowUser)

  setSession({
    role: ROLES.EMPLOYEE,
    branch: UAT_BRANCH,
    employeeId: flowId,
    employeeName: UAT_NAME,
    mustChangePassword: true,
  })
  const newPassword = 'uathuyanpass1'
  const change1 = await changeOwnEmployeePassword({
    employeeId: flowId,
    currentPassword: flowPassword,
    newPassword,
    confirmPassword: newPassword,
  })
  await saveCredentialsToProduction()
  await hydrateLocalFromProduction()
  record('3', 'Bắt buộc đổi MK lần đầu', change1.success)

  flowPassword = newPassword
  const loginNew = await verifyLoginWithUsername({
    role: ROLES.EMPLOYEE,
    username: flowUser,
    password: flowPassword,
  })
  record('4', 'Đăng nhập lại bằng MK mới', loginNew.ok && !loginNew.user?.mustChangePassword)

  await sb.from('employees').update({
    name: UAT_NAME_RENAMED,
    updated_at: new Date().toISOString(),
  }).eq('id', flowId)

  const credPayload = await fetchPayload('app_credentials')
  credPayload.employees[flowId].name = UAT_NAME_RENAMED
  await upsertPayload('app_credentials', credPayload)
  await hydrateLocalFromProduction()

  const usernameAfterRename = getEmployeeLoginUsername(
    normalizeEmployee({ id: flowId, name: UAT_NAME_RENAMED, branchId: UAT_BRANCH, status: EMPLOYEE_STATUS.ACTIVE }),
  )
  record('5', 'Đổi tên hồ sơ — username không đổi', usernameAfterRename === flowUser, usernameAfterRename)

  setSession({ role: ROLES.ADMIN, branch: 'all' })
  const adminChangeUser = await updateEmployeeLoginUsername(flowId, UAT_ADMIN_USERNAME)
  await saveCredentialsToProduction()
  await hydrateLocalFromProduction()
  flowUser = UAT_ADMIN_USERNAME
  record('6', 'Admin đổi username thủ công', adminChangeUser.success, flowUser)

  const reset1 = await resetEmployeePasswordToDefault(flowId)
  await saveCredentialsToProduction()
  await hydrateLocalFromProduction()
  const resetPassword = reset1.defaultPassword
  record('7', 'Admin reset MK về mặc định', reset1.success, resetPassword)

  const loginAfterReset = await verifyLoginWithUsername({
    role: ROLES.EMPLOYEE,
    username: flowUser,
    password: resetPassword,
  })
  record('8', 'Đăng nhập MK mặc định sau reset', loginAfterReset.ok && loginAfterReset.user?.mustChangePassword)

  setSession({
    role: ROLES.EMPLOYEE,
    branch: UAT_BRANCH,
    employeeId: flowId,
    employeeName: UAT_NAME_RENAMED,
    mustChangePassword: true,
  })
  const newPassword2 = 'uathuyanpass2'
  const change2 = await changeOwnEmployeePassword({
    employeeId: flowId,
    currentPassword: resetPassword,
    newPassword: newPassword2,
    confirmPassword: newPassword2,
  })
  await saveCredentialsToProduction()
  record('9', 'Bắt buộc đổi MK sau reset', change2.success)

  await setEmployeeLocked(flowId, true)
  const lockedLogin = await verifyLoginWithUsername({
    role: ROLES.EMPLOYEE,
    username: flowUser,
    password: newPassword2,
  })
  record('10', 'Khóa tài khoản — không đăng nhập được', !lockedLogin.ok, lockedLogin.message ?? '')

  await setEmployeeLocked(flowId, false)
  const unlockedLogin = await verifyLoginWithUsername({
    role: ROLES.EMPLOYEE,
    username: flowUser,
    password: newPassword2,
  })
  record('11', 'Mở khóa — đăng nhập được', unlockedLogin.ok)

  setSession({ role: ROLES.ADMIN, branch: 'all' })
  await hydrateLocalFromProduction()
  const bulk = await resetEmployeePasswordsBulk([
    UAT_LOGIN_V2_EMPLOYEE_IDS.THUY_AN_1,
    UAT_LOGIN_V2_EMPLOYEE_IDS.THUY_AN_2,
    'tram-spa-cherry',
  ])
  await saveCredentialsToProduction()
  record(
    '12',
    'Reset hàng loạt — chỉ UAT, bỏ qua NV thật',
    bulk.success && bulk.succeeded === 2 && bulk.skipped >= 1 && bulk.failed === 0,
    `ok=${bulk.succeeded} skip=${bulk.skipped} fail=${bulk.failed}`,
  )

  setSession({ role: ROLES.ADMIN, branch: 'all' })
  const branchBlock = await resetEmployeePasswordsByBranch(UAT_BRANCH)
  const allBlock = await resetAllLoginPasswordsToDefault()
  record(
    '13',
    'Chặn reset theo chi nhánh / toàn hệ thống trên live',
    !canUseBranchWideBulkReset() && !canUseSystemWideBulkReset() && !branchBlock.success && !allBlock.success,
  )
} catch (error) {
  record('ERR', 'Lỗi không mong đợi', false, error?.message ?? String(error))
}

const md = [
  '# UAT Login V2 — Production Flow',
  '',
  `Generated: ${evidence.generatedAt}`,
  '',
  `**UAT prefix:** \`${UAT_LOGIN_V2_PREFIX}\``,
  '',
  '## Steps',
  '',
  ...evidence.steps.map((s) => `- **${s.step}** ${s.title}: ${s.ok ? 'PASS' : 'FAIL'}${s.detail ? ` (${s.detail})` : ''}`),
  '',
  `## Summary: ${evidence.summary.passed} passed, ${evidence.summary.failed} failed`,
  '',
].join('\n')

writeFileSync(path.join(OUT_DIR, 'UAT_LOGIN_V2_PRODUCTION_FLOW.md'), md, 'utf8')
writeFileSync(path.join(OUT_DIR, 'UAT_LOGIN_V2_PRODUCTION_FLOW.json'), JSON.stringify(evidence, null, 2), 'utf8')

console.log(`\n=== Summary: ${evidence.summary.passed} passed, ${evidence.summary.failed} failed ===`)
console.log('Report: docs/uat-evidence/UAT_LOGIN_V2_PRODUCTION_FLOW.md\n')

if (evidence.summary.failed > 0) process.exitCode = 1
