/**
 * B2 Employee KPI — fixture + view-model UAT (no Production writes).
 * Run: vite-node scripts/verify-employee-kpi-b2-uat.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { ROLES } from '../src/constants/roles.js'
import { EMPLOYEE_NAV_ORDER, NAV_ITEMS } from '../src/constants/navigation.js'
import { KPI_STATUS } from '../src/constants/kpiPolicy.js'
import { computeEmployeeKpi } from '../src/utils/employeeKpiEngine.js'
import {
  buildDrillRows,
  buildKpiCardModel,
  currentMonthYm,
  monthBounds,
  summarizeOverallKpis,
  EMPLOYEE_KPI_CARD_DEFS,
} from '../src/utils/employeeKpiView.js'
import { saveCurrentUser, clearCurrentUser } from '../src/utils/authStorage.js'
import { getVisibleNavItems, canAccessEmployeeKpiPage } from '../src/constants/auth.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_B2_UAT.json')
const results = []

function check(id, name, pass, detail = {}) {
  results.push({ id, name, pass: Boolean(pass), detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}`)
  if (!pass) console.error(detail)
}

function inv(p) {
  return {
    id: p.id,
    date: p.date || '2026-08-10',
    branchId: p.branchId || 'soc-trang',
    employeeId: p.employeeId || 'emp-self',
    supportEmployeeId: p.supportEmployeeId || '',
    customerRequested: Boolean(p.customerRequested),
    services: p.services,
  }
}
function line(serviceId, serviceName = serviceId) {
  return { serviceId, serviceName }
}

const policies = [
  {
    id: 'p-st',
    branchId: 'soc-trang',
    effectiveFrom: '2026-08-01',
    addonTarget: 0.7,
    advancedTarget: 0.1,
    comboTarget: 0.3,
    requestedTarget: 0.2,
  },
  {
    id: 'p-tram',
    branchId: 'tram-spa',
    effectiveFrom: '2026-08-01',
    addonTarget: 0.7,
    advancedTarget: 0.1,
    comboTarget: 0.3,
    requestedTarget: 0.2,
  },
]

const live = [
  inv({ id: 'a1', services: [line('body-60'), line('goi-sach'), line('phong-don')] }),
  inv({ id: 'a2', services: [line('body-60'), line('combo-1')], customerRequested: true }),
  inv({ id: 'a3', branchId: 'tram-spa', services: [line('body-60')] }),
  inv({
    id: 'other',
    employeeId: 'emp-other',
    services: [line('body-60'), line('goi-sach'), line('goi-sach'), line('goi-sach')],
  }),
  inv({
    id: 'gl',
    branchId: 'gia-lai-1',
    services: [line('body-60'), line('goi-sach')],
  }),
  inv({
    id: 'sup',
    employeeId: 'emp-other',
    supportEmployeeId: 'emp-self',
    services: [line('body-60'), line('chuyen-sau')],
  }),
]

const model = computeEmployeeKpi(live, {
  employeeId: 'emp-self',
  fromDate: '2026-08-01',
  toDate: '2026-08-31',
  policies,
})
const summary = summarizeOverallKpis(model.overall)

check(1, 'Employee chỉ thấy KPI mình', model.overall.counts.totalInvoices === 3 && model.skippedOtherEmployee >= 2, model.overall.counts)
check(2, '4 KPI cards từ engine B1', summary.cards.length === 4 && summary.cards.every((c) => EMPLOYEE_KPI_CARD_DEFS.some((d) => d.key === c.key)), summary.cards.map((c) => c.key))
check(3, 'Missing ADDON đúng', summary.cards.find((c) => c.key === 'addon').missing === Math.max(0, Math.ceil(3 * 0.7 - 2)), summary.cards.find((c) => c.key === 'addon'))
check(4, 'MAIN=0 hiển thị CHƯA ĐỦ DỮ LIỆU', (() => {
  const emptyMain = computeEmployeeKpi([inv({ id: 'z', services: [line('goi-sach')] })], {
    employeeId: 'emp-self',
    fromDate: '2026-08-01',
    toDate: '2026-08-31',
    policies,
  })
  const card = buildKpiCardModel(EMPLOYEE_KPI_CARD_DEFS[0], emptyMain.overall.kpis.addon, emptyMain.overall.counts)
  return card.status === KPI_STATUS.INSUFFICIENT_DATA && /MAIN = 0|Chưa có dịch vụ chính/.test(card.missingText)
})(), {})
check(5, 'Requested=0 hiển thị đúng', (() => {
  const m = computeEmployeeKpi([inv({ id: 'r0', services: [line('body-60')] })], {
    employeeId: 'emp-self', fromDate: '2026-08-01', toDate: '2026-08-31', policies,
  })
  const card = buildKpiCardModel(EMPLOYEE_KPI_CARD_DEFS[3], m.overall.kpis.requested, m.overall.counts)
  return card.actual === 0 && card.status === KPI_STATUS.NOT_MET && card.missing === 1
})(), {})
check(6, 'Cross-branch segments', model.servingBranchSegments.length === 2
  && model.servingBranchSegments.some((s) => s.servingBranchId === 'soc-trang')
  && model.servingBranchSegments.some((s) => s.servingBranchId === 'tram-spa'), model.servingBranchSegments.map((s) => s.servingBranchId))
check(7, 'Policy theo ngày serving branch', model.policySegments.every((p) => p.targets.addon === 0.7), model.policySegments)
check(8, 'Tháng trước dùng policy lịch sử', (() => {
  const hist = [
    { id: 'old', branchId: 'soc-trang', effectiveFrom: '2026-07-01', effectiveTo: '2026-07-31', addonTarget: 0.5, advancedTarget: 0.1, comboTarget: 0.3, requestedTarget: 0.2 },
    ...policies,
  ]
  const m = computeEmployeeKpi([inv({ id: 'jul', date: '2026-07-15', services: [line('body-60')] })], {
    employeeId: 'emp-self', fromDate: '2026-07-01', toDate: '2026-07-31', policies: hist,
  })
  return m.policySegments[0]?.targets.addon === 0.5 && m.policySegments[0]?.policyId === 'old'
})(), {})

{
  const arr = [inv({ id: 'mut', services: [line('body-60')] })]
  const c1 = computeEmployeeKpi(arr, { employeeId: 'emp-self', fromDate: '2026-08-01', toDate: '2026-08-31', policies })
  arr[0] = inv({ id: 'mut', services: [line('body-60'), line('goi-sach')], customerRequested: true })
  const c2 = computeEmployeeKpi(arr, { employeeId: 'emp-self', fromDate: '2026-08-01', toDate: '2026-08-31', policies })
  arr.splice(0, 1)
  const c3 = computeEmployeeKpi(arr, { employeeId: 'emp-self', fromDate: '2026-08-01', toDate: '2026-08-31', policies })
  check(9, 'Invoice create → KPI tăng', c1.overall.counts.main === 1, c1.overall.counts)
  check(10, 'Invoice edit → KPI đổi', c2.overall.counts.addon === 1 && c2.overall.counts.requestedInvoices === 1, c2.overall.counts)
  check(11, 'Invoice delete → KPI giảm', c3.overall.counts.totalInvoices === 0, c3.overall.counts)
  check(12, 'customerRequested toggle → KPI đổi', c1.overall.counts.requestedInvoices === 0 && c2.overall.counts.requestedInvoices === 1, {})
}

check(13, 'Gia Lai không tính', model.excludedGiaLaiInvoices === 1 && !model.includedInvoices.some((i) => i.branchId.startsWith('gia-lai')), { excluded: model.excludedGiaLaiInvoices })
check(14, 'Support không tính', !model.includedInvoices.some((i) => i.invoiceId === 'sup'), {})
check(15, 'Recompute deterministic (refresh)', (() => {
  const a = JSON.stringify(computeEmployeeKpi(live, { employeeId: 'emp-self', fromDate: '2026-08-01', toDate: '2026-08-31', policies }).overall)
  const b = JSON.stringify(computeEmployeeKpi(live, { employeeId: 'emp-self', fromDate: '2026-08-01', toDate: '2026-08-31', policies }).overall)
  return a === b
})(), {})

{
  const payroll = readFileSync(join(ROOT, 'src/utils/payrollEngine.js'), 'utf8')
  const page = readFileSync(join(ROOT, 'src/pages/EmployeeKpi.jsx'), 'utf8')
  check(16, 'Employee KPI page không ghi payroll; payroll engine đọc KPI penalty', !page.includes('payrollEngine') && !page.includes('PayrollKpiModal') && payroll.includes('computeKpiPenaltyFromModel'), {})
}

{
  const css = readFileSync(join(ROOT, 'src/pages/EmployeeKpi.css'), 'utf8')
  check(17, 'Mobile CSS có breakpoint', css.includes('@media (max-width: 760px)'), {})
}

{
  clearCurrentUser()
  saveCurrentUser({ id: 'u1', role: ROLES.EMPLOYEE, employeeId: 'emp-self', name: 'Self', branchId: 'soc-trang' })
  const nav = getVisibleNavItems(ROLES.EMPLOYEE)
  const hasKpi = nav.some((i) => i.id === 'employee-kpi')
  const orderOk = EMPLOYEE_NAV_ORDER.indexOf('employee-kpi') === EMPLOYEE_NAV_ORDER.indexOf('invoices') + 1
  check('N1', 'Sidebar nhân viên có KPI sau Hóa đơn', hasKpi && orderOk && canAccessEmployeeKpiPage(ROLES.EMPLOYEE), {
    ids: nav.map((i) => i.id),
    orderOk,
  })
  saveCurrentUser({ id: 'admin', role: ROLES.ADMIN, name: 'Admin' })
  const adminNav = getVisibleNavItems(ROLES.ADMIN)
  check('N2', 'Admin không dùng menu employee-kpi (Admin dùng admin-kpi ở B3)', !adminNav.some((i) => i.id === 'employee-kpi') && !canAccessEmployeeKpiPage(ROLES.ADMIN), {
    ids: adminNav.map((i) => i.id),
  })
  clearCurrentUser()
}

{
  const rows = buildDrillRows(model.includedInvoices, 'addon')
  check('D1', 'Drill-down DV phụ có ngày/HĐ/CN', rows.length >= 1 && rows.every((r) => r.date && r.invoiceId && r.branchId), { n: rows.length })
  const req = buildDrillRows(model.includedInvoices, 'requested')
  check('D2', 'Drill-down requested có Có/Không', req.some((r) => r.customerRequested) && req.some((r) => !r.customerRequested), { n: req.length })
}

{
  const invCss = readFileSync(join(ROOT, 'src/pages/Invoice.css'), 'utf8')
  const invJsx = readFileSync(join(ROOT, 'src/pages/Invoice.jsx'), 'utf8')
  check('CR1', 'Checkbox khách yêu cầu nổi bật', invCss.includes('invoice__field--requested') && invJsx.includes('invoice__field--requested'), {})
}

{
  const bounds = monthBounds('2026-08')
  check('M1', 'Month bounds Aug', bounds.fromDate === '2026-08-01' && bounds.toDate === '2026-08-31', bounds)
  check('M2', 'currentMonthYm format', /^\d{4}-\d{2}$/.test(currentMonthYm()), { v: currentMonthYm() })
}

{
  const navItem = NAV_ITEMS.find((i) => i.id === 'employee-kpi')
  check('N3', 'NAV_ITEMS KPI label', navItem?.label === 'KPI', navItem)
}

mkdirSync(dirname(OUT), { recursive: true })
const failed = results.filter((r) => !r.pass)
writeFileSync(OUT, JSON.stringify({ passed: failed.length === 0, failed: failed.length, results }, null, 2))
console.log(`\n${failed.length ? 'FAIL' : 'PASS'} ${results.length - failed.length}/${results.length} → ${OUT}`)
process.exit(failed.length ? 1 : 0)
