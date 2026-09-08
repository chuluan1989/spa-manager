/**
 * LOCAL UAT — Manager expense query fallback + HOME-branch KPI scope.
 * Mock / fixture only. No Production write. No commit/deploy.
 *
 * Run: npx vite-node scripts/verify-manager-expense-kpi-hotfix.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { ROLES } from '../src/constants/roles.js'
import { BRANCH_MANAGER_NAV_ORDER, EMPLOYEE_NAV_ORDER, ADMIN_NAV_ORDER } from '../src/constants/navigation.js'
import {
  canAccessAdminKpiPage,
  canAccessEmployeeKpiPage,
  canManageKpiPolicy,
  getVisibleNavItems,
} from '../src/constants/auth.js'
import { saveCurrentUser, clearCurrentUser } from '../src/utils/authStorage.js'
import { KPI_SCOPE_BRANCH_IDS, SEP2026_KPI_TARGETS } from '../src/constants/kpiPolicy.js'
import {
  EXPENSE_LIST_COLUMNS,
  fetchExpenseRowsWithOptionalColumnRetry,
  stripExpenseSelectColumn,
} from '../src/repositories/expensesRepository.js'
import { hasInvoiceFetchScope, normalizeEmployeeIdList } from '../src/repositories/invoicesRepository.js'
import { computeEmployeeKpi } from '../src/utils/employeeKpiEngine.js'
import { buildAdminKpiDashboard, filterAdminKpiRows } from '../src/utils/adminKpiDashboard.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const results = []

function check(id, name, pass, detail = '') {
  results.push({ id, name, pass: Boolean(pass), detail })
  if (pass) console.log(`  [PASS] ${id} ${name}`)
  else {
    console.error(`  [FAIL] ${id} ${name}`)
    if (detail) console.error(`         ${detail}`)
  }
}

function policiesFor(from = '2026-09-01') {
  return KPI_SCOPE_BRANCH_IDS.map((branchId) => ({
    id: `uat-${branchId}`,
    branchId,
    effectiveFrom: from,
    addonTarget: SEP2026_KPI_TARGETS.addon,
    advancedTarget: SEP2026_KPI_TARGETS.advanced,
    comboTarget: SEP2026_KPI_TARGETS.combo,
    requestedTarget: SEP2026_KPI_TARGETS.requested,
    duration90Target: SEP2026_KPI_TARGETS.duration90,
  }))
}

function inv(partial) {
  return {
    id: partial.id,
    date: partial.date || '2026-09-03',
    branchId: partial.branchId,
    employeeId: partial.employeeId,
    employeeName: partial.employeeName || partial.employeeId,
    supportEmployeeId: partial.supportEmployeeId || '',
    customerRequested: Boolean(partial.customerRequested),
    services: partial.services || [{ serviceId: 'body-60', serviceName: 'Body 60' }],
  }
}

const employees = [
  { id: 'tv-a', name: 'NV A TV', branchId: 'tra-vinh', status: 'active' },
  { id: 'tv-b', name: 'NV B TV', branchId: 'tra-vinh', status: 'active' },
  { id: 'st-x', name: 'NV X ST', branchId: 'soc-trang', status: 'active' },
  { id: 'vl-y', name: 'NV Y VL', branchId: 'vinh-long', status: 'active' },
]

const invoices = [
  inv({
    id: 'tv-home-1',
    branchId: 'tra-vinh',
    employeeId: 'tv-a',
    services: [
      { serviceId: 'body-60', serviceName: 'Body 60' },
      { serviceId: 'goi-sach', serviceName: 'Gội' },
    ],
  }),
  inv({
    id: 'tv-home-2',
    date: '2026-09-04',
    branchId: 'tra-vinh',
    employeeId: 'tv-a',
    customerRequested: true,
    services: [{ serviceId: 'body-90', serviceName: 'Body 90' }],
  }),
  inv({
    id: 'tv-tour',
    date: '2026-09-05',
    branchId: 'soc-trang',
    employeeId: 'tv-a',
    services: [
      { serviceId: 'body-60', serviceName: 'Body 60' },
      { serviceId: 'chuyen-sau', serviceName: 'Chuyên sâu' },
    ],
  }),
  inv({
    id: 'tv-b-home',
    branchId: 'tra-vinh',
    employeeId: 'tv-b',
    services: [{ serviceId: 'body-60', serviceName: 'Body 60' }],
  }),
  inv({
    id: 'st-at-tv',
    date: '2026-09-06',
    branchId: 'tra-vinh',
    employeeId: 'st-x',
    employeeName: 'NV X ST',
    services: [{ serviceId: 'body-60', serviceName: 'Body 60' }],
  }),
  inv({
    id: 'vl-home',
    branchId: 'vinh-long',
    employeeId: 'vl-y',
    services: [{ serviceId: 'body-60', serviceName: 'Body 60' }],
  }),
]

console.log('\n=== Manager expense + KPI hotfix (local) ===\n')

{
  const next = stripExpenseSelectColumn(EXPENSE_LIST_COLUMNS, 'expense_time')
  check('E1', 'strip expense_time khỏi SELECT list', !next.split(',').includes('expense_time')
    && next.includes('date')
    && next.includes('updated_at'), next)
  check('E2', 'SELECT list không gồm receipt_image', !EXPENSE_LIST_COLUMNS.split(',').includes('receipt_image'))
}

{
  const attempts = []
  const missing = new Set(['expense_time', 'paid_by', 'entered_by_id'])
  const rows = await fetchExpenseRowsWithOptionalColumnRetry(async (select) => {
    attempts.push(select)
    const cols = select.split(',').map((c) => c.trim())
    const hit = [...missing].find((col) => cols.includes(col))
    if (hit) {
      return { data: null, error: { message: `column expenses.${hit} does not exist` } }
    }
    return {
      data: [{ id: 'e1', date: '2026-09-08', branch_id: 'tra-vinh', amount: 100000, updated_at: '2026-09-08T00:00:00Z' }],
      error: null,
    }
  })
  check('E3', 'SELECT retry bỏ expense_time/paid_by/entered_by_id rồi thành công', rows.length === 1
    && attempts.length === 4
    && !attempts.at(-1).includes('expense_time')
    && attempts.at(-1).includes('date'), JSON.stringify({ attempts: attempts.length, last: attempts.at(-1) }))
}

{
  const expensesRepo = readFileSync(join(ROOT, 'src/repositories/expensesRepository.js'), 'utf8')
  check('E4', 'Date filter dùng cột date, không order expense_time', expensesRepo.includes(".gte('date', fromDate)")
    && expensesRepo.includes(".lte('date', toDate)")
    && !expensesRepo.includes(".order('expense_time'"))
}

{
  const invoicesRepo = readFileSync(join(ROOT, 'src/repositories/invoicesRepository.js'), 'utf8')
  check('CR', 'Không đụng customer_requested upsert retry', invoicesRepo.includes("stripped.has('customer_requested')")
    && invoicesRepo.includes('upsertInvoiceRowsWithRetry'))
}

clearCurrentUser()
saveCurrentUser({ id: 'ql-tv', role: ROLES.BRANCH_MANAGER, name: 'QL Trà Vinh', branch: 'tra-vinh' })
const managerNav = getVisibleNavItems(ROLES.BRANCH_MANAGER)
check('N1', 'Manager sidebar có KPI (admin-kpi), không employee-kpi', managerNav.some((i) => i.id === 'admin-kpi')
  && !managerNav.some((i) => i.id === 'employee-kpi')
  && BRANCH_MANAGER_NAV_ORDER.includes('admin-kpi')
  && canAccessAdminKpiPage(ROLES.BRANCH_MANAGER)
  && !canAccessEmployeeKpiPage(ROLES.BRANCH_MANAGER)
  && !canManageKpiPolicy(ROLES.BRANCH_MANAGER), managerNav.map((i) => i.id).join(','))

check('N2', 'Admin vẫn có admin-kpi; Employee vẫn employee-kpi', ADMIN_NAV_ORDER.includes('admin-kpi')
  && EMPLOYEE_NAV_ORDER.includes('employee-kpi')
  && canAccessAdminKpiPage(ROLES.ADMIN)
  && canManageKpiPolicy(ROLES.ADMIN)
  && !canAccessAdminKpiPage(ROLES.EMPLOYEE))

const policies = policiesFor()
const tvEmployees = employees.filter((e) => e.branchId === 'tra-vinh')
const tvIds = new Set(tvEmployees.map((e) => e.id))
const managerFetched = invoices.filter((row) => tvIds.has(row.employeeId))

const managerDash = buildAdminKpiDashboard(managerFetched, {
  fromDate: '2026-09-01',
  toDate: '2026-09-15',
  policies,
  employees: tvEmployees,
  restrictHomeBranchId: 'tra-vinh',
  includeRosterWithoutInvoices: true,
})

check('A', 'CASE A: QL Trà Vinh thấy NV HOME Trà Vinh', managerDash.rows.some((r) => r.employeeId === 'tv-a')
  && managerDash.rows.some((r) => r.employeeId === 'tv-b')
  && managerDash.rows.every((r) => r.homeBranchId === 'tra-vinh'), managerDash.rows.map((r) => r.employeeId).join(','))

check('B', 'CASE B: QL Trà Vinh không thấy NV Sóc Trăng/Vĩnh Long', !managerDash.rows.some((r) => r.employeeId === 'st-x')
  && !managerDash.rows.some((r) => r.employeeId === 'vl-y'))

{
  const rowA = managerDash.rows.find((r) => r.employeeId === 'tv-a')
  const tourKept = rowA?.model?.includedInvoices?.some((i) => i.invoiceId === 'tv-tour')
  check('C', 'CASE C: Tour CN khác vẫn nằm trong KPI NV HOME', Boolean(tourKept)
    && rowA.counts.totalInvoices === 3
    && rowA.servingBranchIds.includes('soc-trang')
    && rowA.servingBranchIds.includes('tra-vinh'), JSON.stringify({
    invoices: rowA?.counts?.totalInvoices,
    serving: rowA?.servingBranchIds,
  }))
}

{
  const servingLeak = buildAdminKpiDashboard(invoices, {
    fromDate: '2026-09-01',
    toDate: '2026-09-15',
    policies,
    employees,
    restrictHomeBranchId: 'tra-vinh',
  })
  check('D', 'CASE D: NV HOME khác phục vụ tại Trà Vinh không lọt roster QL TV', !servingLeak.rows.some((r) => r.employeeId === 'st-x')
    && servingLeak.rows.every((r) => r.homeBranchId === 'tra-vinh'))
}

{
  const adminDash = buildAdminKpiDashboard(invoices, {
    fromDate: '2026-09-01',
    toDate: '2026-09-15',
    policies,
    employees,
  })
  const adminA = adminDash.rows.find((r) => r.employeeId === 'tv-a')
  const managerA = managerDash.rows.find((r) => r.employeeId === 'tv-a')
  const engineA = computeEmployeeKpi(invoices.filter((row) => row.employeeId === 'tv-a'), {
    employeeId: 'tv-a',
    homeBranchId: 'tra-vinh',
    fromDate: '2026-09-01',
    toDate: '2026-09-15',
    policies,
  })
  const equal = adminA.counts.main === managerA.counts.main
    && adminA.counts.addon === managerA.counts.addon
    && adminA.counts.advanced === managerA.counts.advanced
    && adminA.counts.combo === managerA.counts.combo
    && adminA.counts.duration90 === managerA.counts.duration90
    && adminA.counts.requestedInvoices === managerA.counts.requestedInvoices
    && adminA.kpiPenalty === managerA.kpiPenalty
    && engineA.overall.counts.main === managerA.counts.main
    && engineA.penalty.kpiPenalty === managerA.kpiPenalty
  check('EQ', 'Manager = Admin = Employee engine cho cùng NV/kỳ', equal, JSON.stringify({
    admin: adminA.counts,
    manager: managerA.counts,
    engine: engineA.overall.counts,
    penalty: { admin: adminA.kpiPenalty, manager: managerA.kpiPenalty, engine: engineA.penalty.kpiPenalty },
  }))
}

{
  const otherBranchUi = filterAdminKpiRows(managerDash.rows, { branchId: 'soc-trang', homeOrServing: 'home' })
  check('LOCK', 'Manager filter home=Sóc Trăng → rỗng (không đổi CN)', otherBranchUi.length === 0)
}

check('IDS', 'employeeIds rỗng không phải unbounded scope', hasInvoiceFetchScope({ employeeIds: [] }) === false
  && normalizeEmployeeIdList(['tv-a', 'tv-a', '']).join(',') === 'tv-a')

{
  const adminKpiSrc = readFileSync(join(ROOT, 'src/pages/AdminKpi.jsx'), 'utf8')
  const engineSrc = readFileSync(join(ROOT, 'src/utils/employeeKpiEngine.js'), 'utf8')
  check('FORMULA', 'Không tạo KPI formula mới; Manager dùng computeEmployeeKpi', engineSrc.includes('export function computeEmployeeKpi')
    && adminKpiSrc.includes('buildAdminKpiDashboard')
    && !adminKpiSrc.includes('computeManagerKpi'))
  check('EGRESS', 'Manager KPI không fetchInvoices() full-history; Expenses không bulk receipt_image', !adminKpiSrc.includes('fetchInvoices(')
    && !EXPENSE_LIST_COLUMNS.includes('receipt_image')
    && adminKpiSrc.includes('employeeIds'))
}

const failed = results.filter((r) => !r.pass)
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===\n`)
if (failed.length) {
  process.exit(1)
}
