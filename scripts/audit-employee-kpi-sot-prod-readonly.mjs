import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { KPI_SCOPE_BRANCH_IDS } from '../src/constants/kpiPolicy.js'
import { buildAdminKpiDashboard, filterAdminKpiRows } from '../src/utils/adminKpiDashboard.js'
import { fetchKpiBranchPolicies } from '../src/repositories/kpiPolicyRepository.js'
import { fetchInvoicesFiltered } from '../src/repositories/invoicesRepository.js'
import { resolveKpiMonthRange } from '../src/utils/kpiInvoiceScope.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_SOT_PROD_READONLY.json')

const rangeClipped = resolveKpiMonthRange('2026-08', { now: new Date('2026-08-17T05:00:00+07:00') })
const rangeFull = resolveKpiMonthRange('2026-08', { now: new Date('2026-08-31T23:00:00+07:00') })
const t0 = Date.now()
const [invoicesClipped, invoicesFull, policies] = await Promise.all([
  fetchInvoicesFiltered({ fromDate: rangeClipped.fromDate, toDate: rangeClipped.toDate }),
  fetchInvoicesFiltered({ fromDate: rangeFull.fromDate, toDate: rangeFull.toDate }),
  fetchKpiBranchPolicies(),
])
const fetchMs = Date.now() - t0

const empMap = new Map()
for (const inv of invoicesFull) {
  const id = inv.employeeId || inv.employee_id
  if (!id) continue
  if (!empMap.has(id)) {
    empMap.set(id, {
      id,
      name: inv.employeeName || id,
      branchId: inv.homeBranchId || '',
    })
  }
}
const employees = [...empMap.values()]

const t1 = Date.now()
const dashFull = buildAdminKpiDashboard(invoicesFull, {
  fromDate: rangeFull.fromDate,
  toDate: rangeFull.toDate,
  policies,
  employees,
})
const dashClipped = buildAdminKpiDashboard(invoicesClipped, {
  fromDate: rangeClipped.fromDate,
  toDate: rangeClipped.toDate,
  policies,
  employees,
})
const buildMs = Date.now() - t1

const soc = filterAdminKpiRows(dashFull.rows, { branchId: 'soc-trang', homeOrServing: 'either' })
const socDbIds = new Set()
for (const inv of invoicesFull) {
  const branchId = inv.branchId || inv.branch_id
  if (branchId !== 'soc-trang') continue
  if (!KPI_SCOPE_BRANCH_IDS.includes(branchId)) continue
  const id = inv.employeeId || inv.employee_id
  if (id) socDbIds.add(id)
}
const socAdminIds = new Set(soc.map((r) => r.employeeId))
const missing = [...socDbIds].filter((id) => !socAdminIds.has(id))
const extra = [...socAdminIds].filter((id) => !socDbIds.has(id))

const julRange = resolveKpiMonthRange('2026-07')
const julInv = await fetchInvoicesFiltered({ fromDate: julRange.fromDate, toDate: julRange.toDate })
const julDash = buildAdminKpiDashboard(julInv, {
  fromDate: julRange.fromDate,
  toDate: julRange.toDate,
  policies,
  employees,
})

const report = {
  readOnly: true,
  wroteProduction: false,
  policies: policies.map((p) => ({
    branchId: p.branchId,
    from: p.effectiveFrom,
    to: p.effectiveTo,
    status: p.status,
    targets: [p.addonTarget, p.advancedTarget, p.comboTarget, p.requestedTarget],
  })),
  augClippedToToday: {
    range: rangeClipped,
    fetch: invoicesClipped.length,
    adminHD: dashClipped.system.counts.totalInvoices,
    nv: dashClipped.system.employeeCount,
  },
  augFullMonth: {
    range: rangeFull,
    fetch: invoicesFull.length,
    adminHD: dashFull.system.counts.totalInvoices,
    nv: dashFull.system.employeeCount,
    counts: dashFull.system.counts,
  },
  socTrang: {
    dbServingEmployees: socDbIds.size,
    adminRows: socAdminIds.size,
    mismatches: missing.length + extra.length,
    missing,
    extra,
    names: soc.map((r) => r.employeeName).sort(),
  },
  july: {
    range: julRange,
    fetch: julInv.length,
    adminHD: julDash.system.counts.totalInvoices,
    nv: julDash.rows.length,
    noPolicy: julDash.rows.filter((r) => r.rowStatus === 'NO_POLICY').length,
    met: julDash.rows.filter((r) => r.rowStatus === 'MET').length,
    sample: julDash.rows.slice(0, 3).map((r) => ({
      name: r.employeeName,
      status: r.rowStatusLabel,
      counts: r.counts,
      targetAddon: r.cards.addon.target,
    })),
  },
  perf: { fetchMs, buildMs },
  pass: dashFull.system.counts.totalInvoices === invoicesFull.length
    && missing.length === 0
    && extra.length === 0
    && julDash.rows.every((r) => r.rowStatus === 'NO_POLICY' || r.counts.totalInvoices === 0),
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
console.log(report.pass ? 'PASS' : 'FAIL', '→', OUT)
if (!report.pass) process.exit(1)
