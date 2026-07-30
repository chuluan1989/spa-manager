/**
 * Xuất danh sách tài khoản Production (không có mật khẩu cá nhân).
 * Run: npm run export:production-accounts
 *
 * Output: docs/uat-evidence/PRODUCTION_ACCOUNTS_AUDIT.md + .json + .csv
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadProductionSupabaseEnv, isPlaceholderSupabaseKey } from './lib/loadProductionSupabaseEnv.mjs'
import { rowToCamel } from '../src/repositories/caseUtils.js'
import {
  computeBranchManagerLoginUsername,
  computeEmployeeLoginUsername,
} from '../src/utils/loginUsername.js'
import { UAT_LOGIN_V2_PREFIX } from '../src/utils/uatAccountGuard.js'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence')

mkdirSync(OUT_DIR, { recursive: true })

function resolveUsername(employee, credEntry, registry) {
  return credEntry?.loginUsername
    || registry?.[employee.id]
    || computeEmployeeLoginUsername(employee.name)
}

async function loadSupabase() {
  let url = process.env.VITE_SUPABASE_URL
  let key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || isPlaceholderSupabaseKey(key)) {
    const prod = await loadProductionSupabaseEnv()
    url = prod.url
    key = prod.key
  }
  return createClient(url, key)
}

const sb = await loadSupabase()

const [
  { data: employees, error: empErr },
  { data: branches, error: branchErr },
  { data: credRow, error: credErr },
  metaResult,
] = await Promise.all([
  sb.from('employees').select('id,name,branch_id,status,updated_at').order('name'),
  sb.from('branches').select('id,name').order('id'),
  sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle(),
  sb.from('account_metadata').select('payload').eq('id', 'singleton').maybeSingle(),
])

const metaErr = metaResult.error
const metaRow = metaResult.data

if (empErr || branchErr || credErr) {
  console.error('Lỗi tải dữ liệu:', empErr?.message || branchErr?.message || credErr?.message)
  process.exit(1)
}

if (metaErr) {
  console.warn('Cảnh báo: không tải account_metadata — dùng rỗng:', metaErr.message)
}

const branchNameById = Object.fromEntries((branches ?? []).map((b) => [b.id, b.name]))
const credPayload = credRow?.payload ?? {}
const credEmployees = credPayload.employees ?? {}
const registry = credPayload.loginUsernameRegistry ?? {}
const metaPayload = metaRow?.payload ?? {}

const rows = []
const usernameBuckets = new Map()

for (const raw of employees ?? []) {
  const employee = rowToCamel(raw)
  const cred = credEmployees[employee.id]
  const username = resolveUsername(employee, cred, registry)
  const accountKey = `employee:${employee.id}`
  const locked = Boolean(metaPayload[accountKey]?.locked)
  const hasCredential = Boolean(cred?.password)
  const hasChangedPassword = Boolean(cred?.customPassword)
  const isActive = employee.status === 'active'
  const isUat = employee.id.startsWith(UAT_LOGIN_V2_PREFIX)

  const row = {
    employeeId: employee.id,
    fullName: employee.name ?? '',
    currentBranchId: employee.branchId ?? '',
    currentBranchName: branchNameById[employee.branchId] ?? employee.branchId ?? '—',
    username,
    status: isActive ? 'Active' : (employee.status ?? '—'),
    loginLocked: locked ? 'Locked' : 'Active',
    hasChangedPassword: hasCredential ? (hasChangedPassword ? 'Yes' : 'No') : '—',
    missingCredential: !hasCredential,
    duplicateUsername: false,
    isUat,
  }
  rows.push(row)

  const key = username.toLowerCase()
  if (!usernameBuckets.has(key)) usernameBuckets.set(key, [])
  usernameBuckets.get(key).push(employee.id)
}

for (const row of rows) {
  const bucket = usernameBuckets.get(row.username.toLowerCase()) ?? []
  row.duplicateUsername = bucket.length > 1
}

// Branch managers
const branchRows = (branches ?? []).map((branch) => {
  const meta = metaPayload[branch.id] ?? {}
  return {
    employeeId: `branch-manager:${branch.id}`,
    fullName: `QL ${branch.name}`,
    currentBranchId: branch.id,
    currentBranchName: branch.name,
    username: computeBranchManagerLoginUsername(branch.id),
    status: 'Active',
    loginLocked: meta.locked ? 'Locked' : 'Active',
    hasChangedPassword: credPayload.branchPasswordMeta?.[branch.id]?.customPassword ? 'Yes' : 'No',
    missingCredential: !credPayload.branches?.[branch.id],
    duplicateUsername: false,
    isUat: false,
  }
})

const duplicateUsernames = [...usernameBuckets.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([username, ids]) => ({ username, employeeIds: ids }))

const summary = {
  generatedAt: new Date().toISOString(),
  totalEmployees: rows.length,
  activeEmployees: rows.filter((r) => r.status === 'Active').length,
  missingCredentials: rows.filter((r) => r.missingCredential && r.status === 'Active').length,
  duplicateUsernameGroups: duplicateUsernames.length,
  uatEmployees: rows.filter((r) => r.isUat).length,
  lockedEmployees: rows.filter((r) => r.loginLocked === 'Locked').length,
}

const allRows = [...rows, ...branchRows]

const csvHeader = [
  'Employee ID',
  'Họ tên',
  'Chi nhánh hiện tại',
  'Username',
  'Trạng thái',
  'Khóa đăng nhập',
  'Đã đổi MK',
  'Trùng username',
  'Thiếu credential',
  'UAT',
].join(',')

const csvBody = allRows.map((r) => [
  r.employeeId,
  `"${String(r.fullName).replace(/"/g, '""')}"`,
  `"${r.currentBranchName}"`,
  r.username,
  r.status,
  r.loginLocked,
  r.hasChangedPassword,
  r.duplicateUsername ? 'Yes' : 'No',
  r.missingCredential ? 'Yes' : 'No',
  r.isUat ? 'Yes' : 'No',
].join(',')).join('\n')

const md = [
  '# Production Accounts Audit',
  '',
  `Generated: ${summary.generatedAt}`,
  '',
  '## Summary',
  '',
  `- Tổng nhân viên: **${summary.totalEmployees}**`,
  `- Active: **${summary.activeEmployees}**`,
  `- Thiếu credential: **${summary.missingCredentials}**`,
  `- Nhóm username trùng: **${summary.duplicateUsernameGroups}**`,
  `- Tài khoản UAT: **${summary.uatEmployees}**`,
  `- NV bị khóa đăng nhập: **${summary.lockedEmployees}**`,
  '',
  '> Không xuất mật khẩu cá nhân đã đổi.',
  '',
  '## Duplicate usernames',
  '',
  duplicateUsernames.length
    ? duplicateUsernames.map((d) => `- \`${d.username}\`: ${d.employeeIds.join(', ')}`).join('\n')
    : '_Không có nhóm username trùng._',
  '',
  '## Employees',
  '',
  '| Employee ID | Họ tên | Chi nhánh | Username | Active | Locked | Đổi MK | Trùng | Thiếu cred |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.employeeId} | ${r.fullName} | ${r.currentBranchName} | \`${r.username}\` | ${r.status} | ${r.loginLocked} | ${r.hasChangedPassword} | ${r.duplicateUsername ? 'Yes' : 'No'} | ${r.missingCredential ? 'Yes' : 'No'} |`),
  '',
].join('\n')

writeFileSync(path.join(OUT_DIR, 'PRODUCTION_ACCOUNTS_AUDIT.md'), md, 'utf8')
writeFileSync(path.join(OUT_DIR, 'PRODUCTION_ACCOUNTS_AUDIT.json'), JSON.stringify({ summary, employees: rows, branchManagers: branchRows, duplicateUsernames }, null, 2), 'utf8')
writeFileSync(path.join(OUT_DIR, 'PRODUCTION_ACCOUNTS_AUDIT.csv'), `${csvHeader}\n${csvBody}\n`, 'utf8')

console.log('\n=== Production Accounts Audit ===\n')
console.log(`Employees: ${summary.totalEmployees} | Missing cred: ${summary.missingCredentials} | Duplicate groups: ${summary.duplicateUsernameGroups}`)
console.log(`Output: docs/uat-evidence/PRODUCTION_ACCOUNTS_AUDIT.md\n`)
