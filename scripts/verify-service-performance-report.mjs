/**
 * Service performance report — local fixtures only.
 * Run: npx vite-node scripts/verify-service-performance-report.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import {
  fetchAllInvoiceRows,
  INVOICE_FETCH_PAGE_SIZE,
  INVOICE_SERVICE_LINE_COLUMNS,
} from '../src/repositories/invoicesRepository.js'
import {
  buildEmployeeServiceDetail,
  buildEmployeeServiceRanking,
  buildServiceBranchReport,
  resolveServicePerformanceAccess,
  serviceOccurrenceKey,
} from '../src/utils/servicePerformanceReport.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const results = []

function check(id, name, pass, detail = {}) {
  results.push({ id, name, pass: Boolean(pass) })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}`)
  if (!pass) console.error(detail)
}

const catalog = {
  'soc-trang': [
    { id: 'body-60', name: 'Body 60', sortOrder: 0 },
    { id: 'combo-1', name: 'Combo 1', sortOrder: 1 },
    { id: 'foot', name: 'Foot', sortOrder: 2 },
  ],
  'tram-spa': [
    { id: 'combo-1', name: "Combo Body 60' + Gội 30'", sortOrder: 0 },
    { id: 'body-60', name: 'Body 60', sortOrder: 1 },
  ],
}
const branchNames = { 'soc-trang': 'Sóc Trăng', 'tram-spa': 'Trạm Spa' }
const employees = [
  { id: 'emp-a', name: 'An', branchId: 'soc-trang', status: 'active' },
  { id: 'emp-b', name: 'Binh', branchId: 'soc-trang', status: 'active' },
  { id: 'emp-c', name: 'Chi', branchId: 'tram-spa', status: 'active' },
  {
    id: 'emp-zero',
    name: 'Dung',
    branchId: 'soc-trang',
    status: 'active',
    branchHistory: [],
  },
]

function line(id, name, price, originalPrice = price) {
  return { id, serviceId: id, name, price, originalPrice, discountAmount: originalPrice - price }
}

const multi = {
  id: 'inv-multi',
  date: '2026-10-03',
  branchId: 'soc-trang',
  branchName: 'Sóc Trăng',
  employeeId: 'emp-a',
  employeeName: 'An',
  supportEmployeeId: 'emp-b',
  supportEmployeeName: 'Binh',
  services: [
    line('body-60', 'Body 60', 150000, 189000),
    line('combo-1', 'Combo 1', 240000, 258000),
    line('foot', 'Foot', 189000, 189000),
  ],
  serviceTotal: 150000 + 240000 + 189000,
  tips: 50000,
  total: 150000 + 240000 + 189000 + 50000,
}

const tour = {
  id: 'inv-tour',
  date: '2026-10-08',
  branchId: 'tram-spa',
  branchName: 'Trạm Spa',
  employeeId: 'emp-a',
  employeeName: 'An',
  services: [line('combo-1', "Combo Body 60' + Gội 30'", 240000)],
  serviceTotal: 240000,
  tips: 0,
}

const historical = {
  id: 'inv-old',
  date: '2026-10-04',
  branchId: 'soc-trang',
  employeeId: 'emp-a',
  services: [line('goi-cu', 'Gội đầu cũ', 50000)],
  serviceTotal: 50000,
}

const sameName = {
  id: 'inv-alias',
  date: '2026-10-05',
  branchId: 'soc-trang',
  employeeId: 'emp-a',
  services: [line('body-60-legacy', 'Body 60', 100000)],
  serviceTotal: 100000,
}

const orphan = {
  id: 'inv-orphan',
  date: '2026-10-06',
  branchId: 'soc-trang',
  employeeId: '',
  services: [line('foot', 'Foot', 189000)],
  serviceTotal: 189000,
}

const mismatch = {
  id: 'inv-mismatch',
  date: '2026-10-07',
  branchId: 'soc-trang',
  employeeId: 'emp-a',
  services: [line('body-60', 'Body 60', 100000)],
  serviceTotal: 180000,
}

const outside = {
  id: 'inv-sep',
  date: '2026-09-20',
  branchId: 'soc-trang',
  employeeId: 'emp-a',
  services: [line('body-60', 'Body 60', 999000)],
  serviceTotal: 999000,
}

const moved = {
  id: 'emp-moved',
  name: 'Em',
  branchId: 'soc-trang',
  branchHistory: [{
    effectiveDate: '2026-10-01',
    fromBranchId: 'tram-spa',
    toBranchId: 'soc-trang',
  }],
}
const beforeMove = {
  id: 'inv-before-move',
  date: '2026-09-20',
  branchId: 'tram-spa',
  employeeId: 'emp-moved',
  services: [line('combo-1', "Combo Body 60' + Gội 30'", 240000)],
  serviceTotal: 240000,
}

const invoices = [multi, tour, historical, sameName, orphan, mismatch, outside]

const serviceReport = buildServiceBranchReport({
  invoices,
  servingBranchId: 'soc-trang',
  fromDate: '2026-10-01',
  toDate: '2026-10-31',
  catalogByBranch: catalog,
  branchNames,
})

const body = serviceReport.rows.find((row) => row.serviceId === 'body-60' && row.branchId === 'soc-trang')
const combo = serviceReport.rows.find((row) => row.serviceId === 'combo-1' && row.branchId === 'soc-trang')
const oldHair = serviceReport.rows.find((row) => row.serviceId === 'goi-cu')
const legacyBody = serviceReport.rows.find((row) => row.serviceId === 'body-60-legacy')
const tramComboInSoc = serviceReport.rows.find((row) => row.branchId === 'tram-spa')

check('1', 'One invoice with multiple services counts each line', body?.quantity === 2 && combo?.quantity === 1, serviceReport.rows)
check('2', 'Discounted revenue uses price after discount and excludes tips', body?.revenue === 150000 + 100000 && !serviceReport.rows.some((row) => row.revenue === 50000 && row.serviceId === 'tips'), { body })
check('3', 'Combo is one service occurrence', combo?.quantity === 1 && combo?.revenue === 240000, combo)
check('6', 'Historical service removed from catalog still appears', oldHair?.quantity === 1 && oldHair?.name === 'Gội đầu cũ', oldHair)
check('7', 'Same name with different ids stays split', legacyBody && legacyBody.key !== body.key && legacyBody.quantity === 1, { body, legacyBody })
check('8a', 'Serving-branch report does not pull another branch row', !tramComboInSoc, serviceReport.rows.map((row) => row.key))

const allBranches = buildServiceBranchReport({
  invoices,
  servingBranchId: '',
  fromDate: '2026-10-01',
  toDate: '2026-10-31',
  catalogByBranch: catalog,
  branchNames,
})
const socCombo = allBranches.rows.find((row) => row.key === serviceOccurrenceKey('soc-trang', { id: 'combo-1' }))
const tramCombo = allBranches.rows.find((row) => row.key === serviceOccurrenceKey('tram-spa', { id: 'combo-1' }))
check('8', 'Same id with different branch meanings is not merged', socCombo && tramCombo && socCombo.quantity === 1 && tramCombo.quantity === 1 && socCombo.name !== tramCombo.name, { socCombo, tramCombo })

check('9', 'Invoice missing employee_id still counts service revenue', serviceReport.missingEmployeeInvoiceCount === 1 && serviceReport.rows.find((row) => row.serviceId === 'foot')?.quantity === 2, serviceReport)
check('11', 'Date range drops invoices outside the period', !serviceReport.rows.some((row) => row.revenue === 999000), serviceReport)
check('13', 'Header service_total mismatch is reported and line revenue is kept', serviceReport.discrepancies.some((row) => row.invoiceId === 'inv-mismatch' && row.lineSum === 100000 && row.serviceTotal === 180000) && body.revenue === 250000, serviceReport.discrepancies)

const ranking = buildEmployeeServiceRanking({
  invoices,
  employees,
  homeBranchId: 'soc-trang',
  fromDate: '2026-10-01',
  toDate: '2026-10-31',
  catalogByBranch: catalog,
  branchNames,
})
const an = ranking.rows.find((row) => row.employeeId === 'emp-a')
const binh = ranking.rows.find((row) => row.employeeId === 'emp-b')
const dung = ranking.rows.find((row) => row.employeeId === 'emp-zero')
const chi = ranking.rows.find((row) => row.employeeId === 'emp-c')
check('4', 'Cross-branch work stays on the home employee', an && an.quantities[serviceOccurrenceKey('tram-spa', { id: 'combo-1' })] === 1 && an.crossBranchInvoiceCount === 1, an)
check('5', 'Support employee does not receive duplicate credit', binh && binh.quantity === 0 && binh.revenue === 0 && an.quantity > binh.quantity, { an, binh })
check('10', 'Employee with zero invoices remains in the ranking', dung && dung.quantity === 0 && dung.revenue === 0, dung)
check('12a', 'Home branch filter hides employees of another branch', !chi, ranking.rows.map((row) => row.employeeId))

const byBody = buildEmployeeServiceRanking({
  invoices,
  employees,
  homeBranchId: 'soc-trang',
  fromDate: '2026-10-01',
  toDate: '2026-10-31',
  catalogByBranch: catalog,
  branchNames,
  sortKey: `svc:${serviceOccurrenceKey('soc-trang', { id: 'body-60' })}`,
  sortDir: 'desc',
})
check('sort', 'Ranking can sort by a service quantity', byBody.rows[0].employeeId === 'emp-a' && byBody.rows[0].rank === 1, byBody.rows.map((row) => [row.rank, row.employeeId]))

const detail = buildEmployeeServiceDetail({
  invoices,
  employee: employees[0],
  fromDate: '2026-10-01',
  toDate: '2026-10-31',
  catalogByBranch: catalog,
  branchNames,
})
check('detail', 'Employee detail keeps serving branches and cross-branch count', detail.crossBranchInvoiceCount === 1 && detail.servingBranches.some((branch) => branch.branchId === 'tram-spa') && detail.revenue === an.revenue, detail)

const historyDetail = buildEmployeeServiceDetail({
  invoices: [beforeMove, tour.employeeId ? { ...tour, employeeId: 'emp-moved', date: '2026-10-08' } : tour],
  employee: moved,
  fromDate: '2026-09-01',
  toDate: '2026-10-31',
  catalogByBranch: catalog,
  branchNames,
})
check('4b', 'Cross-branch uses home branch on the invoice date', historyDetail.crossBranchInvoiceCount === 1, historyDetail)

const manager = resolveServicePerformanceAccess({
  admin: false,
  sessionBranchId: 'soc-trang',
  requestedBranchId: 'tram-spa',
})
const adminAll = resolveServicePerformanceAccess({ admin: true, requestedBranchId: '' })
check('12', 'Manager ranking stays on the session home branch', manager.servingBranchId === 'soc-trang' && manager.homeBranchId === 'soc-trang' && manager.branchSelectable === false && adminAll.servingBranchId === '' && adminAll.blocked === false, { manager, adminAll })

const wide = Array.from({ length: INVOICE_FETCH_PAGE_SIZE + 1 }, (_, index) => ({ id: `row-${index}` }))
let pages = 0
const paged = await fetchAllInvoiceRows(() => ({
  range(from, to) {
    pages += 1
    return Promise.resolve({ data: wide.slice(from, to + 1), error: null })
  },
}))
check('14', 'Invoice paging continues past 1000 rows', pages === 2 && paged.length === INVOICE_FETCH_PAGE_SIZE + 1, { pages, length: paged.length })

const repoSrc = readFileSync(join(ROOT, 'src/repositories/invoicesRepository.js'), 'utf8')
const hookSrc = readFileSync(join(ROOT, 'src/hooks/useServicePerformanceData.js'), 'utf8')
const pageSrc = readFileSync(join(ROOT, 'src/pages/Report.jsx'), 'utf8')
const panelSrc = readFileSync(join(ROOT, 'src/components/report/ServicePerformanceReport.jsx'), 'utf8')
const navSrc = readFileSync(join(ROOT, 'src/constants/navigation.js'), 'utf8')
const fetchStart = repoSrc.indexOf('export async function fetchInvoiceServiceLines')
const fetchSrc = repoSrc.slice(fetchStart, repoSrc.indexOf('const UNSYNCED_CHECK_COLUMNS'))
const otherRepoSrc = repoSrc.slice(0, fetchStart)
check('15', 'Service report query is date-scoped, narrow, and not realtime', INVOICE_SERVICE_LINE_COLUMNS.includes('services')
  && INVOICE_SERVICE_LINE_COLUMNS.includes('service_total')
  && !INVOICE_SERVICE_LINE_COLUMNS.includes('tips')
  && !INVOICE_SERVICE_LINE_COLUMNS.includes('home_branch_id')
  && !fetchSrc.includes('home_branch_id')
  && !fetchSrc.includes("select('*')")
  && !fetchSrc.includes('select("*")')
  && fetchSrc.includes('fetchAllInvoiceRows')
  && fetchSrc.includes(".gte('date'")
  && hookSrc.includes('employeeIds')
  && !hookSrc.includes('subscribeInvoicesChanges')
  && !hookSrc.includes('setInterval')
  && !hookSrc.includes('fetchInvoices(')
  && pageSrc.includes('Dịch vụ & xếp hạng')
  && pageSrc.includes("mode === 'service-performance'")
  && !navSrc.includes('service-performance')
  && otherRepoSrc.includes('home_branch_id'), { columns: INVOICE_SERVICE_LINE_COLUMNS })

check('17', 'Service report tab and panel are admin-only', pageSrc.includes('{isAdmin() && (')
  && pageSrc.includes("mode === 'service-performance' && isAdmin()")
  && panelSrc.includes('if (!admin)')
  && panelSrc.includes('enabled: admin')
  && panelSrc.includes('Không có quyền truy cập')
  && panelSrc.includes('Báo cáo dịch vụ và xếp hạng chỉ dành cho Admin.'), { tab: pageSrc.includes('Dịch vụ & xếp hạng') })

check('16', 'Employee detail hides the cross-branch invoice count', !panelSrc.includes('crossBranchInvoiceCount')
  && !panelSrc.includes('hóa đơn làm ở chi nhánh khác')
  && panelSrc.includes('Chi nhánh thực hiện')
  && panelSrc.includes('detail.quantity')
  && panelSrc.includes('formatCurrency(detail.revenue)')
  && panelSrc.includes('canSelectBranch()')
  && panelSrc.includes('svc-perf__lock'), panelSrc.slice(panelSrc.indexOf('Chi tiết nhân viên'), panelSrc.indexOf('Chi tiết nhân viên') + 500))

const failed = results.filter((row) => !row.pass)
console.log(`\n${results.length - failed.length}/${results.length}`)
if (failed.length) process.exit(1)
