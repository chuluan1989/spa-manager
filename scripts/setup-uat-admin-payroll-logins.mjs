/**
 * Tạo mật khẩu UAT riêng cho phân quyền Admin payroll board.
 * - QL: Gia Lai 2 (chi nhánh ít/không NV vận hành) → uat_ql_gialai2_2026
 * - NV: UAT Cong Tac Final (Sóc Trăng) → uat_nv_2026
 *
 * Không đổi mật khẩu QL Sóc Trăng / Admin đang vận hành.
 *
 * Run: node --env-file=.env.development.local scripts/setup-uat-admin-payroll-logins.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSupabaseWriteClient, fetchCredentialsPayload, upsertCredentialsPayload } from './lib/supabaseCredentialsWrite.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/admin-payroll-board-local')
mkdirSync(OUT, { recursive: true })

const UAT_MANAGER_BRANCH = 'gia-lai-2'
const UAT_MANAGER_PASSWORD = 'uat_ql_gialai2_2026'
const UAT_EMPLOYEE_NAME = 'UAT Cong Tac Final'
const UAT_EMPLOYEE_PASSWORD = 'uat_nv_2026'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

await import('./_polyfill-storage.mjs')
const { hashPassword } = await import('../src/utils/passwordHash.js')

const { client, mode } = createSupabaseWriteClient({ url, anonKey })
console.log('writeMode', mode)

const { data: employees, error: empErr } = await client.from('employees').select('*')
if (empErr) throw new Error(empErr.message)

const uatEmp = (employees ?? []).find((row) => {
  const name = row.name || row.full_name || ''
  return String(name).trim() === UAT_EMPLOYEE_NAME
})
if (!uatEmp) {
  console.error('Không tìm thấy nhân viên', UAT_EMPLOYEE_NAME)
  process.exit(1)
}
const empId = uatEmp.id
const empBranch = uatEmp.branch_id || uatEmp.branchId || 'soc-trang'

const existing = await fetchCredentialsPayload(client)
const payload = existing?.payload ? structuredClone(existing.payload) : { admin: '', branches: {}, employees: {} }
payload.branches = payload.branches || {}
payload.employees = payload.employees || {}

payload.branches[UAT_MANAGER_BRANCH] = await hashPassword(UAT_MANAGER_PASSWORD)
payload.employees[empId] = {
  ...(payload.employees[empId] || {}),
  branchId: empBranch,
  name: UAT_EMPLOYEE_NAME,
  loginUsername: payload.employees[empId]?.loginUsername || 'uatcongtacfinal',
  password: await hashPassword(UAT_EMPLOYEE_PASSWORD),
  passwordUpdatedAt: new Date().toISOString(),
  customPassword: true,
}

const saved = await upsertCredentialsPayload(client, payload)
const report = {
  generatedAt: new Date().toISOString(),
  writeMode: mode,
  updatedAt: saved.updated_at,
  accounts: [
    {
      role: 'branch_manager',
      branchId: UAT_MANAGER_BRANCH,
      password: UAT_MANAGER_PASSWORD,
      note: 'UAT only — Gia Lai 2',
    },
    {
      role: 'employee',
      employeeId: empId,
      name: UAT_EMPLOYEE_NAME,
      branchId: empBranch,
      password: UAT_EMPLOYEE_PASSWORD,
      note: 'UAT only',
    },
  ],
}
writeFileSync(path.join(OUT, 'UAT_LOGIN_ACCOUNTS.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
console.log('Wrote', path.join(OUT, 'UAT_LOGIN_ACCOUNTS.json'))
