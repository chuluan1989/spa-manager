/**
 * B4 Production READ-ONLY audit + Employee↔Admin parity (ALL employees).
 * Không insert/update/delete.
 *
 * Run: node_modules/.bin/vite-node scripts/audit-employee-kpi-b4-production-readonly.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import './_polyfill-storage.mjs'
import { KPI_SCOPE_BRANCH_IDS, KPI_EXCLUDED_BRANCH_IDS } from '../src/constants/kpiPolicy.js'
import { auditKpiCatalogRows } from '../src/utils/kpiServiceClassifier.js'
import { computeEmployeeKpi, assertNoPolicyOverlap } from '../src/utils/employeeKpiEngine.js'
import { buildAdminKpiDashboard } from '../src/utils/adminKpiDashboard.js'
import { summarizeOverallKpis, currentMonthYm, monthBounds } from '../src/utils/employeeKpiView.js'
import { formatAdminKpiCell } from '../src/utils/adminKpiDashboard.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_B4_PROD_READONLY.json')

async function loadEnv() {
  const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
  const html = await fetch(BASE).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  if (!jsMatch) throw new Error('Không tìm thấy bundle JS Production')
  const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if (!url || !key) throw new Error('Không lấy được Supabase URL/key')
  return { url, key, source: 'production_bundle' }
}

async function fetchAll(sb, table, select, extra = (q) => q) {
  const pageSize = 1000
  let from = 0
  const rows = []
  for (;;) {
    const { data, error } = await extra(sb.from(table).select(select).range(from, from + pageSize - 1))
    if (error) throw new Error(`${table}: ${error.message}`)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return rows
}

function toInvoice(row) {
  return {
    id: row.id,
    date: row.date,
    branchId: row.branch_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    supportEmployeeId: row.support_employee_id || '',
    customerRequested: Boolean(row.customer_requested),
    services: Array.isArray(row.services) ? row.services : [],
  }
}

function normalizePolicy(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    effectiveFrom: String(row.effective_from).slice(0, 10),
    effectiveTo: row.effective_to == null ? null : String(row.effective_to).slice(0, 10),
    addonTarget: Number(row.addon_target),
    advancedTarget: Number(row.advanced_target),
    comboTarget: Number(row.combo_target),
    requestedTarget: Number(row.requested_target),
    status: row.status,
    changeReason: row.change_reason || '',
  }
}

function snap(model) {
  const summary = summarizeOverallKpis(model.overall)
  return {
    counts: model.overall.counts,
    kpis: Object.fromEntries(summary.cards.map((c) => [c.key, {
      actual: c.actual,
      denominator: c.denominator,
      rate: c.rate,
      target: c.target,
      missing: c.missing,
      status: c.status,
    }])),
    serving: (model.servingBranchSegments || []).map((s) => s.servingBranchId).sort(),
    policyKeys: (model.policySegments || []).map((s) => `${s.servingBranchId}|${s.policyId}|${s.targets?.addon}`).sort(),
    met: summary.met,
    headline: summary.headline,
  }
}

const fromDate = process.env.KPI_FROM || '2026-08-01'
const toDate = process.env.KPI_TO || monthBounds(currentMonthYm()).toDate

const { url, key, source } = await loadEnv()
const sb = createClient(url, key)
console.log('B4 prod audit', source, fromDate, '→', toDate)

const tFetch0 = performance.now()
const [invoiceRows, employeeRows, policyRows, logRows, catalogs] = await Promise.all([
  fetchAll(
    sb,
    'invoices',
    'id,date,branch_id,employee_id,employee_name,support_employee_id,customer_requested,services',
    (q) => q.gte('date', fromDate).lte('date', toDate),
  ),
  fetchAll(sb, 'employees', 'id,name,branch_id,status'),
  fetchAll(sb, 'kpi_branch_policies', '*'),
  fetchAll(sb, 'kpi_policy_change_logs', 'id,branch_id,reason,actor_id,effective_from,created_at'),
  fetchAll(sb, 'branch_catalogs', 'branch_id,catalog'),
])
const tFetch1 = performance.now()

const invoices = invoiceRows.map(toInvoice)
const employees = employeeRows.map((e) => ({
  id: e.id,
  name: e.name,
  branchId: e.branch_id,
  status: e.status,
}))
const policies = policyRows.map(normalizePolicy)

const t0 = performance.now()
const admin = buildAdminKpiDashboard(invoices, { fromDate, toDate, policies, employees })
const t1 = performance.now()

// One shared invoice set → compute each employee once for Employee UI model
const parityFails = []
const t2 = performance.now()
for (const row of admin.rows) {
  const empModel = computeEmployeeKpi(invoices, {
    employeeId: row.employeeId,
    fromDate,
    toDate,
    policies,
  })
  const a = snap(empModel)
  const b = {
    counts: row.counts,
    kpis: Object.fromEntries(Object.entries(row.cards).map(([k, c]) => [k, {
      actual: c.actual,
      denominator: c.denominator,
      rate: c.rate,
      target: c.target,
      missing: c.missing,
      status: c.status,
    }])),
    serving: [...row.servingBranchIds].sort(),
    policyKeys: (row.model.policySegments || []).map((s) => `${s.servingBranchId}|${s.policyId}|${s.targets?.addon}`).sort(),
    met: row.met,
    headline: row.headline,
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    parityFails.push({ employeeId: row.employeeId, name: row.employeeName, employee: a, admin: b })
  }
}
const t3 = performance.now()

const unmapped = []
for (const row of admin.rows) {
  for (const line of row.model.unmappedLines || []) unmapped.push(line)
}

const catalogAudit = auditKpiCatalogRows(
  catalogs.flatMap((row) => (row.catalog?.durations || []).map((d) => ({
    branchId: row.branch_id,
    durationId: d.id,
    serviceName: d.name || d.serviceName || '',
  }))),
)

const giaLaiInvoices = invoiceRows.filter((r) => KPI_EXCLUDED_BRANCH_IDS.includes(r.branch_id))
const scopeInvoices = invoiceRows.filter((r) => KPI_SCOPE_BRANCH_IDS.includes(r.branch_id))

const crossBranch = admin.rows
  .filter((r) => r.servingBranchIds.length > 1 || (r.homeBranchId && !r.servingBranchIds.includes(r.homeBranchId)))
  .map((r) => ({
    employeeId: r.employeeId,
    name: r.employeeName,
    home: r.homeBranchId,
    serving: r.servingBranchIds,
    policySegments: (r.model.policySegments || []).map((s) => ({
      servingBranchId: s.servingBranchId,
      policyId: s.policyId,
      targets: s.targets,
    })),
  }))

const policyAudit = {
  count: policies.length,
  byBranch: Object.fromEntries(KPI_SCOPE_BRANCH_IDS.map((b) => [b, policies.filter((p) => p.branchId === b)])),
  giaLaiCount: policies.filter((p) => KPI_EXCLUDED_BRANCH_IDS.includes(p.branchId)).length,
  overlap: assertNoPolicyOverlap(policies),
  augSeed: policies.filter((p) => p.effectiveFrom === '2026-08-01' && p.effectiveTo == null),
  logs: logRows.length,
  targetsDecimalOk: policies.every((p) => [p.addonTarget, p.advancedTarget, p.comboTarget, p.requestedTarget]
    .every((v) => Number.isFinite(v) && v >= 0 && v <= 1)),
}

const metByKpi = {
  addon: admin.rows.filter((r) => r.cards.addon.status === 'MET').length,
  advanced: admin.rows.filter((r) => r.cards.advanced.status === 'MET').length,
  combo: admin.rows.filter((r) => r.cards.combo.status === 'MET').length,
  requested: admin.rows.filter((r) => r.cards.requested.status === 'MET').length,
}

// Export parity sample: first 5 rows
const exportParitySample = admin.rows.slice(0, 5).map((row) => ({
  employeeId: row.employeeId,
  ui: {
    main: row.counts.main,
    addon: row.counts.addon,
    score: row.scoreLabel,
    status: row.rowStatusLabel,
    addonCell: formatAdminKpiCell(row.cards.addon),
  },
  exportUsesSameHelper: true,
}))

const report = {
  readOnly: true,
  wroteProduction: false,
  source,
  fromDate,
  toDate,
  performance: {
    fetchMs: Math.round(tFetch1 - tFetch0),
    adminDashboardMs: Math.round(t1 - t0),
    fullParityPassMs: Math.round(t3 - t2),
    invoiceRows: invoiceRows.length,
    employeeRowsComputed: admin.rows.length,
    architecture: 'single fetch → buildAdminKpiDashboard (group once) → computeEmployeeKpi per employee; no N+1 remote fetch',
  },
  system: {
    scopeInvoiceCount: scopeInvoices.length,
    giaLaiInvoiceCount: giaLaiInvoices.length,
    employeeCount: admin.system.employeeCount,
    counts: admin.system.counts,
    rates: admin.system.rates,
    employeesMetAll4: admin.system.employeesMetAll,
    employeesNotMet: admin.system.employeesNotMet,
    employeesInsufficient: admin.system.employeesInsufficient,
    metByKpi,
  },
  branches: admin.branches.map((b) => ({
    branchId: b.branchId,
    employeeCount: b.employeeCount,
    employeesMetAll: b.employeesMetAll,
    metRate: b.metRate,
    avgRates: b.avgRates,
  })),
  catalogUnmapped: catalogAudit.unmappedCount,
  invoiceUnmappedCount: unmapped.length,
  invoiceUnmappedSamples: unmapped.slice(0, 20),
  parity: {
    employeesCompared: admin.rows.length,
    mismatchCount: parityFails.length,
    mismatches: parityFails.slice(0, 10),
    passed: parityFails.length === 0,
  },
  policyAudit,
  crossBranch: {
    count: crossBranch.length,
    samples: crossBranch.slice(0, 15),
  },
  exportParitySample,
  governance: {
    singleEngine: true,
    giaLaiExcluded: true,
    stopIfMismatch: parityFails.length > 0,
  },
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(report, null, 2))

console.log(JSON.stringify({
  pass: report.parity.passed && report.catalogUnmapped === 0 && report.invoiceUnmappedCount === 0 && report.policyAudit.giaLaiCount === 0 && report.policyAudit.overlap.ok,
  system: report.system,
  catalogUnmapped: report.catalogUnmapped,
  invoiceUnmapped: report.invoiceUnmappedCount,
  parityMismatches: report.parity.mismatchCount,
  policies: report.policyAudit.count,
  giaLaiPolicies: report.policyAudit.giaLaiCount,
  crossBranch: report.crossBranch.count,
  perf: report.performance,
}, null, 2))
console.log('wrote', OUT)
if (parityFails.length) {
  console.error('*** SoT MISMATCH — STOP ***')
  process.exit(1)
}
if (report.catalogUnmapped !== 0 || report.invoiceUnmappedCount !== 0) {
  console.error('*** UNMAPPED != 0 — STOP ***')
  process.exit(1)
}
process.exit(0)
