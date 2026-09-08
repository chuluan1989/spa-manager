/**
 * Egress hotfix regression — offline, no Production writes.
 * Run: npx vite-node scripts/verify-egress-hotfix.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { ATTENDANCE_BACKEND_ERROR_MESSAGE } from '../src/constants/attendanceUi.js'
import {
  EXPENSE_LIST_COLUMNS,
  hasExpenseFetchScope,
} from '../src/repositories/expensesRepository.js'
import {
  hasInvoiceFetchScope,
  INVOICE_SCOPE_REQUIRED_MESSAGE,
} from '../src/repositories/invoicesRepository.js'
import { getPayPeriodRange, PAY_CYCLES } from '../src/utils/salaryReport.js'
import {
  DEFAULT_SYNC_INTERVAL_MS,
  GLOBAL_PULL_ENTITIES,
  REALTIME_REFERENCE_TABLES,
} from '../src/utils/supabaseSync.js'
import { computeEmployeeKpi } from '../src/utils/employeeKpiEngine.js'
import { KPI_SCOPE_BRANCH_IDS } from '../src/constants/kpiPolicy.js'
import { changedEntitiesInclude } from '../src/utils/liveDataReload.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

function pass(label) {
  console.log(`  [PASS] ${label}`)
}

console.log('\n=== Egress hotfix regression ===\n')

const syncSrc = read('src/utils/supabaseSync.js')
const invoicesHook = read('src/hooks/useInvoicesData.js')
const expensesHook = read('src/hooks/useExpensesData.js')
const expensesRepo = read('src/repositories/expensesRepository.js')
const payrollHook = read('src/hooks/usePayrollData.js')
const attendanceHook = read('src/hooks/useAttendanceData.js')
const appSrc = read('src/App.jsx')

assert.equal(DEFAULT_SYNC_INTERVAL_MS >= 5 * 60 * 1000, true)
assert.match(syncSrc, /visibilityState|isDocumentVisible/)
assert.doesNotMatch(syncSrc, /fetchInvoices\(/)
assert.doesNotMatch(syncSrc, /fetchExpenses\(/)
assert.ok(!GLOBAL_PULL_ENTITIES.includes('invoices'))
assert.ok(!GLOBAL_PULL_ENTITIES.includes('expenses'))
assert.ok(!REALTIME_REFERENCE_TABLES.includes('invoices'))
assert.ok(!REALTIME_REFERENCE_TABLES.includes('expenses'))
assert.ok(!REALTIME_REFERENCE_TABLES.includes('attendance'))
assert.match(syncSrc, /name: 'branches'/)
assert.match(syncSrc, /name: 'employees'/)
assert.match(syncSrc, /name: 'settings'/)
pass('A. Idle global sync: no invoices/expenses; interval ≥ 5 minutes; visible-only')

assert.match(syncSrc, /REALTIME_REFERENCE_TABLES/)
assert.ok(!REALTIME_REFERENCE_TABLES.includes('invoices'))
assert.doesNotMatch(syncSrc, /name: 'invoices'/)
pass('B. Invoice realtime does not trigger pullAll full-history invoices')

assert.ok(!REALTIME_REFERENCE_TABLES.includes('attendance'))
assert.match(attendanceHook, /changedEntitiesInclude\(detail, \['attendance'\]\)/)
pass('C. Attendance realtime does not trigger invoice full sync')

assert.doesNotMatch(invoicesHook, /fetchInvoices\(/)
assert.match(invoicesHook, /hasInvoiceFetchScope/)
assert.match(invoicesHook, /INVOICE_SCOPE_REQUIRED_MESSAGE/)
assert.equal(hasInvoiceFetchScope({}), false)
assert.equal(hasInvoiceFetchScope({ fromDate: '2026-09-01', toDate: '2026-09-06' }), true)
assert.equal(hasInvoiceFetchScope({ employeeId: 'emp-1' }), true)
assert.equal(hasInvoiceFetchScope({ employeeIds: ['emp-1', 'emp-2'] }), true)
assert.equal(hasInvoiceFetchScope({ employeeIds: [] }), false)
pass('D. Invoice page/hook requires scope; no unbounded fetchInvoices()')

const p1 = getPayPeriodRange('2026-09', PAY_CYCLES.PERIOD_1)
assert.deepEqual(p1, { fromDate: '2026-09-01', toDate: '2026-09-15' })
assert.match(payrollHook, /getPayPeriodRange\(month, cycle\)/)
pass('E. Payroll Kỳ 1 scope 01–15')

const p2 = getPayPeriodRange('2026-09', PAY_CYCLES.PERIOD_2)
assert.deepEqual(p2, { fromDate: '2026-09-16', toDate: '2026-09-30' })
pass('F. Payroll Kỳ 2 scope 16–end')

const full = getPayPeriodRange('2026-07', PAY_CYCLES.FULL)
assert.deepEqual(full, { fromDate: '2026-07-01', toDate: '2026-07-31' })
const invoicesRepo = read('src/repositories/invoicesRepository.js')
assert.match(invoicesRepo, /fetchAllInvoiceRows/)
assert.match(invoicesRepo, /if \(fromDate\) next = next\.gte\('date', fromDate\)/)
pass('G. Historical report still paginates the requested date range')

assert.equal(EXPENSE_LIST_COLUMNS.includes('receipt_image'), false)
assert.match(expensesHook, /fetchExpensesFiltered/)
assert.doesNotMatch(expensesHook, /fetchExpenses\(/)
assert.equal(hasExpenseFetchScope({}), false)
assert.equal(hasExpenseFetchScope({ fromDate: '2026-09-01' }), true)
assert.match(expensesRepo, /fetchExpenseReceiptImage/)
assert.match(expensesRepo, /fetchExpenseRowsWithOptionalColumnRetry/)
assert.match(expensesRepo, /gte\('date', fromDate\)/)
pass('H. Expenses list excludes receipt_image; receipt loaded by id; date-scoped; optional-column retry')

assert.equal(
  ATTENDANCE_BACKEND_ERROR_MESSAGE,
  'Không thể kiểm tra chấm công do lỗi hệ thống. Vui lòng thử lại.',
)
assert.match(read('src/components/attendance/AttendanceEmployeeView.jsx'), /setCheckError/)
assert.match(read('src/utils/missingAttendanceRemind.js'), /skippedReason: 'backend_error'/)
assert.match(read('src/hooks/useAttendanceData.js'), /ATTENDANCE_BACKEND_ERROR_MESSAGE/)
pass('I. Backend failure shows system error, not chưa chấm công')

assert.match(payrollHook, /createDebouncedLiveReload/)
assert.match(payrollHook, /fromDate: invoiceRange.fromDate/)
assert.equal(changedEntitiesInclude({ changedEntities: ['invoices'] }, ['invoices', 'attendance']), true)
assert.equal(changedEntitiesInclude({ changedEntities: ['settings'] }, ['invoices', 'attendance']), false)
pass('J. Payroll live: period-scoped + debounced; config sync does not refetch payroll')

assert.match(appSrc, /startAutoSync\(\{ skipInitialPull: true \}\)/)
pass('App still starts auto-sync after initial pull (now reference-only)')

const empKpiSrc = read('src/pages/EmployeeKpi.jsx')
assert.match(empKpiSrc, /fetchKpiInvoicesForScope/)
assert.match(empKpiSrc, /employeeId,/)
assert.match(empKpiSrc, /fromDate: monthRange\.fromDate/)
assert.match(empKpiSrc, /toDate: monthRange\.toDate/)
assert.doesNotMatch(empKpiSrc, /monthBounds\(month\)/)
assert.doesNotMatch(empKpiSrc, /fetchKpiInvoicesForScope\(\{[\s\S]*branchId/)
assert.match(empKpiSrc, /import \{ getBranchName, getEmployeeById \}/)
pass('K. Employee KPI fetch is employeeId + pay period; no home-branch filter; no month-wide dump')

const adminKpiSrc = read('src/pages/AdminKpi.jsx')
assert.match(adminKpiSrc, /employeeIds/)
assert.match(adminKpiSrc, /fromDate: monthRange\.fromDate/)
assert.match(adminKpiSrc, /restrictHomeBranchId: managerMode \? managerBranchId : ''/)
assert.doesNotMatch(adminKpiSrc, /fetchInvoices\(/)
assert.match(adminKpiSrc, /fetchEmployeesFiltered\(\{ branchId: managerBranchId \}\)/)
pass('K2. Manager KPI fetch is home-branch roster + pay period employeeIds; no full-history invoices')

const policies = KPI_SCOPE_BRANCH_IDS.map((branchId) => ({
  id: `uat-${branchId}`,
  branchId,
  effectiveFrom: '2026-01-01',
  addonTarget: 0.8,
  advancedTarget: 0.2,
  comboTarget: 0.3,
  requestedTarget: 0.2,
  duration90Target: 0.3,
}))
const allInvoices = [
  {
    id: 'home',
    date: '2026-09-03',
    branchId: 'tram-spa',
    employeeId: 'tram-spa-thanh',
    supportEmployeeId: '',
    customerRequested: false,
    services: [{ serviceId: 'body-60', serviceName: 'Body 60' }, { serviceId: 'goi-sach', serviceName: 'Gội' }],
  },
  {
    id: 'tour',
    date: '2026-09-05',
    branchId: 'soc-trang',
    employeeId: 'tram-spa-thanh',
    supportEmployeeId: '',
    customerRequested: true,
    services: [{ serviceId: 'chuyen-sau', serviceName: 'Chuyên sâu' }],
  },
  {
    id: 'support-only',
    date: '2026-09-06',
    branchId: 'tram-spa',
    employeeId: 'other-nv',
    supportEmployeeId: 'tram-spa-thanh',
    customerRequested: false,
    services: [{ serviceId: 'combo-1', serviceName: 'Combo 1' }],
  },
  {
    id: 'other',
    date: '2026-09-04',
    branchId: 'tram-spa',
    employeeId: 'tram-spa-lan-anh',
    supportEmployeeId: '',
    customerRequested: false,
    services: [{ serviceId: 'body-60', serviceName: 'Body 60' }],
  },
]
const kpiOpts = {
  employeeId: 'tram-spa-thanh',
  homeBranchId: 'tram-spa',
  fromDate: '2026-09-01',
  toDate: '2026-09-15',
  policies,
}
const fromAll = computeEmployeeKpi(allInvoices, kpiOpts)
const scoped = allInvoices.filter((inv) =>
  inv.employeeId === 'tram-spa-thanh' || inv.supportEmployeeId === 'tram-spa-thanh',
)
const fromScoped = computeEmployeeKpi(scoped, kpiOpts)
assert.equal(fromAll.overall.counts.totalInvoices, fromScoped.overall.counts.totalInvoices)
assert.equal(fromAll.overall.counts.main, fromScoped.overall.counts.main)
assert.equal(fromAll.overall.counts.addon, fromScoped.overall.counts.addon)
assert.equal(fromAll.overall.counts.advanced, fromScoped.overall.counts.advanced)
assert.equal(fromAll.penalty.kpiPenalty, fromScoped.penalty.kpiPenalty)
assert.equal(fromAll.includedInvoices.some((inv) => inv.branchId === 'soc-trang'), true)
assert.equal(fromAll.includedInvoices.some((inv) => inv.invoiceId === 'support-only'), false)
pass('L. Employee-scoped invoice set matches Admin engine for same employee; tour kept; support not attributed')

const migrateSrc = read('src/utils/invoiceLegacyMigrate.js')
assert.doesNotMatch(migrateSrc, /fetchInvoices\(/)
assert.match(migrateSrc, /fetchInvoicesByIds/)
assert.match(migrateSrc, /scoped\.length === 0/)
assert.match(invoicesRepo, /export async function fetchInvoicesByIds/)
pass('M. Unsynced-local check uses ID fetch; never fetchInvoices() full history')

const remainingUnbounded = []
if (/fetchInvoices\(\)/.test(read('src/utils/dataRecovery.js'))) remainingUnbounded.push('dataRecovery.fetchInvoices')
if (/fetchInvoices\(\)/.test(read('src/utils/legacyCloudSync.js'))) remainingUnbounded.push('legacyCloudSync.fetchInvoices')
if (/fetchInvoices\(\)/.test(read('src/utils/invoiceLegacyMigrate.js'))) remainingUnbounded.push('invoiceLegacyMigrate.fetchInvoices')
assert.deepEqual(remainingUnbounded, ['dataRecovery.fetchInvoices', 'legacyCloudSync.fetchInvoices'])
pass(`Remaining unbounded (recovery/legacy only): ${remainingUnbounded.join(', ')}`)

const BEFORE = {
  idleClientRequestsPerMin: '≥ 2 pullAll (30s) + realtime bursts',
  invoiceRowsPerMin: 'ALL history × 2+/min (paginated 1000/page)',
  fullTableCallsPerMin: '2+ fetchInvoices() + 2+ fetchExpenses()',
}
const AFTER = {
  idleClientRequestsPerMin: '0 invoice/expense full-table; config pull ≤ 0.2/min when visible',
  invoiceRowsPerMin: '0 while idle; screen open = scoped period/branch/employee only',
  fullTableCallsPerMin: 0,
}
assert.equal(AFTER.fullTableCallsPerMin, 0)
console.log('\n  BEFORE estimate:', BEFORE)
console.log('  AFTER estimate:', AFTER)

console.log('\n=== ALL EGRESS HOTFIX CHECKS PASSED ===\n')
console.log(INVOICE_SCOPE_REQUIRED_MESSAGE)
