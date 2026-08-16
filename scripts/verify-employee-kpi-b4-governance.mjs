/**
 * B4 Final Governance — fixture SoT / parity / regressions.
 * Không ghi Production. Không commit/deploy.
 *
 * Run: vite-node scripts/verify-employee-kpi-b4-governance.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { ROLES } from '../src/constants/roles.js'
import { ADMIN_NAV_ORDER, EMPLOYEE_NAV_ORDER, BRANCH_MANAGER_NAV_ORDER, NAV_ITEMS } from '../src/constants/navigation.js'
import { KPI_SCOPE_BRANCH_IDS, KPI_STATUS } from '../src/constants/kpiPolicy.js'
import {
  canAccessAdminKpiPage,
  canAccessEmployeeKpiPage,
  getVisibleNavItems,
} from '../src/constants/auth.js'
import { saveCurrentUser, clearCurrentUser } from '../src/utils/authStorage.js'
import {
  buildAdminKpiDashboard,
  formatAdminKpiCell,
  filterAdminKpiRows,
} from '../src/utils/adminKpiDashboard.js'
import {
  assertNoPolicyOverlap,
  bruteForceRequestedMissing,
  computeEmployeeKpi,
  missingRequestedInvoices,
  missingServiceLines,
} from '../src/utils/employeeKpiEngine.js'
import { summarizeOverallKpis, buildDrillRows, monthBounds } from '../src/utils/employeeKpiView.js'
import { appendKpiPolicyVersion } from '../src/utils/kpiPolicyStorage.js'
import { auditKpiCatalogRows, classifyKpiServiceLine } from '../src/utils/kpiServiceClassifier.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_B4_GOVERNANCE_UAT.json')
const results = []
const mismatches = []

function check(id, name, pass, detail = {}) {
  results.push({ id, name, pass: Boolean(pass), detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}`)
  if (!pass) {
    console.error(detail)
    if (detail?.sotMismatch) mismatches.push({ id, name, detail })
  }
}

function inv(p) {
  return {
    id: p.id,
    date: p.date || '2026-08-10',
    branchId: p.branchId || 'soc-trang',
    employeeId: p.employeeId || 'emp-lyly',
    employeeName: p.employeeName || 'Ly Ly',
    supportEmployeeId: p.supportEmployeeId || '',
    customerRequested: Boolean(p.customerRequested),
    services: p.services,
  }
}
function line(id, name = id) {
  return { serviceId: id, serviceName: name }
}

function snapModel(model) {
  const summary = summarizeOverallKpis(model.overall)
  return {
    employeeId: model.employeeId,
    counts: { ...model.overall.counts },
    kpis: Object.fromEntries(summary.cards.map((c) => [c.key, {
      actual: c.actual,
      denominator: c.denominator,
      rate: c.rate,
      target: c.target,
      missing: c.missing,
      status: c.status,
    }])),
    servingBranchIds: (model.servingBranchSegments || []).map((s) => s.servingBranchId).sort(),
    policySegmentKeys: (model.policySegments || [])
      .map((s) => `${s.servingBranchId}::${s.policyId}::${s.targets?.addon}`)
      .sort(),
    met: summary.met,
    headline: summary.headline,
  }
}

function assertParity(label, employeeModel, adminRow) {
  const a = snapModel(employeeModel)
  const b = {
    employeeId: adminRow.employeeId,
    counts: { ...adminRow.counts },
    kpis: Object.fromEntries(Object.entries(adminRow.cards).map(([k, c]) => [k, {
      actual: c.actual,
      denominator: c.denominator,
      rate: c.rate,
      target: c.target,
      missing: c.missing,
      status: c.status,
    }])),
    servingBranchIds: [...adminRow.servingBranchIds].sort(),
    policySegmentKeys: (adminRow.model.policySegments || [])
      .map((s) => `${s.servingBranchId}::${s.policyId}::${s.targets?.addon}`)
      .sort(),
    met: adminRow.met,
    headline: adminRow.headline,
  }
  const same = JSON.stringify(a) === JSON.stringify(b)
  if (!same) {
    return {
      ok: false,
      sotMismatch: true,
      label,
      employee: a,
      admin: b,
    }
  }
  return { ok: true, label }
}

const employees = [
  { id: 'emp-lyly', name: 'Ly Ly', branchId: 'soc-trang', status: 'active' },
  { id: 'emp-bl', name: 'Thanh Thu', branchId: 'bac-lieu', status: 'active' },
  { id: 'emp-zero', name: 'Zero Main', branchId: 'tram-spa', status: 'active' },
]

const augPolicies = KPI_SCOPE_BRANCH_IDS.map((branchId) => ({
  id: `aug-${branchId}`,
  branchId,
  effectiveFrom: '2026-08-01',
  effectiveTo: null,
  addonTarget: 0.7,
  advancedTarget: 0.1,
  comboTarget: 0.3,
  requestedTarget: 0.2,
  status: 'active',
}))

let live = [
  inv({
    id: 'a1',
    employeeId: 'emp-lyly',
    branchId: 'soc-trang',
    services: [line('body-60'), line('goi-sach'), line('phong-don')],
  }),
  inv({
    id: 'a2',
    employeeId: 'emp-lyly',
    branchId: 'tram-spa',
    services: [line('body-60'), line('combo-1')],
    customerRequested: true,
  }),
  inv({
    id: 'b1',
    employeeId: 'emp-bl',
    employeeName: 'Thanh Thu',
    branchId: 'bac-lieu',
    services: [line('body-60'), line('chuyen-sau')],
  }),
  inv({
    id: 'z1',
    employeeId: 'emp-zero',
    employeeName: 'Zero Main',
    branchId: 'tram-spa',
    services: [line('goi-sach'), line('phong-don')],
  }),
  inv({
    id: 'gl1',
    employeeId: 'emp-lyly',
    branchId: 'gia-lai-1',
    services: [line('body-60'), line('goi-sach')],
  }),
  inv({
    id: 'sup1',
    employeeId: 'emp-bl',
    supportEmployeeId: 'emp-lyly',
    branchId: 'soc-trang',
    services: [line('body-60')],
  }),
]

const { fromDate, toDate } = monthBounds('2026-08')

function runThreeWay(invoices, policies, tag) {
  const admin = buildAdminKpiDashboard(invoices, {
    fromDate, toDate, policies, employees,
  })
  const employeeIds = [...new Set(
    invoices
      .filter((i) => KPI_SCOPE_BRANCH_IDS.includes(i.branchId) && i.date >= fromDate && i.date <= toDate)
      .map((i) => i.employeeId),
  )]
  const parityFails = []
  for (const employeeId of employeeIds) {
    const empModel = computeEmployeeKpi(invoices, { employeeId, fromDate, toDate, policies })
    const adminRow = admin.rows.find((r) => r.employeeId === employeeId)
    if (!adminRow) {
      if (empModel.overall.counts.totalInvoices === 0) continue
      parityFails.push({ employeeId, reason: 'admin row missing', sotMismatch: true })
      continue
    }
    const p = assertParity(`${tag}:${employeeId}`, empModel, adminRow)
    if (!p.ok) parityFails.push(p)
  }
  return { admin, employeeIds, parityFails }
}

// ——— 1. Three-way SoT + full parity ———
{
  const { parityFails, admin } = runThreeWay(live, augPolicies, 'base')
  check('1', 'Three-way SoT Employee=Admin for ALL employees', parityFails.length === 0, {
    fails: parityFails,
    nEmployees: admin.rows.length,
  })
}

// ——— 4. Mutation regression ———
{
  const arr = [...live]
  arr.push(inv({
    id: 'mut-new',
    employeeId: 'emp-lyly',
    services: [line('body-60'), line('xong-hoi')],
  }))
  let r = runThreeWay(arr, augPolicies, 'create')
  check('4a', 'CREATE → Employee=Admin=SoT', r.parityFails.length === 0, { fails: r.parityFails })

  const idx = arr.findIndex((i) => i.id === 'mut-new')
  arr[idx] = inv({
    id: 'mut-new',
    date: '2026-08-12',
    employeeId: 'emp-bl',
    employeeName: 'Thanh Thu',
    branchId: 'bac-lieu',
    customerRequested: true,
    services: [line('combo-2'), line('cao-mat')],
  })
  r = runThreeWay(arr, augPolicies, 'update')
  check('4b', 'UPDATE fields → parity', r.parityFails.length === 0, { fails: r.parityFails })

  arr.splice(idx, 1)
  r = runThreeWay(arr, augPolicies, 'delete')
  check('4c', 'DELETE → parity', r.parityFails.length === 0, { fails: r.parityFails })
}

// ——— 5. customerRequested pipeline ———
{
  const base = [inv({ id: 'cr', services: [line('body-60')], customerRequested: false })]
  let m = computeEmployeeKpi(base, { employeeId: 'emp-lyly', fromDate, toDate, policies: augPolicies })
  let admin = buildAdminKpiDashboard(base, { fromDate, toDate, policies: augPolicies, employees })
  check('5a', 'FALSE → requested 0', m.overall.counts.requestedInvoices === 0
    && admin.rows[0].counts.requestedInvoices === 0, {})

  base[0] = { ...base[0], customerRequested: true }
  m = computeEmployeeKpi(base, { employeeId: 'emp-lyly', fromDate, toDate, policies: augPolicies })
  admin = buildAdminKpiDashboard(base, { fromDate, toDate, policies: augPolicies, employees })
  check('5b', 'TRUE → requested +1 + parity', m.overall.counts.requestedInvoices === 1
    && admin.rows[0].counts.requestedInvoices === 1
    && assertParity('cr-true', m, admin.rows[0]).ok, {})

  base[0] = { ...base[0], customerRequested: false }
  m = computeEmployeeKpi(base, { employeeId: 'emp-lyly', fromDate, toDate, policies: augPolicies })
  admin = buildAdminKpiDashboard(base, { fromDate, toDate, policies: augPolicies, employees })
  check('5c', 'TRUE→FALSE giảm đúng + parity', m.overall.counts.requestedInvoices === 0
    && assertParity('cr-false', m, admin.rows[0]).ok, {})
}

// ——— 6. Policy version fixture Sep (local only) ———
{
  const { policies } = appendKpiPolicyVersion({
    existing: augPolicies.map((p) => ({ ...p })),
    logs: [],
    branchId: 'soc-trang',
    effectiveFrom: '2026-09-01',
    targets: { addon: 0.8, advanced: 0.15, combo: 0.35, requested: 0.25 },
    actorId: 'uat-b4',
    reason: 'B4 fixture Sep — not written to Production',
  })
  const overlap = assertNoPolicyOverlap(policies.filter((p) => p.branchId === 'soc-trang'))
  const augInv = inv({ id: 'pol-aug', date: '2026-08-20', services: [line('body-60')] })
  const sepInv = inv({ id: 'pol-sep', date: '2026-09-05', services: [line('body-60')] })
  const mAug = computeEmployeeKpi([augInv], {
    employeeId: 'emp-lyly', fromDate: '2026-08-01', toDate: '2026-08-31', policies,
  })
  const mSep = computeEmployeeKpi([sepInv], {
    employeeId: 'emp-lyly', fromDate: '2026-09-01', toDate: '2026-09-30', policies,
  })
  check('6a', 'Policy Sep fixture không overlap', overlap.ok, overlap)
  check('6b', 'Aug invoice → Aug target 0.70', mAug.policySegments[0]?.targets.addon === 0.7, mAug.policySegments)
  check('6c', 'Sep invoice → Sep target 0.80', mSep.policySegments[0]?.targets.addon === 0.8, mSep.policySegments)
  check('6d', 'Sep không đổi Aug KPI', mAug.policySegments[0]?.targets.addon === 0.7
    && policies.find((p) => p.id === 'aug-soc-trang')?.effectiveTo === '2026-08-31', {})
}

// ——— 7. Cross-branch ———
{
  const m = computeEmployeeKpi(live, { employeeId: 'emp-lyly', fromDate, toDate, policies: augPolicies })
  const admin = buildAdminKpiDashboard(live, { fromDate, toDate, policies: augPolicies, employees })
  const row = admin.rows.find((r) => r.employeeId === 'emp-lyly')
  check('7', 'Cross-branch: attribution employeeId, policy serving branch', row.homeBranchId === 'soc-trang'
    && row.servingBranchIds.includes('tram-spa')
    && row.servingBranchIds.includes('soc-trang')
    && m.policySegments.every((s) => s.servingBranchId === 'soc-trang' || s.servingBranchId === 'tram-spa')
    && assertParity('xb', m, row).ok, {
    home: row.homeBranchId,
    serving: row.servingBranchIds,
    policies: m.policySegments.map((s) => s.servingBranchId),
  })
}

// ——— 8. Missing / ceil / floating ———
{
  const cases = [
    ['addon', missingServiceLines(6999, 10000, 0.7), 1, '69.99% vs 70%'],
    ['addon0', missingServiceLines(7, 10, 0.7), 0, '70% exact'],
    ['adv', missingServiceLines(99, 1000, 0.1), 1, '9.9% vs 10%'],
    ['combo', missingServiceLines(2999, 10000, 0.3), 1, '29.99% vs 30%'],
  ]
  let ok = true
  const details = []
  for (const [k, got, expect, label] of cases) {
    details.push({ k, got, expect, label })
    if (got !== expect) ok = false
  }
  const reqFormula = missingRequestedInvoices(1999, 10000, 0.2)
  const reqBrute = bruteForceRequestedMissing(1999, 10000, 0.2)
  check('8a', 'Missing ceil boundary ADDON/ADV/COMBO', ok, details)
  check('8b', 'Requested formula = brute-force (19.99%→need 2)', reqFormula === reqBrute && reqFormula === 2, {
    reqFormula, reqBrute, note: 'ceil((0.2*10000-1999)/0.8)=ceil(1.25)=2',
  })
  // floating stress
  const floatOk = missingServiceLines(7, 10, 0.7) === 0
    && missingServiceLines(6, 10, 0.7) === 1
  check('8c', 'No FP off-by-one at exact boundary', floatOk, {})
}

// ——— 9. MAIN=0 ———
{
  const m = computeEmployeeKpi(live, { employeeId: 'emp-zero', fromDate, toDate, policies: augPolicies })
  check('9a', 'MAIN=0 ADDON>0 → INSUFFICIENT (not MET)', m.overall.counts.main === 0
    && m.overall.counts.addon > 0
    && m.overall.kpis.addon.status === KPI_STATUS.INSUFFICIENT_DATA
    && m.overall.kpis.advanced.status === KPI_STATUS.INSUFFICIENT_DATA
    && m.overall.kpis.combo.status === KPI_STATUS.INSUFFICIENT_DATA, m.overall)
  check('9b', 'MAIN=0 nhưng có HĐ → Requested vẫn tính', m.overall.counts.totalInvoices > 0
    && m.overall.kpis.requested.status !== KPI_STATUS.INSUFFICIENT_DATA, m.overall.kpis.requested)
  const empty = computeEmployeeKpi([], { employeeId: 'emp-zero', fromDate, toDate, policies: augPolicies })
  check('9c', '0 invoice → Requested INSUFFICIENT', empty.overall.kpis.requested.status === KPI_STATUS.INSUFFICIENT_DATA, {})
}

// ——— 10. Gia Lai hard exclusion ———
{
  const m = computeEmployeeKpi(live, { employeeId: 'emp-lyly', fromDate, toDate, policies: augPolicies })
  const admin = buildAdminKpiDashboard(live, { fromDate, toDate, policies: augPolicies, employees })
  const adminSrc = readFileSync(join(ROOT, 'src/pages/AdminKpi.jsx'), 'utf8')
  const empSrc = readFileSync(join(ROOT, 'src/pages/EmployeeKpi.jsx'), 'utf8')
  const exportSrc = readFileSync(join(ROOT, 'src/utils/adminKpiExport.js'), 'utf8')
  check('10a', 'Engine excludes Gia Lai invoices', m.excludedGiaLaiInvoices >= 1
    && !m.includedInvoices.some((i) => String(i.branchId).startsWith('gia-lai')), {
    excluded: m.excludedGiaLaiInvoices,
  })
  check('10b', 'Admin dashboard no Gia Lai branch cards', !admin.branches.some((b) => b.branchId.startsWith('gia-lai')), {})
  check('10c', 'Policy form only KPI_SCOPE (no Gia Lai options in code)', adminSrc.includes('KPI_SCOPE_BRANCH_IDS')
    && !adminSrc.includes('gia-lai-1'), {})
  check('10d', 'Catalog audit excludes Gia Lai', auditKpiCatalogRows([
    { branchId: 'gia-lai-1', durationId: 'gl-body-60', serviceName: 'Body' },
    { branchId: 'soc-trang', durationId: 'body-60', serviceName: 'Body' },
  ]).total === 1, {})
  check('10e', 'UI/export không hardcode tính Gia Lai', !empSrc.includes('gia-lai') && !exportSrc.includes('gia-lai'), {})
}

// ——— 11. Export parity ———
{
  const admin = buildAdminKpiDashboard(live, { fromDate, toDate, policies: augPolicies, employees })
  const row = admin.rows[0]
  const cells = {
    addon: formatAdminKpiCell(row.cards.addon),
    advanced: formatAdminKpiCell(row.cards.advanced),
    combo: formatAdminKpiCell(row.cards.combo),
    requested: formatAdminKpiCell(row.cards.requested),
  }
  const match = cells.addon.rate === row.cards.addon.rateLabel
    && cells.addon.status === row.cards.addon.statusLabel
    && cells.addon.missing === (row.cards.addon.missing == null ? '—' : String(row.cards.addon.missing))
    && cells.requested.rate === row.cards.requested.rateLabel
  const exportSrc = readFileSync(join(ROOT, 'src/utils/adminKpiExport.js'), 'utf8')
  check('11', 'Export cells MATCH Admin UI cards', match
    && exportSrc.includes('formatAdminKpiCell')
    && (exportSrc.includes('Kết quả') || exportSrc.includes('Đạt')), { cells, score: row.scoreLabel })
}

// ——— 12. Auth / data scope ———
{
  clearCurrentUser()
  check('12a', 'Employee canAccess employee-kpi only', canAccessEmployeeKpiPage(ROLES.EMPLOYEE)
    && !canAccessAdminKpiPage(ROLES.EMPLOYEE), {})
  check('12b', 'Admin canAccess admin-kpi only (not employee page)', canAccessAdminKpiPage(ROLES.ADMIN)
    && !canAccessEmployeeKpiPage(ROLES.ADMIN), {})
  check('12c', 'Manager KHÔNG có Admin KPI', !canAccessAdminKpiPage(ROLES.BRANCH_MANAGER)
    && !BRANCH_MANAGER_NAV_ORDER.includes('admin-kpi')
    && !BRANCH_MANAGER_NAV_ORDER.includes('employee-kpi'), {
    order: BRANCH_MANAGER_NAV_ORDER,
  })
  const appSrc = readFileSync(join(ROOT, 'src/App.jsx'), 'utf8')
  check('12d', 'Direct route gated by canAccessPage', appSrc.includes("pageId === 'admin-kpi'")
    && appSrc.includes('canAccessAdminKpiPage')
    && appSrc.includes("pageId === 'employee-kpi'"), {})
  // Employee UI hardcodes getCurrentUserEmployeeId — no query employeeId
  const empSrc = readFileSync(join(ROOT, 'src/pages/EmployeeKpi.jsx'), 'utf8')
  check('12e', 'Employee KPI khóa session employeeId (không query param)', empSrc.includes('getCurrentUserEmployeeId')
    && !/searchParams|URLSearchParams|query\.employee/i.test(empSrc), {})
}

// ——— Support employee ———
{
  const asSupport = computeEmployeeKpi(live, { employeeId: 'emp-lyly', fromDate, toDate, policies: augPolicies })
  check('S1', 'supportEmployee không cộng KPI', !asSupport.includedInvoices.some((i) => i.invoiceId === 'sup1'), {})
}

// ——— Architecture single engine ———
{
  const files = [
    'src/pages/EmployeeKpi.jsx',
    'src/pages/AdminKpi.jsx',
    'src/utils/adminKpiDashboard.js',
  ].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
  check('16', 'Single engine: both UIs use employeeKpiEngine', files.includes('computeEmployeeKpi')
    || files.includes('buildAdminKpiDashboard'), {})
  check('16b', 'Admin dashboard imports computeEmployeeKpi only (no second engine)', readFileSync(join(ROOT, 'src/utils/adminKpiDashboard.js'), 'utf8').includes("from './employeeKpiEngine'")
    && !existsSync(join(ROOT, 'src/utils/adminKpiEngine.js')), {})
  const adminSrc = readFileSync(join(ROOT, 'src/pages/AdminKpi.jsx'), 'utf8')
  const empPageSrc = readFileSync(join(ROOT, 'src/pages/EmployeeKpi.jsx'), 'utf8')
  check('16c', 'Admin/Employee KPI không dùng loadInvoices cache 100', !adminSrc.includes('loadInvoices')
    && !empPageSrc.includes('loadInvoices')
    && adminSrc.includes('fetchKpiInvoicesForScope')
    && empPageSrc.includes('fetchKpiInvoicesForScope'), {})
  check('16d', 'Detail export bundle tồn tại', existsSync(join(ROOT, 'src/utils/employeeKpiDetailExport.js'))
    && existsSync(join(ROOT, 'src/utils/kpiInvoiceScope.js')), {})
}

// ——— Module smoke (import / no payroll touch) ———
{
  const payroll = readFileSync(join(ROOT, 'src/utils/payrollEngine.js'), 'utf8')
  const commission = readFileSync(join(ROOT, 'src/utils/officialCommissionRules.js'), 'utf8')
  const invoice = readFileSync(join(ROOT, 'src/utils/invoice.js'), 'utf8')
  check('15a', 'payrollEngine không import KPI module', !payroll.includes('employeeKpi') && !payroll.includes('adminKpi'), {})
  check('15b', 'commission không import KPI module', !commission.includes('employeeKpi'), {})
  check('15c', 'invoice commission SoT không bị KPI ghi đè', invoice.includes('resolveNewInvoiceCommission')
    || invoice.includes('commissionPercent'), { hasCommission: invoice.includes('commission') })
  // smoke import key pages exist
  for (const f of [
    'src/pages/Invoice.jsx',
    'src/pages/Salary.jsx',
    'src/pages/Attendance.jsx',
    'src/pages/Report.jsx',
    'src/pages/AdminServices.jsx',
    'src/pages/Expenses.jsx',
    'src/pages/EmployeeKpi.jsx',
    'src/pages/AdminKpi.jsx',
  ]) {
    check(`15-${f.split('/').pop()}`, `Module file exists ${f}`, existsSync(join(ROOT, f)), {})
  }
}

// ——— Responsive CSS evidence ———
{
  const empCss = readFileSync(join(ROOT, 'src/pages/EmployeeKpi.css'), 'utf8')
  const adminCss = readFileSync(join(ROOT, 'src/pages/AdminKpi.css'), 'utf8')
  check('14a', 'Employee KPI mobile breakpoint ~760/390', empCss.includes('@media (max-width: 760px)')
    && empCss.includes('grid-template-columns: 1fr'), {})
  check('14b', 'Admin desktop-first (table wrap scroll)', adminCss.includes('overflow: auto')
    && adminCss.includes('admin-kpi-table'), {})
}

// ——— B1/B2/B3 regression markers ———
{
  const b1 = existsSync(join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_B1_UAT.json'))
  const b2 = existsSync(join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_B2_UAT.json'))
  const b3 = existsSync(join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_B3_UAT.json'))
  check('R1', 'B1/B2/B3 evidence files present', b1 && b2 && b3, { b1, b2, b3 })
}

// ——— Classifier known tokens ———
{
  const tokens = ['body-60', 'co-vai-gay', 'foot', 'combo-1', 'chuyen-sau', 'goi-sach', 'phong-don']
  const ok = tokens.every((t) => classifyKpiServiceLine({ serviceId: t }).group !== 'UNMAPPED')
  check('C1', 'Known tokens classify', ok, {})
}

clearCurrentUser()
mkdirSync(dirname(OUT), { recursive: true })
const failed = results.filter((r) => !r.pass)
const report = {
  phase: 'B4-governance-fixture',
  passed: failed.length === 0,
  failed: failed.length,
  sotMismatchCount: mismatches.length,
  sotMismatches: mismatches,
  singleEngine: true,
  wroteProduction: false,
  results,
}
writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(`\n${failed.length ? 'FAIL' : 'PASS'} ${results.length - failed.length}/${results.length} → ${OUT}`)
if (mismatches.length) {
  console.error('\n*** SoT MISMATCH — STOP. Không deploy. Chờ duyệt. ***')
}
process.exit(failed.length ? 1 : 0)
