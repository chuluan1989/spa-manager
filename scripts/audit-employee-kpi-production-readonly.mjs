/**
 * READ-ONLY Production sample for 6 KPI-scope branches.
 * Không insert/update/delete. Không apply migration.
 *
 * Run: node --env-file=.env.local node_modules/.bin/vite-node scripts/audit-employee-kpi-production-readonly.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { KPI_SCOPE_BRANCH_IDS } from '../src/constants/kpiPolicy.js'
import { auditKpiCatalogRows } from '../src/utils/kpiServiceClassifier.js'
import { computeScopeKpi } from '../src/utils/employeeKpiEngine.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_B1_PROD_READONLY.json')

async function loadEnv() {
  const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
  const html = await fetch(BASE).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  if (!jsMatch) throw new Error('Không tìm thấy bundle JS Production')
  const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
  const supabaseUrl = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const supabaseKey = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if (!supabaseUrl || !supabaseKey) throw new Error('Không lấy được Supabase URL/key')
  return { url: supabaseUrl, key: supabaseKey, source: 'production_bundle' }
}

async function fetchAll(sb, table, select, extra = (q) => q) {
  const pageSize = 1000
  let from = 0
  const rows = []
  for (;;) {
    let q = extra(sb.from(table).select(select).range(from, from + pageSize - 1))
    const { data, error } = await q
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

const fromDate = process.env.KPI_FROM || '2026-08-01'
const toDate = process.env.KPI_TO || '2026-08-16'

const { url, key, source } = await loadEnv()
const sb = createClient(url, key)
console.log('source', source, 'range', fromDate, toDate)

const invoiceRows = await fetchAll(
  sb,
  'invoices',
  'id,date,branch_id,employee_id,employee_name,support_employee_id,customer_requested,services',
  (q) => q.gte('date', fromDate).lte('date', toDate),
)

const giaLai = invoiceRows.filter((r) => r.branch_id === 'gia-lai-1' || r.branch_id === 'gia-lai-2')
const invoices = invoiceRows.map(toInvoice)
const model = computeScopeKpi(invoices, { fromDate, toDate, policies: [] })

let catalogAudit = null
try {
  const catalogs = await fetchAll(sb, 'branch_catalogs', 'branch_id,catalog')
  const rows = []
  for (const row of catalogs) {
    for (const d of row.catalog?.durations || []) {
      rows.push({
        branchId: row.branch_id,
        durationId: d.id,
        serviceName: d.name || d.serviceName || '',
      })
    }
  }
  catalogAudit = auditKpiCatalogRows(rows)
} catch (err) {
  catalogAudit = { error: err.message }
}

const unmappedSamples = []
for (const emp of model.employees) {
  for (const line of emp.unmappedLines || []) unmappedSamples.push(line)
}

const sampleEmployees = model.employees
  .slice()
  .sort((a, b) => b.overall.counts.main - a.overall.counts.main)
  .slice(0, 8)
  .map((m) => ({
    employeeId: m.employeeId,
    name: invoices.find((i) => i.employeeId === m.employeeId)?.employeeName,
    counts: m.overall.counts,
    rates: {
      addon: m.overall.kpis.addon.rate,
      advanced: m.overall.kpis.advanced.rate,
      combo: m.overall.kpis.combo.rate,
      requested: m.overall.kpis.requested.rate,
    },
    status: {
      addon: m.overall.kpis.addon.status,
      advanced: m.overall.kpis.advanced.status,
      combo: m.overall.kpis.combo.status,
      requested: m.overall.kpis.requested.status,
    },
    missing: {
      addon: m.overall.kpis.addon.missing,
      advanced: m.overall.kpis.advanced.missing,
      combo: m.overall.kpis.combo.missing,
      requested: m.overall.kpis.requested.missing,
    },
    servingBranches: m.servingBranchSegments.map((s) => s.servingBranchId),
  }))

const report = {
  readOnly: true,
  wroteProduction: false,
  source,
  fromDate,
  toDate,
  scopeBranches: KPI_SCOPE_BRANCH_IDS,
  invoiceRowsFetched: invoiceRows.length,
  giaLaiInvoicesSeen: giaLai.length,
  excludedGiaLaiInvoices: model.excludedGiaLaiInvoices,
  catalogAudit: catalogAudit?.error
    ? catalogAudit
    : { total: catalogAudit?.total, unmappedCount: catalogAudit?.unmappedCount, unmapped: catalogAudit?.unmapped?.slice(0, 20) },
  system: model.system,
  branches: model.branches.map((b) => ({
    branchId: b.branchId,
    counts: b.counts,
    rates: {
      addon: b.counts.main ? b.counts.addon / b.counts.main : null,
      advanced: b.counts.main ? b.counts.advanced / b.counts.main : null,
      combo: b.counts.main ? b.counts.combo / b.counts.main : null,
      requested: b.counts.totalInvoices ? b.counts.requestedInvoices / b.counts.totalInvoices : null,
    },
    employeesMet: b.employeesMet,
    employeeCount: b.employeeCount,
  })),
  sampleEmployees,
  phongDonNote: 'ADDON includes phong-don token',
  invoiceUnmappedSamples: unmappedSamples.slice(0, 30),
  invoiceUnmappedCount: unmappedSamples.length,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(JSON.stringify({
  system: report.system,
  catalogUnmapped: report.catalogAudit.unmappedCount,
  giaLaiExcluded: report.excludedGiaLaiInvoices,
  branches: report.branches.map((b) => ({ id: b.branchId, invoices: b.counts.totalInvoices, main: b.counts.main, addon: b.counts.addon })),
}, null, 2))
console.log('wrote', OUT)
