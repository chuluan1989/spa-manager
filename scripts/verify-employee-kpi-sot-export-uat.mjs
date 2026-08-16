/**
 * UAT — KPI cloud SoT + detail export parity (fixture + optional prod readonly).
 * Không ghi Production.
 *
 *   npm run verify:employee-kpi-sot-export
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { KPI_SCOPE_BRANCH_IDS, KPI_STATUS } from '../src/constants/kpiPolicy.js'
import { buildAdminKpiDashboard, filterAdminKpiRows } from '../src/utils/adminKpiDashboard.js'
import { computeEmployeeKpi } from '../src/utils/employeeKpiEngine.js'
import {
  buildEmployeeKpiDetailExportBundle,
} from '../src/utils/employeeKpiDetailExport.js'
import {
  buildKpiServiceLineRows,
  monthBounds,
} from '../src/utils/employeeKpiView.js'
import { resolveKpiMonthRange } from '../src/utils/kpiInvoiceScope.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_SOT_EXPORT_UAT.json')

const results = []
function check(id, name, pass, detail = {}) {
  results.push({ id, name, pass: Boolean(pass), detail })
  if (!pass) console.error(`FAIL ${id} ${name}`, detail)
  else console.log(`PASS ${id} ${name}`)
}

function inv(partial) {
  return {
    id: partial.id,
    date: partial.date || '2026-08-10',
    branchId: partial.branchId || 'soc-trang',
    employeeId: partial.employeeId || 'emp-lyly',
    employeeName: partial.employeeName || 'Ly Ly',
    customerRequested: Boolean(partial.customerRequested),
    services: partial.services,
  }
}
function line(serviceId, serviceName = serviceId) {
  return { serviceId, serviceName }
}

const augPolicies = KPI_SCOPE_BRANCH_IDS.map((branchId) => ({
  id: `kpi-pol-seed-${branchId}-2026-08-01`,
  branchId,
  effectiveFrom: '2026-08-01',
  addonTarget: 0.7,
  advancedTarget: 0.1,
  comboTarget: 0.3,
  requestedTarget: 0.2,
}))

const employees = [
  { id: 'emp-lyly', name: 'Ly Ly', branchId: 'soc-trang' },
  { id: 'emp-tran', name: 'Bao Tran', branchId: 'soc-trang' },
  { id: 'emp-tram', name: 'Huynh', branchId: 'tram-spa' },
]

const invoices = [
  inv({
    id: 'hd-multi',
    date: '2026-08-03',
    employeeId: 'emp-lyly',
    customerRequested: true,
    services: [line('body-60', 'Body 60'), line('goi-duong-sinh', 'Gội dưỡng sinh'), line('phong-don', 'Phòng đơn')],
  }),
  inv({
    id: 'hd-combo',
    date: '2026-08-05',
    employeeId: 'emp-lyly',
    services: [line('combo-1', 'Combo 1')],
  }),
  inv({
    id: 'hd-xb-tram',
    date: '2026-08-07',
    branchId: 'tram-spa',
    employeeId: 'emp-lyly',
    customerRequested: true,
    services: [line('chuyen-sau', 'Chuyên sâu')],
  }),
  inv({
    id: 'hd-tran',
    date: '2026-08-08',
    employeeId: 'emp-tran',
    services: [line('body-60', 'Body 60'), line('goi-sach', 'Gội sạch')],
  }),
  inv({
    id: 'hd-tram-home',
    date: '2026-08-09',
    branchId: 'tram-spa',
    employeeId: 'emp-tram',
    services: [line('body-60', 'Body 60')],
  }),
  // July — no policy
  inv({
    id: 'hd-jul',
    date: '2026-07-12',
    employeeId: 'emp-lyly',
    services: [line('body-60', 'Body 60'), line('goi-sach', 'Gội sạch')],
  }),
]

{
  const range = resolveKpiMonthRange('2026-08', { now: new Date('2026-08-17T05:00:00+07:00') })
  check('A1', 'August = full month 01→31 (Kỳ1+Kỳ2)', range.fromDate === '2026-08-01'
    && range.toDate === '2026-08-31'
    && range.calendarToDate === '2026-08-31'
    && range.clippedToToday === false
    && range.dataAsOfHint === '2026-08-17', range)
}

{
  const range = resolveKpiMonthRange('2026-07', { now: new Date('2026-08-17T05:00:00+07:00') })
  check('A2', 'July = full month Kỳ1+Kỳ2', range.fromDate === '2026-07-01'
    && range.toDate === '2026-07-31'
    && range.clippedToToday === false, range)
}

const { fromDate, toDate } = monthBounds('2026-08')
const dash = buildAdminKpiDashboard(invoices, {
  fromDate,
  toDate,
  policies: augPolicies,
  employees,
})

check('B1', 'Admin August counts chỉ HĐ Aug (không Jul)', dash.system.counts.totalInvoices === 5, dash.system.counts)

{
  const soc = filterAdminKpiRows(dash.rows, { branchId: 'soc-trang', homeOrServing: 'home' })
  const tram = filterAdminKpiRows(dash.rows, { branchId: 'tram-spa', homeOrServing: 'home' })
  const socIds = soc.map((r) => r.employeeId).sort()
  const tramIds = tram.map((r) => r.employeeId).sort()
  // emp-lyly home ST (có HĐ Trạm) — chỉ roster ST; emp-tran ST; emp-tram chỉ Trạm
  check('C1', 'Sóc Trăng = employee.branchId home', socIds.includes('emp-lyly') && socIds.includes('emp-tran') && !socIds.includes('emp-tram'), { socIds })
  check('C1b', 'Trạm không lẫn Ly Ly (home ST)', !tramIds.includes('emp-lyly') && tramIds.includes('emp-tram'), { tramIds })
  check('C1c', 'Roster ST và Trạm độc lập', JSON.stringify(socIds) !== JSON.stringify(tramIds), { socIds, tramIds })
}

{
  const lyly = dash.rows.find((r) => r.employeeId === 'emp-lyly')
  const empModel = computeEmployeeKpi(invoices, {
    employeeId: 'emp-lyly',
    fromDate,
    toDate,
    policies: augPolicies,
  })
  check('D1', 'Cross-branch Ly Ly serving ST+Trạm', lyly.servingBranchIds.includes('soc-trang')
    && lyly.servingBranchIds.includes('tram-spa'), lyly.servingBranchIds)
  check('D2', 'Employee engine === Admin row model counts', JSON.stringify(empModel.overall.counts) === JSON.stringify(lyly.counts), {
    emp: empModel.overall.counts,
    admin: lyly.counts,
  })
  check('D3', 'Employee engine === Admin missing/status',
    empModel.overall.kpis.addon.missing === lyly.cards.addon.missing
    && empModel.overall.kpis.addon.status === lyly.cards.addon.status
    && empModel.overall.kpis.requested.status === lyly.cards.requested.status, {
      addon: lyly.cards.addon,
      requested: lyly.cards.requested,
    })

  const lines = buildKpiServiceLineRows(empModel.includedInvoices)
  const multi = lines.filter((l) => l.invoiceId === 'hd-multi')
  check('E1', '1 HĐ multi-service → nhiều dòng', multi.length === 3, multi)

  const bundle = buildEmployeeKpiDetailExportBundle(lyly, {
    monthYm: '2026-08',
    fromDate,
    toDate,
    rangeLabel: `${fromDate} → ${toDate}`,
  })
  check('F1', 'Export file stem KPI_Ten_Thang', bundle.meta.fileStem === 'KPI_LyLy_08-2026', bundle.meta)
  check('F2', 'Export parity MAIN/ADDON/…', bundle.parity.main === empModel.overall.counts.main
    && bundle.parity.addon === empModel.overall.counts.addon
    && bundle.parity.advanced === empModel.overall.counts.advanced
    && bundle.parity.combo === empModel.overall.counts.combo
    && bundle.parity.totalInvoices === empModel.overall.counts.totalInvoices
    && bundle.parity.requestedInvoices === empModel.overall.counts.requestedInvoices
    && bundle.parity.missing.addon === empModel.overall.kpis.addon.missing
    && bundle.parity.status.addon === empModel.overall.kpis.addon.status, bundle.parity)
  check('F3', 'Excel sheets đủ 7 nhóm dòng', bundle.sheets.allLines.length === lines.length
    && bundle.sheets.main.length >= 1
    && bundle.sheets.addon.length >= 1
    && bundle.sheets.requested.length >= 1, {
      all: bundle.sheets.allLines.length,
      main: bundle.sheets.main.length,
      addon: bundle.sheets.addon.length,
      requested: bundle.sheets.requested.length,
    })
  check('F4', 'Export không tự tính — cards từ row', bundle.cards[0].missing === lyly.cards.addon.missing
    && bundle.cards[0].status === lyly.cards.addon.status, bundle.cards[0])
}

{
  // Edit service then recompute
  const edited = invoices.map((i) => (i.id === 'hd-combo'
    ? { ...i, services: [line('body-60', 'Body 60'), line('goi-sach', 'Gội sạch')] }
    : i))
  const before = computeEmployeeKpi(invoices, { employeeId: 'emp-lyly', fromDate, toDate, policies: augPolicies })
  const after = computeEmployeeKpi(edited, { employeeId: 'emp-lyly', fromDate, toDate, policies: augPolicies })
  check('G1', 'Edit dịch vụ → counts đổi', before.overall.counts.combo !== after.overall.counts.combo
    || before.overall.counts.addon !== after.overall.counts.addon, {
      before: before.overall.counts,
      after: after.overall.counts,
    })
  const deleted = edited.filter((i) => i.id !== 'hd-xb-tram')
  const afterDel = computeEmployeeKpi(deleted, { employeeId: 'emp-lyly', fromDate, toDate, policies: augPolicies })
  check('G2', 'Delete HĐ → không còn trong included', !afterDel.includedInvoices.some((x) => x.invoiceId === 'hd-xb-tram')
    && afterDel.overall.counts.totalInvoices === after.overall.counts.totalInvoices - 1, {
      afterDel: afterDel.overall.counts,
    })
}

{
  const jul = monthBounds('2026-07')
  const model = computeEmployeeKpi(invoices, {
    employeeId: 'emp-lyly',
    fromDate: jul.fromDate,
    toDate: jul.toDate,
    policies: augPolicies, // Aug policy must NOT apply to July
  })
  check('H1', 'July + chỉ policy Aug → NO_POLICY raw counts', model.overall.counts.main === 1
    && model.overall.counts.addon === 1
    && model.overall.kpis.addon.status === KPI_STATUS.NO_POLICY
    && model.overall.kpis.addon.target == null, model.overall)
}

{
  // Perf: one dashboard build = one group pass (no N+1 fetch in pure compute)
  const t0 = Date.now()
  const d = buildAdminKpiDashboard(invoices, { fromDate, toDate, policies: augPolicies, employees })
  const ms = Date.now() - t0
  check('I1', '1 buildAdminKpiDashboard cho nhiều NV (no N+1)', d.rows.length === 3 && ms < 200, {
    rows: d.rows.length,
    ms,
  })
}

mkdirSync(dirname(OUT), { recursive: true })
const failed = results.filter((r) => !r.pass)
writeFileSync(OUT, JSON.stringify({
  passed: failed.length === 0,
  failed: failed.length,
  results,
}, null, 2))
console.log(`\n${failed.length ? 'FAIL' : 'PASS'} ${results.length - failed.length}/${results.length} → ${OUT}`)
if (failed.length) process.exit(1)
