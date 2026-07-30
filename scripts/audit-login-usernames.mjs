/**
 * Kiểm tra username trùng trước khi bỏ chọn chi nhánh khi đăng nhập.
 * Usage: node scripts/audit-login-usernames.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'

const { url, key } = await loadProductionSupabaseEnv()
const sb = createClient(url, key)

const [{ data: employees, error: empErr }, { data: branches, error: branchErr }, { data: credRows, error: credErr }] = await Promise.all([
  sb.from('employees').select('id,name,branch_id,status'),
  sb.from('branches').select('id,name'),
  sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle(),
])

if (empErr || branchErr || credErr) {
  console.error('Lỗi tải dữ liệu:', empErr?.message || branchErr?.message || credErr?.message)
  process.exit(1)
}

const buckets = new Map()
const add = (username, entry) => {
  const key = String(username ?? '').trim()
  if (!key) return
  if (!buckets.has(key)) buckets.set(key, [])
  buckets.get(key).push(entry)
}

add('admin', { type: 'admin', label: 'Admin' })
for (const branch of branches ?? []) {
  add(branch.id, { type: 'branch_manager', label: `QL ${branch.name}`, branchId: branch.id })
}
for (const employee of employees ?? []) {
  if (employee.status === 'resigned') continue
  add(employee.id, {
    type: 'employee',
    label: employee.name || employee.id,
    employeeId: employee.id,
    branchId: employee.branch_id,
  })
}

const duplicates = [...buckets.entries()].filter(([, entries]) => entries.length > 1)

console.log('\n=== Kiểm tra username trùng ===\n')
console.log(`Tổng username bucket: ${buckets.size}`)
console.log(`Xung đột: ${duplicates.length}\n`)

if (duplicates.length === 0) {
  console.log('PASS — Không có username trùng. An toàn bỏ chọn chi nhánh khi đăng nhập.\n')
} else {
  console.log('FAIL — Cần chuẩn hóa username trước khi deploy:\n')
  for (const [username, entries] of duplicates) {
    console.log(`  • "${username}":`)
    for (const entry of entries) {
      console.log(`      - ${entry.type}: ${entry.label}${entry.branchId ? ` (${entry.branchId})` : ''}`)
    }
  }
  console.log('')
  process.exitCode = 1
}

const credPayload = credRows?.payload ?? {}
const credEmployees = credPayload.employees ?? {}
console.log('=== Mẫu credential nhân viên Trạm Spa ===')
for (const id of ['tram-spa-cherry', 'tram-spa-truc-ly']) {
  const emp = employees?.find((item) => item.id === id)
  const cred = credEmployees[id]
  console.log(`  ${id}:`)
  console.log(`    employee.branch_id=${emp?.branch_id ?? '—'} name=${emp?.name ?? '—'}`)
  console.log(`    credential.branchId=${cred?.branchId ?? '—'} customPassword=${Boolean(cred?.customPassword)}`)
}
console.log('')
