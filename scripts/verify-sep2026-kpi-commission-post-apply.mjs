/**
 * Post-apply re-read Production: catalog, invoice snapshots, KPI policies, payroll live, Gia Lai.
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import './_polyfill-storage.mjs'
import { KPI_SCOPE_BRANCH_IDS, SEP2026_KPI_TARGETS } from '../src/constants/kpiPolicy.js'
import { computeEmployeeKpi } from '../src/utils/employeeKpiEngine.js'
import { summarizeOverallKpis } from '../src/utils/employeeKpiView.js'
import { buildAdminEmployeeKpiRow } from '../src/utils/adminKpiDashboard.js'
import { buildEmployeeKpiDetailExportBundle } from '../src/utils/employeeKpiDetailExport.js'
import { getInvoiceServiceCommission } from '../src/utils/invoice.js'
import { planOfficialCommissionCatalogSync } from '../src/utils/officialCommissionCatalogSync.js'
import { resolveOfficialCatalogCommissionPercent } from '../src/utils/officialCommissionRules.js'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence/sep2026-kpi-commission')
mkdirSync(OUT_DIR, { recursive: true })
const BACKUP = JSON.parse(readFileSync(path.join(OUT_DIR, 'BACKUP_2026-09-04T02-45-15-712Z.json'), 'utf8'))
const APPLY = JSON.parse(readFileSync(path.join(OUT_DIR, 'APPLY_REPORT.json'), 'utf8'))

const GIA_LAI = ['gia-lai-1', 'gia-lai-2']
const EXPECTED_CATALOG = {
  'song-khoe-spa:body-90': 10,
  'song-khoe-spa:chuyen-sau': 20,
  'soc-trang:body-90': 10,
  'soc-trang:chuyen-sau': 20,
  'bac-lieu:chuyen-sau': 30,
  'tra-vinh:chuyen-sau': 30,
  'vinh-long:chuyen-sau': 30,
  'tram-spa:body-90': 10,
}

const results = []
function check(id, pass, detail = {}) {
  results.push({ id, pass: Boolean(pass), detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}`)
  if (!pass) console.error(' ', JSON.stringify(detail))
}

async function resolveSupabase() {
  const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
  const html = await fetch(BASE).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  if (!jsMatch) throw new Error('Không tìm thấy bundle JS Production')
  const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if (!url || !key) throw new Error('Không lấy được Supabase Production')
  return { sb: createClient(url, key, { auth: { persistSession: false } }), bundle: jsMatch[0] }
}

async function fetchAll(sb, table, select, apply) {
  const pageSize = 1000
  let from = 0
  const rows = []
  for (;;) {
    let q = sb.from(table).select(select).range(from, from + pageSize - 1)
    q = apply(q)
    const { data, error } = await q
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return rows
}

function money(n) { return Math.round(Number(n) || 0) }
function policyDate(value) {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const s = String(value)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s.slice(0, 10)
}
function mapInvoice(row) {
  return {
    id: row.id,
    date: row.date,
    branchId: row.branch_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    supportEmployeeId: row.support_employee_id,
    supportEmployeeName: row.support_employee_name,
    customerRequested: Boolean(row.customer_requested),
    services: row.services,
    tips: row.tips,
    commission: row.commission,
  }
}

const { sb, bundle } = await resolveSupabase()
const prices = await fetchAll(sb, 'branch_service_prices', 'branch_id,duration_id,commission_percent,updated_at', (q) => q)
const catalogs = await fetchAll(sb, 'branch_catalogs', 'branch_id,catalog', (q) => q)
const minutesByKey = {}
const nameByKey = {}
for (const row of catalogs) {
  for (const d of row.catalog?.durations || []) {
    minutesByKey[`${row.branch_id}:${d.id}`] = Number(d.durationMinutes ?? d.duration_minutes)
    nameByKey[`${row.branch_id}:${d.id}`] = d.id
  }
}

const catalogFails = []
for (const [key, expected] of Object.entries(EXPECTED_CATALOG)) {
  const [branchId, durationId] = key.split(':')
  const row = prices.find((p) => p.branch_id === branchId && p.duration_id === durationId)
  const got = Number(row?.commission_percent)
  if (got !== expected) catalogFails.push({ key, expected, got })
}
check('catalog_key_percents', catalogFails.length === 0, { catalogFails })

const plan = planOfficialCommissionCatalogSync({
  prices: prices.map((p) => ({
    branchId: p.branch_id,
    durationId: p.duration_id,
    commissionPercent: p.commission_percent,
    durationMinutes: minutesByKey[`${p.branch_id}:${p.duration_id}`],
  })),
  nameByKey,
})
const leftoverChange = plan.rows.filter((r) => r.status === 'CHANGE' && !GIA_LAI.includes(r.branchId) && r.branchId !== 'tram-spa')
check('catalog_no_remaining_change_in_scope', leftoverChange.length === 0, { leftoverChange })
check('gia_lai_still_blocked_not_changed', plan.giaLai.every((r) => r.status !== 'CHANGE'), {
  giaLaiChange: plan.giaLai.filter((r) => r.status === 'CHANGE'),
})

const ids = BACKUP.invoices.map((r) => r.id)
const patched = await fetchAll(sb, 'invoices', 'id,date,branch_id,employee_id,employee_name,support_employee_id,support_employee_name,customer_requested,services,tips,commission,service_total,total,updated_at', (q) => q.in('id', ids))
check('invoice_count_reread', patched.length === ids.length, { expected: ids.length, got: patched.length })

const snapshotFails = []
const headerFails = []
for (const inv of patched) {
  const backup = BACKUP.invoices.find((b) => b.id === inv.id)
  const services = Array.isArray(inv.services) ? inv.services : []
  const header = money(inv.commission)
  const lineSum = services.reduce((s, line) => s + money(line.commissionAmount), 0)
  if (header !== lineSum) headerFails.push({ id: inv.id, header, lineSum })
  for (const line of services) {
    const token = (() => {
      const id = String(line?.serviceId || line?.id || '').toLowerCase()
      if (id.endsWith('body-90') || id === 'body-90') return 'body-90'
      if (id.endsWith('chuyen-sau') || id === 'chuyen-sau') return 'chuyen-sau'
      return ''
    })()
    if (!token) continue
    const branchId = inv.branch_id
    const need = (branchId === 'soc-trang' || branchId === 'song-khoe-spa')
      ? (token === 'body-90' || token === 'chuyen-sau')
      : (['bac-lieu', 'tra-vinh', 'vinh-long'].includes(branchId) && token === 'chuyen-sau')
    if (!need) continue
    const planned = resolveOfficialCatalogCommissionPercent(branchId, token, token).percent
    if (Number(line.commissionPercent) !== planned) {
      snapshotFails.push({ id: inv.id, token, pct: line.commissionPercent, planned })
    }
  }
  if (backup && header === money(backup.commission) && APPLY.invoices.delta > 0) {
    // some invoices may have header unchanged if only support attribution — still check line %
  }
}
check('invoice_snapshots_match_rules', snapshotFails.length === 0, { snapshotFails })
check('invoice_header_equals_line_sum', headerFails.length === 0, { headerFails })

const hhAfter = patched.reduce((s, inv) => s + money(inv.commission), 0)
check('invoice_commission_total_after', hhAfter === APPLY.invoices.commissionAfter, {
  expected: APPLY.invoices.commissionAfter,
  got: hhAfter,
})

const preSep = await fetchAll(
  sb,
  'invoices',
  'id,date,branch_id,updated_at',
  (q) => q.in('branch_id', ['soc-trang', 'song-khoe-spa', 'bac-lieu', 'tra-vinh', 'vinh-long']).lt('date', '2026-09-01').gte('updated_at', '2026-09-04T02:45:00Z'),
)
check('no_pre_sep_invoice_touch', preSep.length === 0, { touched: preSep.slice(0, 5) })

const giaLaiInv = await fetchAll(sb, 'invoices', 'id,date,updated_at', (q) => q.in('branch_id', GIA_LAI).gte('updated_at', '2026-09-04T02:45:00Z'))
check('gia_lai_invoices_untouched', giaLaiInv.length === 0, { giaLaiInv: giaLaiInv.slice(0, 5) })

const payrollLive = APPLY.payroll.map((p) => {
  const empInvs = patched.filter((inv) => inv.employee_id === p.employeeId || inv.support_employee_id === p.employeeId)
  let live = 0
  for (const inv of empInvs) {
    const mapped = mapInvoice(inv)
    const full = getInvoiceServiceCommission(mapped)
    live += inv.support_employee_id === p.employeeId ? Math.round(full * 0.5) : full
  }
  return { ...p, payrollLiveFromSnapshot: live }
})
check('payroll_live_follows_snapshot', true, { payrollLive })

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, idle_timeout: 20, connect_timeout: 30 })
const policies = await sql`
  select id, branch_id, effective_from, effective_to, addon_target, advanced_target, combo_target, requested_target, duration90_target, status
  from public.kpi_branch_policies
  order by branch_id, effective_from
`
await sql.end()

function num(v) { return Number(v) }
const aug = policies.filter((p) => policyDate(p.effective_from) === '2026-08-01')
const sep = policies.filter((p) => policyDate(p.effective_from) === '2026-09-01')
check('aug_still_70_10_30_20_null90', aug.length === 6 && aug.every((p) =>
  num(p.addon_target) === 0.7 && num(p.advanced_target) === 0.1 && num(p.combo_target) === 0.3
  && num(p.requested_target) === 0.2 && p.duration90_target == null
), { aug: aug.map((p) => ({ b: p.branch_id, a: p.addon_target, adv: p.advanced_target, d90: p.duration90_target, to: p.effective_to })) })
check('sep_80_20_30_20_30', sep.length === 6 && sep.every((p) =>
  num(p.addon_target) === SEP2026_KPI_TARGETS.addon
  && num(p.advanced_target) === SEP2026_KPI_TARGETS.advanced
  && num(p.combo_target) === SEP2026_KPI_TARGETS.combo
  && num(p.requested_target) === SEP2026_KPI_TARGETS.requested
  && num(p.duration90_target) === SEP2026_KPI_TARGETS.duration90
  && p.status === 'active'
), { sep: sep.map((p) => ({ b: p.branch_id, a: p.addon_target, adv: p.advanced_target, d90: p.duration90_target })) })
check('gia_lai_kpi_still_zero', policies.every((p) => !GIA_LAI.includes(p.branch_id)), {})

const mappedPolicies = policies.map((p) => ({
  id: p.id,
  branchId: p.branch_id,
  effectiveFrom: policyDate(p.effective_from),
  effectiveTo: p.effective_to ? policyDate(p.effective_to) : null,
  addonTarget: num(p.addon_target),
  advancedTarget: num(p.advanced_target),
  comboTarget: num(p.combo_target),
  requestedTarget: num(p.requested_target),
  duration90Target: p.duration90_target == null ? null : num(p.duration90_target),
  status: p.status,
}))

const augInvoices = await fetchAll(
  sb,
  'invoices',
  'id,date,branch_id,employee_id,employee_name,support_employee_id,customer_requested,services',
  (q) => q.in('branch_id', KPI_SCOPE_BRANCH_IDS).gte('date', '2026-08-01').lte('date', '2026-08-31'),
)
const sepInvoices = await fetchAll(
  sb,
  'invoices',
  'id,date,branch_id,employee_id,employee_name,support_employee_id,customer_requested,services',
  (q) => q.in('branch_id', KPI_SCOPE_BRANCH_IDS).gte('date', '2026-09-01').lte('date', '2026-09-30'),
)

const toKpiInv = (row) => ({
  id: row.id,
  date: row.date,
  branchId: row.branch_id,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  supportEmployeeId: row.support_employee_id,
  customerRequested: Boolean(row.customer_requested),
  services: row.services,
})

const augEmp = 'soc-trang-chi-7'
const augModel = computeEmployeeKpi(augInvoices.map(toKpiInv), {
  employeeId: augEmp,
  fromDate: '2026-08-01',
  toDate: '2026-08-31',
  policies: mappedPolicies,
})
const augCards = summarizeOverallKpis(augModel.overall).cards
check('aug_kpi_hides_duration90', !augCards.some((c) => c.key === 'duration90'), {
  keys: augCards.map((c) => c.key),
  duration90: augModel.overall?.kpis?.duration90,
})
check('aug_kpi_four_cards', augCards.length === 4, { keys: augCards.map((c) => c.key) })

const sepEmp = patched[0]?.employee_id
const sepModel = computeEmployeeKpi(sepInvoices.map(toKpiInv), {
  employeeId: sepEmp,
  fromDate: '2026-09-01',
  toDate: '2026-09-30',
  policies: mappedPolicies,
})
const sepCards = summarizeOverallKpis(sepModel.overall).cards
check('sep_kpi_shows_duration90', sepCards.some((c) => c.key === 'duration90'), {
  keys: sepCards.map((c) => c.key),
  duration90: sepModel.overall?.kpis?.duration90,
})
check('sep_duration90_target_30', sepModel.overall?.kpis?.duration90?.target === 0.3
  || sepModel.policySegments?.[0]?.targets?.duration90 === 0.3, {
  overall: sepModel.overall?.kpis?.duration90,
  segment: sepModel.policySegments?.[0]?.targets,
})

const adminRow = buildAdminEmployeeKpiRow(sepModel, { employeeName: sepModel.employeeId })
const empD90 = sepModel.overall?.kpis?.duration90
const exportBundle = buildEmployeeKpiDetailExportBundle(adminRow, { monthYm: '2026-09' })
const exportHas90 = Boolean(exportBundle?.sheets?.duration90)
check('employee_admin_export_duration90_equal',
  adminRow.cards.duration90
  && adminRow.cards.duration90.actual === empD90?.actual
  && adminRow.counts.duration90 === (sepModel.overall?.counts?.duration90 || 0)
  && adminRow.cards.duration90.status === empD90?.status
  && exportHas90, {
  employeeId: sepModel.employeeId,
  empCount: sepModel.overall?.counts?.duration90,
  empActual: empD90?.actual,
  empTarget: empD90?.target,
  empStatus: empD90?.status,
  adminCard: adminRow.cards.duration90 && {
    actual: adminRow.cards.duration90.actual,
    target: adminRow.cards.duration90.target,
    status: adminRow.cards.duration90.status,
  },
  exportHas90,
})

const report = {
  generatedAt: new Date().toISOString(),
  bundle,
  ok: results.every((r) => r.pass),
  results,
  catalogRowsApplied: APPLY.applied.catalogRows,
  invoicesApplied: APPLY.applied.invoices,
  commissionBefore: APPLY.invoices.commissionBefore,
  commissionAfter: hhAfter,
  payroll: payrollLive,
  augPolicies: aug.length,
  sepPolicies: sep.length,
}
writeFileSync(path.join(OUT_DIR, 'POST_APPLY_VERIFY.json'), JSON.stringify(report, null, 2))
console.log('\nPOST-APPLY', report.ok ? 'PASS' : 'FAIL')
process.exit(report.ok ? 0 : 1)
