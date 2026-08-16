/**
 * READ-ONLY — Admin KPI home-branch filter audit (Production data).
 * Run: node --env-file=.env.local node_modules/.bin/vite-node scripts/audit-employee-kpi-sot-prod-readonly.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { loadProductionSupabaseEnv, isPlaceholderSupabaseKey } from './lib/loadProductionSupabaseEnv.mjs'

async function ensureEnv() {
  let url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  let key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  if (!url || isPlaceholderSupabaseKey(key)) {
    const env = await loadProductionSupabaseEnv()
    url = env.url
    key = env.key
  }
  if (!import.meta.env) Object.defineProperty(import.meta, 'env', { value: {} })
  import.meta.env.VITE_SUPABASE_URL = url
  import.meta.env.VITE_SUPABASE_ANON_KEY = key
  process.env.VITE_SUPABASE_URL = url
  process.env.VITE_SUPABASE_ANON_KEY = key
}

await ensureEnv()

const { KPI_SCOPE_BRANCH_IDS } = await import('../src/constants/kpiPolicy.js')
const { buildAdminKpiDashboard, filterAdminKpiRows } = await import('../src/utils/adminKpiDashboard.js')
const { fetchKpiBranchPolicies } = await import('../src/repositories/kpiPolicyRepository.js')
const { fetchInvoicesFiltered } = await import('../src/repositories/invoicesRepository.js')
const { fetchEmployees } = await import('../src/repositories/employeesRepository.js')
const { resolveKpiMonthRange } = await import('../src/utils/kpiInvoiceScope.js')
const { getBranchName } = await import('../src/utils/branchStorage.js')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_SOT_PROD_READONLY.json')

const rangeClipped = resolveKpiMonthRange('2026-08', { now: new Date('2026-08-17T05:00:00+07:00') })
const rangeFull = resolveKpiMonthRange('2026-08', { now: new Date('2026-08-31T23:00:00+07:00') })
const t0 = Date.now()
const [invoicesClipped, invoicesFull, policies, employeeRows] = await Promise.all([
  fetchInvoicesFiltered({ fromDate: rangeClipped.fromDate, toDate: rangeClipped.toDate }),
  fetchInvoicesFiltered({ fromDate: rangeFull.fromDate, toDate: rangeFull.toDate }),
  fetchKpiBranchPolicies(),
  fetchEmployees(),
])
const fetchMs = Date.now() - t0

if (!Array.isArray(employeeRows) || !employeeRows.length) {
  throw new Error('fetchEmployees() trả về rỗng — cần env Supabase')
}

const employees = employeeRows.map((e) => ({
  id: e.id,
  name: e.name || e.id,
  branchId: e.branchId || e.branch_id || '',
  status: e.status,
}))

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

function homeRoster(branchId) {
  return filterAdminKpiRows(dashFull.rows, { branchId, homeOrServing: 'home' })
}

const soc = homeRoster('soc-trang')
const tram = homeRoster('tram-spa')
const homeByBranch = Object.fromEntries(
  KPI_SCOPE_BRANCH_IDS.map((branchId) => {
    const rows = homeRoster(branchId)
    const expectedIds = new Set(
      employees
        .filter((e) => e.branchId === branchId)
        .map((e) => e.id)
        .filter((id) => dashFull.rows.some((r) => r.employeeId === id)),
    )
    const adminIds = new Set(rows.map((r) => r.employeeId))
    const missing = [...expectedIds].filter((id) => !adminIds.has(id))
    const extra = [...adminIds].filter((id) => !expectedIds.has(id))
    return [branchId, {
      branchName: getBranchName(branchId) || branchId,
      adminRows: rows.length,
      expectedHomeWithKpi: expectedIds.size,
      mismatches: missing.length + extra.length,
      missing,
      extra,
      names: rows.map((r) => r.employeeName).sort(),
    }]
  }),
)

const lyly = dashFull.rows.find((r) => /ly\s*ly/i.test(r.employeeName || ''))
const crossBranchOk = Boolean(
  lyly
  && lyly.homeBranchId === 'soc-trang'
  && lyly.servingBranchIds.includes('tram-spa')
  && soc.some((r) => r.employeeId === lyly.employeeId)
  && !tram.some((r) => r.employeeId === lyly.employeeId),
)

const julRange = resolveKpiMonthRange('2026-07')
const julInv = await fetchInvoicesFiltered({ fromDate: julRange.fromDate, toDate: julRange.toDate })
const julDash = buildAdminKpiDashboard(julInv, {
  fromDate: julRange.fromDate,
  toDate: julRange.toDate,
  policies,
  employees,
})

const rosterIndependent = JSON.stringify(soc.map((r) => r.employeeId).sort())
  !== JSON.stringify(tram.map((r) => r.employeeId).sort())

const allHomeMatch = Object.values(homeByBranch).every((b) => b.mismatches === 0)

const report = {
  readOnly: true,
  wroteProduction: false,
  filterMode: 'home-branchId',
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
  homeRosterByBranch: homeByBranch,
  socTrang: {
    ...homeByBranch['soc-trang'],
    count: soc.length,
  },
  tramSpa: {
    ...homeByBranch['tram-spa'],
    count: tram.length,
  },
  crossBranchLyLy: lyly ? {
    name: lyly.employeeName,
    homeBranchId: lyly.homeBranchId,
    servingBranchIds: lyly.servingBranchIds,
    inSocFilter: soc.some((r) => r.employeeId === lyly.employeeId),
    inTramFilter: tram.some((r) => r.employeeId === lyly.employeeId),
    ok: crossBranchOk,
  } : null,
  rosterIndependent,
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
    && allHomeMatch
    && rosterIndependent
    && crossBranchOk
    && julDash.rows.every((r) => r.rowStatus === 'NO_POLICY' || r.counts.totalInvoices === 0),
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(JSON.stringify({
  pass: report.pass,
  soc: report.socTrang.count,
  tram: report.tramSpa.count,
  mismatches: Object.fromEntries(
    Object.entries(homeByBranch).map(([k, v]) => [k, v.mismatches]),
  ),
  crossBranchLyLy: report.crossBranchLyLy,
  rosterIndependent,
  homeRosterByBranch: Object.fromEntries(
    Object.entries(homeByBranch).map(([k, v]) => [k, { n: v.adminRows, names: v.names }]),
  ),
}, null, 2))
console.log(report.pass ? 'PASS' : 'FAIL', '→', OUT)
if (!report.pass) process.exit(1)
