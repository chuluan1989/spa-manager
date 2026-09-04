/**
 * DRY-RUN ONLY — KPI penalty 50.000đ / 1 lượt thiếu, invoice date >= 2026-09-01.
 * Dùng engine hiện tại (`missingServiceLines` / `missingRequestedInvoices`).
 * Không ghi DB. Không sửa payroll / invoice / KPI target.
 *
 *   npx vite-node --env-file=.env.local scripts/dry-run-kpi-penalty-sep2026.mjs
 */
import postgres from 'postgres'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { KPI_EXCLUDED_BRANCH_IDS, KPI_SCOPE_BRANCH_IDS } from '../src/constants/kpiPolicy.js'
import {
  computeEmployeeKpi,
  missingRequestedInvoices,
  missingServiceLines,
} from '../src/utils/employeeKpiEngine.js'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence/kpi-penalty-sep2026')
mkdirSync(OUT_DIR, { recursive: true })

const FROM = '2026-09-01'
const TO = '2026-09-15'
const UNIT = 50000

const BRANCH_NAME = {
  'tram-spa': 'Trạm Spa',
  'soc-trang': 'Sóc Trăng',
  'song-khoe-spa': 'Sống Khoẻ',
  'bac-lieu': 'Bạc Liêu',
  'tra-vinh': 'Trà Vinh',
  'vinh-long': 'Vĩnh Long',
  'gia-lai-1': 'Gia Lai 1',
  'gia-lai-2': 'Gia Lai 2',
}

if (!process.env.DATABASE_URL) {
  console.error('Thiếu DATABASE_URL')
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
})

function iso(value) {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function money(n) {
  return Math.round(Number(n) || 0)
}

function miss(value) {
  return value == null ? 0 : Number(value) || 0
}

try {
  const policiesRaw = await sql`select * from public.kpi_branch_policies order by branch_id, effective_from`
  const policies = policiesRaw.map((p) => ({
    id: p.id,
    branchId: p.branch_id,
    effectiveFrom: iso(p.effective_from),
    effectiveTo: p.effective_to == null ? null : iso(p.effective_to),
    addonTarget: Number(p.addon_target),
    advancedTarget: Number(p.advanced_target),
    comboTarget: Number(p.combo_target),
    requestedTarget: Number(p.requested_target),
    duration90Target: p.duration90_target == null ? null : Number(p.duration90_target),
    status: p.status,
  }))

  const employees = await sql`select id, name, branch_id, status from public.employees`
  const empById = Object.fromEntries(employees.map((e) => [e.id, e]))

  const invoiceRows = await sql`
    select id, date, branch_id, employee_id, employee_name, support_employee_id, customer_requested, services
    from public.invoices
    where date >= ${FROM} and date <= ${TO}
  `
  const invoices = invoiceRows.map((row) => ({
    id: row.id,
    date: iso(row.date),
    branchId: row.branch_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    supportEmployeeId: row.support_employee_id || '',
    customerRequested: Boolean(row.customer_requested),
    services: Array.isArray(row.services) ? row.services : [],
  }))

  const kpiAdj = await sql`
    select id, employee_id, employee_name, date, amount, reason, source, category
    from public.payroll_adjustments
    where type = 'kpi' and date >= ${FROM} and date <= ${TO}
    order by date, employee_id
  `

  const primaryIds = [...new Set(invoices.map((inv) => inv.employeeId).filter(Boolean))]
  const rows = []
  const giaLaiRows = []

  for (const employeeId of primaryIds) {
    const emp = empById[employeeId]
    const homeBranch = emp?.branch_id || ''
    const result = computeEmployeeKpi(invoices, {
      employeeId,
      fromDate: FROM,
      toDate: TO,
      policies,
    })
    const counts = result.overall?.counts || {}
    const kpis = result.overall?.kpis || {}
    const included = result.includedInvoices?.length || 0
    const giaLaiOnly = included === 0 && (result.excludedGiaLaiInvoices || 0) > 0

    function ratioTarget(kpi) {
      if (kpi?.target != null && Number.isFinite(Number(kpi.target))) return Number(kpi.target)
      if (kpi?.informationalBlendedTarget != null) return Number(kpi.informationalBlendedTarget)
      if (Array.isArray(kpi?.targets) && kpi.targets.length === 1) return Number(kpi.targets[0])
      return null
    }

    const addonT = ratioTarget(kpis.addon)
    const advancedT = ratioTarget(kpis.advanced)
    const comboT = ratioTarget(kpis.combo)
    const duration90T = ratioTarget(kpis.duration90)
    const requestedT = ratioTarget(kpis.requested)

    const addonMissing = kpis.addon?.missing
    const advancedMissing = kpis.advanced?.missing
    const comboMissing = kpis.combo?.missing
    const duration90Missing = kpis.duration90?.missing
    const requestedMissing = kpis.requested?.missing

    const requestedNaive = requestedT == null || !(counts.totalInvoices > 0)
      ? null
      : Math.max(0, Math.ceil(counts.totalInvoices * requestedT - (counts.requestedInvoices || 0) - 1e-9))

    const totalMissing = giaLaiOnly
      ? 0
      : miss(addonMissing) + miss(advancedMissing) + miss(comboMissing)
        + miss(duration90Missing) + miss(requestedMissing)

    const row = {
      employeeId,
      employeeName: emp?.name || invoices.find((inv) => inv.employeeId === employeeId)?.employeeName || employeeId,
      homeBranchId: homeBranch,
      homeBranchName: BRANCH_NAME[homeBranch] || homeBranch,
      status: emp?.status || '',
      invoicesIncluded: included,
      excludedGiaLaiInvoices: result.excludedGiaLaiInvoices || 0,
      supportInvoiceCount: invoices.filter((inv) => inv.supportEmployeeId === employeeId).length,
      servingBranches: (result.servingBranchSegments || []).map((s) => s.servingBranchId),
      main: counts.main || 0,
      addonActual: counts.addon || 0,
      addonRequired: counts.main > 0 && addonT != null ? Math.ceil(counts.main * addonT - 1e-9) : null,
      addonMissing: addonMissing,
      addonStatus: kpis.addon?.status,
      advancedActual: counts.advanced || 0,
      advancedRequired: counts.main > 0 && advancedT != null ? Math.ceil(counts.main * advancedT - 1e-9) : null,
      advancedMissing: advancedMissing,
      advancedStatus: kpis.advanced?.status,
      comboActual: counts.combo || 0,
      comboRequired: counts.main > 0 && comboT != null ? Math.ceil(counts.main * comboT - 1e-9) : null,
      comboMissing: comboMissing,
      comboStatus: kpis.combo?.status,
      duration90Actual: counts.duration90 || 0,
      duration90Required: counts.main > 0 && duration90T != null ? Math.ceil(counts.main * duration90T - 1e-9) : null,
      duration90Missing: duration90Missing,
      duration90Status: kpis.duration90?.status,
      requestedActual: counts.requestedInvoices || 0,
      requestedTotalInvoices: counts.totalInvoices || 0,
      requestedMissingEngine: requestedMissing,
      requestedMissingNaiveCeil: requestedNaive,
      requestedStatus: kpis.requested?.status,
      totalMissingEngine: totalMissing,
      penaltyEngine: totalMissing * UNIT,
      kpiPayrollAdjustmentsSep: kpiAdj.filter((a) => a.employee_id === employeeId).reduce((s, a) => s + money(a.amount), 0),
      note: giaLaiOnly
        ? 'Gia Lai excluded — không có KPI target, không phạt trong dry-run'
        : (counts.main === 0 ? 'MAIN=0 → DV phụ/CS/Combo/90 thiếu = null (không phạt các hạng mục tỷ lệ MAIN)' : ''),
    }

    if (giaLaiOnly) giaLaiRows.push(row)
    else rows.push(row)
  }

  rows.sort((a, b) => b.penaltyEngine - a.penaltyEngine || a.homeBranchName.localeCompare(b.homeBranchName, 'vi'))

  const byBranch = {}
  for (const row of rows) {
    const key = row.homeBranchId || 'unknown'
    if (!byBranch[key]) {
      byBranch[key] = {
        branchId: key,
        branchName: row.homeBranchName,
        employees: 0,
        penalized: 0,
        missing: 0,
        penalty: 0,
      }
    }
    byBranch[key].employees += 1
    byBranch[key].missing += row.totalMissingEngine
    byBranch[key].penalty += row.penaltyEngine
    if (row.penaltyEngine > 0) byBranch[key].penalized += 1
  }

  const selfCheck = {
    main10_cs20_actual0: missingServiceLines(0, 10, 0.2),
    main10_cs20_actual1: missingServiceLines(1, 10, 0.2),
    main10_cs20_actual2: missingServiceLines(2, 10, 0.2),
    main11_cs20_actual0: missingServiceLines(0, 11, 0.2),
    requested_N10_R0_t20: missingRequestedInvoices(0, 10, 0.2),
    requested_naive_N10_R0_t20: Math.max(0, Math.ceil(10 * 0.2 - 0 - 1e-9)),
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'DRY-RUN-ONLY',
    writes: false,
    range: { from: FROM, to: TO, cycle: 'period1', month: '2026-09' },
    aggregateAlgorithm: 'employee-blended (gộp employeeId trong kỳ, không cộng missing từng CN)',
    unitPenalty: UNIT,
    rounding: {
      ratioKpis: 'missingServiceLines = ceil(MAIN * target - actual - 1e-9) — trùng requiredCeil - actual',
      requested: 'missingRequestedInvoices = ceil((t*N - R) / (1-t) - EPS) vì giả định thêm HĐ requested (tăng cả N và R). Naive ceil(N*t)-R khác — xem selfCheck.',
    },
    policiesSep: policies.filter((p) => p.effectiveFrom >= FROM || !p.effectiveTo || p.effectiveTo >= FROM),
    excludedBranches: KPI_EXCLUDED_BRANCH_IDS,
    scopeBranches: KPI_SCOPE_BRANCH_IDS,
    selfCheck,
    invoicesInRange: invoices.length,
    giaLaiInvoices: invoices.filter((inv) => KPI_EXCLUDED_BRANCH_IDS.includes(inv.branchId)).length,
    supportAttributedNever: 'KPI chỉ đếm invoice.employeeId; supportEmployeeId không vào actual',
    existingKpiPayrollAdjustments: {
      count: kpiAdj.length,
      totalAmount: kpiAdj.reduce((s, a) => s + money(a.amount), 0),
      note: 'KPI tiền trên payroll hiện là payroll_adjustment type=kpi (SET tay). Engine KPI không ghi tiền. Dry-run này KHÔNG đụng các dòng đó.',
    },
    totals: {
      employeesWithPrimaryInvoice: rows.length,
      penalizedEmployees: rows.filter((r) => r.penaltyEngine > 0).length,
      totalMissing: rows.reduce((s, r) => s + r.totalMissingEngine, 0),
      totalPenalty: rows.reduce((s, r) => s + r.penaltyEngine, 0),
      mainZeroEmployees: rows.filter((r) => r.main === 0).length,
    },
    byBranch: Object.values(byBranch).sort((a, b) => b.penalty - a.penalty),
    giaLaiPrimaryEmployees: giaLaiRows.length,
    giaLaiRows,
    employees: rows,
  }

  const jsonPath = path.join(OUT_DIR, 'DRY_RUN.json')
  const csvPath = path.join(OUT_DIR, 'DRY_RUN.csv')
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  const csvHeader = [
    'branch', 'employee', 'MAIN',
    'addon_actual', 'addon_required', 'addon_missing',
    'cs_actual', 'cs_required', 'cs_missing',
    'combo_actual', 'combo_required', 'combo_missing',
    'body90_actual', 'body90_required', 'body90_missing',
    'requested_actual', 'requested_invoices', 'requested_missing_engine', 'requested_missing_naive',
    'total_missing', 'penalty', 'note',
  ]
  const csvLines = [csvHeader.join(',')]
  for (const r of rows) {
    csvLines.push([
      r.homeBranchName, r.employeeName, r.main,
      r.addonActual, r.addonRequired ?? '', r.addonMissing ?? '',
      r.advancedActual, r.advancedRequired ?? '', r.advancedMissing ?? '',
      r.comboActual, r.comboRequired ?? '', r.comboMissing ?? '',
      r.duration90Actual, r.duration90Required ?? '', r.duration90Missing ?? '',
      r.requestedActual, r.requestedTotalInvoices, r.requestedMissingEngine ?? '', r.requestedMissingNaiveCeil ?? '',
      r.totalMissingEngine, r.penaltyEngine, JSON.stringify(r.note),
    ].join(','))
  }
  writeFileSync(csvPath, csvLines.join('\n'))

  console.log(JSON.stringify({
    range: report.range,
    selfCheck,
    policies: report.policiesSep.map((p) => ({
      branchId: p.branchId,
      from: p.effectiveFrom,
      to: p.effectiveTo,
      status: p.status,
      addon: p.addonTarget,
      advanced: p.advancedTarget,
      combo: p.comboTarget,
      requested: p.requestedTarget,
      duration90: p.duration90Target,
    })),
    existingKpiPayrollAdjustments: report.existingKpiPayrollAdjustments,
    totals: report.totals,
    byBranch: report.byBranch,
    giaLaiPrimaryEmployees: report.giaLaiPrimaryEmployees,
    jsonPath,
    csvPath,
  }, null, 2))
} finally {
  await sql.end({ timeout: 5 })
}
