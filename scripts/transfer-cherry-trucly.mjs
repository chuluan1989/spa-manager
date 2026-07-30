/**
 * Chuyển Cherry → Bạc Liêu, Trúc Ly → Sóc Trăng (chỉ cập nhật branch_id + credential metadata).
 * Dữ liệu lịch sử (hóa đơn/chấm công/lương cũ) không bị sửa.
 *
 * Usage:
 *   node scripts/transfer-cherry-trucly.mjs           # dry-run
 *   node scripts/transfer-cherry-trucly.mjs --apply   # ghi Supabase
 */
import { createClient } from '@supabase/supabase-js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'

const APPLY = process.argv.includes('--apply')
const TRANSFERS = [
  { id: 'tram-spa-cherry', name: 'Cherry', fromBranch: 'tram-spa', toBranch: 'bac-lieu' },
  { id: 'tram-spa-truc-ly', name: 'Trúc Ly', fromBranch: 'tram-spa', toBranch: 'soc-trang' },
]

const { url, key } = await loadProductionSupabaseEnv()
const sb = createClient(url, key)

const [{ data: employees }, { data: credRow }] = await Promise.all([
  sb.from('employees').select('*').in('id', TRANSFERS.map((t) => t.id)),
  sb.from('app_credentials').select('*').eq('id', 'singleton').maybeSingle(),
])

console.log(`\n=== Chuyển chi nhánh nhân viên (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`)

const payload = credRow?.payload ?? { employees: {} }
payload.employees = payload.employees ?? {}

for (const plan of TRANSFERS) {
  const current = employees?.find((item) => item.id === plan.id)
  if (!current) {
    console.log(`  ✗ ${plan.name} (${plan.id}): không tìm thấy`)
    continue
  }
  if (current.branch_id !== plan.fromBranch) {
    console.log(`  ⚠ ${plan.name}: branch_id hiện tại=${current.branch_id}, kỳ vọng=${plan.fromBranch}`)
  }
  if (current.branch_id === plan.toBranch) {
    console.log(`  ✓ ${plan.name}: đã ở ${plan.toBranch}`)
    continue
  }

  const historyEntry = {
    fromBranchId: current.branch_id,
    toBranchId: plan.toBranch,
    branchId: current.branch_id,
    transferDate: new Date().toISOString().slice(0, 10),
    effectiveDate: new Date().toISOString().slice(0, 10),
    note: 'Chuyển chi nhánh theo yêu cầu vận hành',
    changedAt: new Date().toISOString(),
  }
  const branchHistory = Array.isArray(current.branch_history) ? [...current.branch_history] : []
  branchHistory.push(historyEntry)

  console.log(`  → ${plan.name}: ${current.branch_id} → ${plan.toBranch}`)
  console.log(`    username giữ nguyên: ${plan.id}`)
  console.log(`    credential.branchId: ${payload.employees[plan.id]?.branchId ?? '—'} → ${plan.toBranch}`)

  if (APPLY) {
    const { error: empError } = await sb.from('employees').update({
      branch_id: plan.toBranch,
      branch_history: branchHistory,
      updated_at: new Date().toISOString(),
    }).eq('id', plan.id)
    if (empError) {
      console.log(`    ✗ Lỗi cập nhật employee: ${empError.message}`)
      continue
    }

    const cred = payload.employees[plan.id] ?? {}
    payload.employees[plan.id] = {
      ...cred,
      branchId: plan.toBranch,
      name: cred.name || current.name,
    }
    console.log('    ✓ employee updated')
  }
}

if (APPLY) {
  const { error: credError } = await sb.from('app_credentials').upsert({
    id: 'singleton',
    payload,
    updated_at: new Date().toISOString(),
  })
  if (credError) {
    console.error('\n✗ Lỗi cập nhật app_credentials:', credError.message)
    process.exit(1)
  }
  console.log('\n✓ app_credentials updated')
  console.log('\nLưu ý: Hóa đơn/chấm công/lương cũ vẫn giữ branch_id gốc (Trạm Spa).')
  console.log('Dữ liệu mới sẽ dùng employee.branch_id mới.\n')
} else {
  console.log('\nDry-run — thêm --apply để ghi Supabase.\n')
}
