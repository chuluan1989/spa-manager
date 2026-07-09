/**
 * Kiểm tra tĩnh module Chi nhánh — không import app runtime (tránh treo Supabase).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const CANONICAL_BRANCH_IDS = [
  'soc-trang',
  'song-khoe-spa',
  'gia-lai-1',
  'tra-vinh',
  'bac-lieu',
  'vinh-long',
  'gia-lai-2',
  'tram-spa',
]

const canonicalFile = readFileSync(join(ROOT, 'src/constants/canonicalBranches.js'), 'utf8')
for (const id of CANONICAL_BRANCH_IDS) {
  assert.ok(canonicalFile.includes(`id: '${id}'`), `canonicalBranches thiếu ${id}`)
}

const branchSources = [
  'src/components/branches/BranchOverviewTab.jsx',
  'src/components/branches/BranchEmployeesTab.jsx',
  'src/components/branches/BranchAttendanceTab.jsx',
  'src/components/branches/BranchPricingTab.jsx',
  'src/components/branches/BranchSalaryTab.jsx',
  'src/components/branches/BranchInvoicesTab.jsx',
  'src/components/branches/useBranchAttendance.js',
  'src/components/branches/useBranchInvoices.js',
  'src/components/branches/BranchEmptyState.jsx',
  'src/pages/AdminBranches.jsx',
]

for (const rel of branchSources) {
  const text = readFileSync(join(ROOT, rel), 'utf8')
  if (rel.endsWith('BranchEmptyState.jsx')) continue
  assert.ok(text.includes('branchId'), `${rel} phải nhận/dùng branchId`)
}

const overview = readFileSync(join(ROOT, 'src/components/branches/BranchOverviewTab.jsx'), 'utf8')
assert.ok(overview.includes('useBranchAttendance'), 'Overview: useBranchAttendance')
assert.ok(overview.includes('Doanh thu hôm nay'), 'Overview: doanh thu hôm nay')
assert.ok(overview.includes('BranchEmptyState'), 'Overview: empty state')

const employees = readFileSync(join(ROOT, 'src/components/branches/BranchEmployeesTab.jsx'), 'utf8')
assert.ok(employees.includes('employeeBelongsToBranch'), 'Employees: lọc branch_id')
assert.ok(employees.includes('useBranchAttendance'), 'Employees: memo attendance filters')

const pricing = readFileSync(join(ROOT, 'src/components/branches/BranchPricingTab.jsx'), 'utf8')
assert.ok(pricing.includes('getBranchPricingMatrix(branchId)'), 'Pricing: matrix theo branch_id')
assert.ok(pricing.includes('serviceId'), 'Pricing: service_id')

const invoices = readFileSync(join(ROOT, 'src/components/branches/useBranchInvoices.js'), 'utf8')
assert.ok(invoices.includes('fetchInvoicesFiltered'), 'Invoices: Supabase query')
assert.ok(invoices.includes('recordBelongsToBranch'), 'Invoices: lọc branch_id')

const attendanceHook = readFileSync(join(ROOT, 'src/components/branches/useBranchAttendance.js'), 'utf8')
assert.ok(attendanceHook.includes('useMemo'), 'Attendance hook: memo filters')

const admin = readFileSync(join(ROOT, 'src/pages/AdminBranches.jsx'), 'utf8')
assert.ok(admin.includes("id: 'invoices'"), 'AdminBranches: tab Hóa đơn')
assert.ok(admin.includes('setSelectedBranchId(branch.id)'), 'AdminBranches: Chi tiết truyền branch_id')
for (const id of CANONICAL_BRANCH_IDS) {
  assert.ok(admin.includes(`branchId={selectedBranch.id}`) || admin.includes('branchId={selectedBranch.id}'), 'Tabs nhận branchId từ selectedBranch')
  break
}

console.log('verify-branch-detail: PASS')
console.log(`  8 chi nhánh chuẩn: ${CANONICAL_BRANCH_IDS.join(', ')}`)
console.log('  Kiểm tra: overview, nhân viên, bảng giá, hóa đơn, chấm công, lương — branch_id scoped')
