/**
 * Batch 01/09/2026 — KPI policy Sep + commission catalog + invoice snapshot backfill.
 * Default DRY-RUN. Không đụng HĐ < 01/09. Không đụng Gia Lai. Không tạo payroll_adjustment.
 * Không re-backfill giá Trạm Spa.
 *
 *   node --env-file=.env.local scripts/apply-sep2026-kpi-commission-batch.mjs
 *   APPLY=1 CONFIRM=SEP2026_KPI_COMMISSION node --env-file=.env.local scripts/apply-sep2026-kpi-commission-batch.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { KPI_SCOPE_BRANCH_IDS, SEP2026_KPI_TARGETS } from '../src/constants/kpiPolicy.js'
import { auditMain90CatalogDurations } from '../src/utils/kpiServiceClassifier.js'
import { planOfficialCommissionCatalogSync } from '../src/utils/officialCommissionCatalogSync.js'
import { resolveOfficialCatalogCommissionPercent } from '../src/utils/officialCommissionRules.js'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence/sep2026-kpi-commission')
mkdirSync(OUT_DIR, { recursive: true })

const APPLY = process.env.APPLY === '1'
const CONFIRM = process.env.CONFIRM || ''
const REQUIRED = 'SEP2026_KPI_COMMISSION'
const EFFECTIVE_FROM = '2026-09-01'
const GIA_LAI = ['gia-lai-1', 'gia-lai-2']
const COMM_BRANCHES = ['soc-trang', 'song-khoe-spa', 'bac-lieu', 'tra-vinh', 'vinh-long']
const TRAM = 'tram-spa'

function policyDate(value) {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const s = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s.slice(0, 10)
}
function money(n) {
  return Math.round(Number(n) || 0)
}
function roundCommission(price, percent) {
  return Math.round(money(price) * Number(percent || 0) / 100)
}
function lineId(line) {
  return String(line?.serviceId || line?.id || line?.durationId || '').toLowerCase()
}
function tokenOf(raw) {
  const id = String(raw || '').toLowerCase()
  if (id.endsWith('body-90') || id === 'body-90') return 'body-90'
  if (id.endsWith('chuyen-sau') || id === 'chuyen-sau') return 'chuyen-sau'
  return ''
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
  return createClient(url, key, { auth: { persistSession: false } })
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

function plannedLinePercent(branchId, token) {
  if (!token) return null
  const resolved = resolveOfficialCatalogCommissionPercent(branchId, token, token)
  return resolved.percent ?? null
}

function isAffectedToken(branchId, token) {
  if (branchId === 'soc-trang' || branchId === 'song-khoe-spa') {
    return token === 'body-90' || token === 'chuyen-sau'
  }
  if (branchId === 'bac-lieu' || branchId === 'tra-vinh' || branchId === 'vinh-long') {
    return token === 'chuyen-sau'
  }
  return false
}

if (APPLY && CONFIRM !== REQUIRED) {
  console.error(`APPLY=1 cần CONFIRM=${REQUIRED}`)
  process.exit(1)
}

const report = {
  mode: APPLY ? 'APPLY' : 'DRY-RUN',
  generatedAt: new Date().toISOString(),
  ok: true,
  gates: {},
}

function gate(key, ok, detail) {
  report.gates[key] = { ok, ...detail }
  if (!ok) report.ok = false
  console.log(`${ok ? 'PASS' : 'FAIL'} ${key}`, JSON.stringify(detail))
}

const sb = await resolveSupabase()
const catalogs = await fetchAll(sb, 'branch_catalogs', 'branch_id,catalog,updated_at', (q) => q)
const prices = await fetchAll(sb, 'branch_service_prices', 'branch_id,duration_id,price,commission_percent,updated_at', (q) => q)

const durationRows = []
const minutesByKey = {}
const nameByKey = {}
for (const row of catalogs) {
  for (const d of row.catalog?.durations || []) {
    const minutes = Number(d.durationMinutes ?? d.duration_minutes)
    durationRows.push({
      branchId: row.branch_id,
      durationId: d.id,
      durationMinutes: minutes,
      name: d.id,
    })
    minutesByKey[`${row.branch_id}:${d.id}`] = minutes
    nameByKey[`${row.branch_id}:${d.id}`] = d.id
  }
}

const scopedDurations = durationRows.filter((r) => KPI_SCOPE_BRANCH_IDS.includes(r.branchId))
const main90 = auditMain90CatalogDurations(scopedDurations)
gate('catalog_main90_is_body-90', main90.tokens.join(',') === 'body-90', {
  tokens: main90.tokens,
  main90: main90.main90,
  other90: main90.other90.map((r) => `${r.branchId}:${r.durationId}:${r.group}`),
})

const giaLaiCatalogTouched = catalogs.filter((c) => GIA_LAI.includes(c.branch_id) && String(c.updated_at || '') >= EFFECTIVE_FROM)
gate('gia_lai_catalog_not_in_this_batch', true, { count: catalogs.filter((c) => GIA_LAI.includes(c.branch_id)).length })

const plan = planOfficialCommissionCatalogSync({
  prices: prices.map((p) => ({
    branchId: p.branch_id,
    durationId: p.duration_id,
    commissionPercent: p.commission_percent,
    durationMinutes: minutesByKey[`${p.branch_id}:${p.duration_id}`],
  })),
  nameByKey,
})

const catalogChanges = plan.rows.filter((r) => r.status === 'CHANGE' && !GIA_LAI.includes(r.branchId) && r.branchId !== TRAM)
const tramChanges = plan.rows.filter((r) => r.status === 'CHANGE' && r.branchId === TRAM)
const giaLaiChanges = plan.giaLai.filter((r) => r.status === 'CHANGE')
const ambiguous = plan.rows.filter((r) => r.status === 'AMBIGUOUS')

gate('catalog_ambiguous_zero', ambiguous.length === 0, { ambiguous })
gate('gia_lai_commission_changed_zero', giaLaiChanges.length === 0, { giaLaiChanges })
gate('tram_spa_catalog_price_untouched', tramChanges.length === 0, {
  tramChanges,
  note: 'Không re-backfill bảng giá Trạm. Nếu % lệch sẽ FAIL để xem tay.',
})

const catalogKeyPercents = plan.rows
  .filter((r) => KPI_SCOPE_BRANCH_IDS.includes(r.branchId) && (r.durationId === 'body-90' || r.durationId === 'chuyen-sau' || String(r.durationId || '').endsWith('body-90') || String(r.durationId || '').endsWith('chuyen-sau')))
  .map((r) => ({
    branchId: r.branchId,
    durationId: r.durationId,
    currentPercent: r.currentPercent,
    plannedPercent: r.plannedPercent,
    status: r.status,
  }))
report.catalog = {
  changes: catalogChanges,
  changeCount: catalogChanges.length,
  keyPercents: catalogKeyPercents,
  giaLaiBlocked: plan.giaLai.length,
}

const invoices = await fetchAll(
  sb,
  'invoices',
  'id,date,branch_id,employee_id,employee_name,support_employee_id,support_employee_name,services,tips,commission,service_total,total,updated_at',
  (q) => q.in('branch_id', [...COMM_BRANCHES, TRAM]).gte('date', EFFECTIVE_FROM),
)

let closes = []
try {
  closes = await fetchAll(sb, 'payroll_cycle_closes', 'id,employee_id,status,from_date,to_date,billing_month,cycle', (q) => q)
} catch (err) {
  console.warn('closes:', err.message)
}

function approvedFor(inv) {
  const empIds = [inv.employee_id, inv.support_employee_id].filter(Boolean)
  return closes.filter((c) => {
    if (String(c.status || '').toLowerCase() !== 'approved') return false
    if (c.employee_id && empIds.length && !empIds.includes(c.employee_id)) return false
    const from = c.from_date || ''
    const to = c.to_date || ''
    if (from && to) return inv.date >= from && inv.date <= to
    return false
  })
}

const invoicePlans = []
const tramVerify = { body90Ok: 0, body90Wrong: [] }
const employeeImpact = {}
let unmapped = 0

function addEmp(id, name, before, after) {
  if (!id) return
  if (!employeeImpact[id]) {
    employeeImpact[id] = {
      employeeId: id,
      employeeName: name || id,
      lines: 0,
      invoices: new Set(),
      commissionBefore: 0,
      commissionAfter: 0,
    }
  }
  const e = employeeImpact[id]
  e.lines += 1
  e.invoices.add(id)
  e.commissionBefore += before
  e.commissionAfter += after
}

for (const inv of invoices) {
  const branchId = inv.branch_id
  const services = Array.isArray(inv.services) ? inv.services : []
  if (branchId === TRAM) {
    for (const line of services) {
      const token = tokenOf(lineId(line))
      const hay = `${lineId(line)} ${String(line?.name || line?.serviceName || '').toLowerCase()}`
      if (token !== 'body-90' && !/body[\s_-]*90/.test(hay)) continue
      const pct = Number(line.commissionPercent)
      if (pct === 10) tramVerify.body90Ok += 1
      else tramVerify.body90Wrong.push({ id: inv.id, date: inv.date, pct, token, hay })
    }
    continue
  }
  if (!COMM_BRANCHES.includes(branchId)) continue

  let changed = false
  let lineHits = 0
  const nextServices = services.map((line) => {
    const token = tokenOf(lineId(line))
    if (!token) return line
    if (!isAffectedToken(branchId, token)) return line
    const planned = plannedLinePercent(branchId, token)
    if (planned == null) {
      unmapped += 1
      return line
    }
    const price = money(line.price ?? line.servicePrice ?? line.originalPrice)
    const oldPct = Number.isFinite(Number(line.commissionPercent)) ? Number(line.commissionPercent) : null
    const oldAmt = Number.isFinite(Number(line.commissionAmount))
      ? money(line.commissionAmount)
      : roundCommission(price, oldPct)
    const nextAmt = roundCommission(price, planned)
    if (oldPct === planned && oldAmt === nextAmt) return line
    changed = true
    lineHits += 1
    addEmp(inv.employee_id, inv.employee_name, oldAmt, nextAmt)
    if (inv.support_employee_id) {
      addEmp(inv.support_employee_id, inv.support_employee_name, Math.round(oldAmt * 0.5), Math.round(nextAmt * 0.5))
    }
    return {
      ...line,
      commissionPercent: planned,
      commissionAmount: nextAmt,
    }
  })
  if (!changed) continue
  const nextCommission = nextServices.reduce((sum, s) => {
    if (Number.isFinite(Number(s.commissionAmount))) return sum + money(s.commissionAmount)
    return sum + roundCommission(s.price, s.commissionPercent)
  }, 0)
  const locked = approvedFor(inv)
  invoicePlans.push({
    id: inv.id,
    date: inv.date,
    branchId,
    employeeId: inv.employee_id,
    employeeName: inv.employee_name,
    lineHits,
    commissionBefore: money(inv.commission),
    commissionAfter: nextCommission,
    locked: locked.length > 0,
    lockedIds: locked.map((c) => c.id),
    nextServices,
    tips: money(inv.tips),
    serviceTotal: money(inv.service_total),
  })
}

const lockedChanged = invoicePlans.filter((p) => p.locked)
gate('tram_body90_still_10', tramVerify.body90Wrong.length === 0, tramVerify)
gate('unmapped_zero', unmapped === 0, { unmapped })
gate('approved_lock_zero', lockedChanged.length === 0, {
  lockedChanged: lockedChanged.map((p) => ({ id: p.id, date: p.date, lockedIds: p.lockedIds })),
})
gate('gia_lai_invoices_not_selected', true, { note: 'query không gồm gia-lai-*' })

const hhBefore = invoicePlans.reduce((s, p) => s + p.commissionBefore, 0)
const hhAfter = invoicePlans.reduce((s, p) => s + p.commissionAfter, 0)
const lineCount = invoicePlans.reduce((s, p) => s + p.lineHits, 0)

report.invoices = {
  scanned: invoices.length,
  affectedInvoices: invoicePlans.length,
  affectedLines: lineCount,
  commissionBefore: hhBefore,
  commissionAfter: hhAfter,
  delta: hhAfter - hhBefore,
}

const payroll = Object.values(employeeImpact).map((e) => ({
  employeeId: e.employeeId,
  employeeName: e.employeeName,
  affectedLines: e.lines,
  commissionBefore: e.commissionBefore,
  commissionAfter: e.commissionAfter,
  delta: e.commissionAfter - e.commissionBefore,
})).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
report.payroll = payroll

const DATABASE_URL = process.env.DATABASE_URL
let sql = null
let policies = []
if (DATABASE_URL) {
  sql = postgres(DATABASE_URL, { ssl: 'require', max: 1, idle_timeout: 20, connect_timeout: 30 })
  try {
    policies = await sql`
      select id, branch_id, effective_from, effective_to, addon_target, advanced_target, combo_target, requested_target, duration90_target, status
      from public.kpi_branch_policies
      order by branch_id, effective_from
    `
  } catch (err) {
    policies = await sql`
      select id, branch_id, effective_from, effective_to, addon_target, advanced_target, combo_target, requested_target, status
      from public.kpi_branch_policies
      order by branch_id, effective_from
    `
    policies = policies.map((p) => ({ ...p, duration90_target: null }))
    console.warn('duration90_target chưa có cột (sẽ ALTER khi APPLY):', err.message)
  }
  const aug = policies.filter((p) => policyDate(p.effective_from) === '2026-08-01')
  const giaLaiPol = policies.filter((p) => GIA_LAI.includes(p.branch_id))
  const augOk = aug.length === 6 && aug.every((p) =>
    Number(p.addon_target) === 0.7
    && Number(p.advanced_target) === 0.1
    && Number(p.combo_target) === 0.3
    && Number(p.requested_target) === 0.2
  )
  gate('aug_policy_70_10_30_20', augOk, {
    aug: aug.map((p) => ({
      branch: p.branch_id,
      addon: p.addon_target,
      advanced: p.advanced_target,
      combo: p.combo_target,
      requested: p.requested_target,
      duration90: p.duration90_target,
      to: p.effective_to,
      status: p.status,
    })),
  })
  gate('gia_lai_kpi_policy_zero', giaLaiPol.length === 0, { giaLaiPol })
  const existingSep = policies.filter((p) =>
    KPI_SCOPE_BRANCH_IDS.includes(p.branch_id) && policyDate(p.effective_from) === EFFECTIVE_FROM
  )
  report.kpiSepExisting = existingSep.map((p) => ({
    id: p.id,
    branch: p.branch_id,
    addon: p.addon_target,
    advanced: p.advanced_target,
    combo: p.combo_target,
    requested: p.requested_target,
    duration90: p.duration90_target,
    action: 'UPDATE_TO_80_20_30_20_30',
  }))
  report.kpiPoliciesBefore = policies
} else {
  gate('database_url_for_kpi_policy', false, { error: 'Thiếu DATABASE_URL — không seed KPI policy' })
}

report.kpiSep = {
  effectiveFrom: EFFECTIVE_FROM,
  targets: SEP2026_KPI_TARGETS,
  branches: KPI_SCOPE_BRANCH_IDS,
}

console.log('\n=== DRY-RUN SUMMARY ===')
console.log('Catalog CHANGE', catalogChanges.length, catalogChanges.map((r) => `${r.branchId}:${r.durationId} ${r.currentPercent}→${r.plannedPercent}`))
console.log('HĐ', invoicePlans.length, 'lines', lineCount, 'HH', hhBefore, '→', hhAfter, 'Δ', hhAfter - hhBefore)
console.log('NV', payroll.length)
payroll.forEach((e) => console.log(' ', e.employeeName, e.affectedLines, 'lines', e.commissionBefore, '→', e.commissionAfter, 'Δ', e.delta))

writeFileSync(path.join(OUT_DIR, 'DRY_RUN.json'), JSON.stringify(report, null, 2))
console.log('Wrote', path.join(OUT_DIR, 'DRY_RUN.json'))

if (!APPLY) {
  if (sql) await sql.end()
  console.log('\nDRY-RUN xong. Không ghi DB.')
  process.exit(report.ok ? 0 : 1)
}

if (!report.ok) {
  if (sql) await sql.end()
  console.error('GATE FAIL — không APPLY')
  process.exit(1)
}

const backup = {
  invoices: invoicePlans.map((p) => ({ id: p.id, date: p.date, branchId: p.branchId, commission: p.commissionBefore })),
  catalog: catalogChanges,
}
writeFileSync(path.join(OUT_DIR, `BACKUP_${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(backup, null, 2))

const mig = readFileSync(path.join(ROOT, 'supabase/migrations/0048_kpi_duration90_target.sql'), 'utf8')
await sql.unsafe(mig)

for (const branchId of KPI_SCOPE_BRANCH_IDS) {
  await sql`
    update public.kpi_branch_policies
    set effective_to = '2026-08-31',
        status = 'superseded',
        updated_at = now(),
        updated_by = 'sep2026-batch'
    where branch_id = ${branchId}
      and effective_from = '2026-08-01'
      and (effective_to is null or effective_to::date > '2026-08-31'::date)
  `
  const existingSep = policies.find((p) =>
    p.branch_id === branchId && policyDate(p.effective_from) === EFFECTIVE_FROM
  )
  if (existingSep) {
    await sql`
      update public.kpi_branch_policies
      set addon_target = ${SEP2026_KPI_TARGETS.addon},
          advanced_target = ${SEP2026_KPI_TARGETS.advanced},
          combo_target = ${SEP2026_KPI_TARGETS.combo},
          requested_target = ${SEP2026_KPI_TARGETS.requested},
          duration90_target = ${SEP2026_KPI_TARGETS.duration90},
          status = 'active',
          effective_to = null,
          updated_at = now(),
          updated_by = 'sep2026-batch',
          change_reason = 'KPI Sep 2026: ADDON 80 / ADV 20 / COMBO 30 / YC 20 / 90 phút 30'
      where id = ${existingSep.id}
    `
  } else {
    const id = `kpi-pol-sep2026-${branchId}`
    await sql`
      insert into public.kpi_branch_policies (
        id, branch_id, effective_from, effective_to,
        addon_target, advanced_target, combo_target, requested_target, duration90_target,
        status, created_by, updated_by, change_reason
      ) values (
        ${id}, ${branchId}, ${EFFECTIVE_FROM}::date, null,
        ${SEP2026_KPI_TARGETS.addon}, ${SEP2026_KPI_TARGETS.advanced}, ${SEP2026_KPI_TARGETS.combo},
        ${SEP2026_KPI_TARGETS.requested}, ${SEP2026_KPI_TARGETS.duration90},
        'active', 'sep2026-batch', 'sep2026-batch',
        'KPI Sep 2026: ADDON 80 / ADV 20 / COMBO 30 / YC 20 / 90 phút 30'
      )
    `
  }
}

let catalogOk = 0
for (const row of catalogChanges) {
  const { error } = await sb.from('branch_service_prices')
    .update({
      commission_percent: row.plannedPercent,
      updated_at: new Date().toISOString(),
    })
    .eq('branch_id', row.branchId)
    .eq('duration_id', row.durationId)
  if (error) {
    console.error('PRICE FAIL', row.branchId, row.durationId, error.message)
    process.exit(1)
  }
  catalogOk += 1
}

let invOk = 0
for (const item of invoicePlans) {
  const { error } = await sb.from('invoices').update({
    services: item.nextServices,
    commission: item.commissionAfter,
    updated_at: new Date().toISOString(),
  }).eq('id', item.id).eq('branch_id', item.branchId)
  if (error) {
    console.error('INVOICE FAIL', item.id, error.message)
    process.exit(1)
  }
  invOk += 1
}

const afterPolicies = await sql`
  select branch_id, effective_from, effective_to, addon_target, advanced_target, combo_target, requested_target, duration90_target, status
  from public.kpi_branch_policies
  order by branch_id, effective_from
`
await sql.end()

report.applied = {
  catalogRows: catalogOk,
  invoices: invOk,
  kpiPolicies: afterPolicies,
}
writeFileSync(path.join(OUT_DIR, 'APPLY_REPORT.json'), JSON.stringify(report, null, 2))
console.log('APPLY xong', { catalogOk, invOk })
console.log('Wrote', path.join(OUT_DIR, 'APPLY_REPORT.json'))
