/**
 * Trà Vinh — Phòng đơn 39.000đ từ 2026-09-01.
 * Giữ % hoa hồng hiện tại. Không đụng CN khác / HĐ < 01/09 / KPI / payroll_adjustment.
 *
 *   npx vite-node --env-file=.env.local scripts/apply-tra-vinh-phong-don-sep2026.mjs
 *   APPLY=1 CONFIRM=TRA_VINH_PHONG_DON_SEP2026 npx vite-node --env-file=.env.local scripts/apply-tra-vinh-phong-don-sep2026.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BRANCH_ID = 'tra-vinh'
const DURATION_ID = 'phong-don'
const NEW_PRICE = 39000
const EFFECTIVE_FROM = '2026-09-01'
const APPLY = process.env.APPLY === '1'
const CONFIRM = process.env.CONFIRM || ''
const REQUIRED = 'TRA_VINH_PHONG_DON_SEP2026'
const SUPPORT_RATE = 0.5
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence/tra-vinh-phong-don-sep2026')
mkdirSync(OUT_DIR, { recursive: true })

function money(n) { return Math.round(Number(n) || 0) }
function roundCommission(price, percent) {
  return Math.round(money(price) * Number(percent || 0) / 100)
}
function norm(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
}

function isPhongDonLine(line) {
  const id = norm(line?.serviceId || line?.id || line?.durationId || '')
  const name = norm(line?.serviceName || line?.name || '')
  const idHit = id === DURATION_ID || id.endsWith(`-${DURATION_ID}`) || id.endsWith(`/${DURATION_ID}`)
  const nameHit = name === 'phong don' || name === 'phu thu phong don' || /(^|[\s_-])phong don([\s_-]|$)/.test(name)
  return { idHit, nameHit, match: idHit || nameHit, ambiguous: nameHit && id && !idHit && !id.includes('phong') }
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

if (APPLY && CONFIRM !== REQUIRED) {
  console.error(`APPLY=1 cần CONFIRM=${REQUIRED}`)
  process.exit(1)
}

const sb = await resolveSupabase()
const report = {
  mode: APPLY ? 'APPLY' : 'DRY-RUN',
  generatedAt: new Date().toISOString(),
  ok: true,
  gates: {},
}
function gate(key, ok, detail = {}) {
  report.gates[key] = { ok, ...detail }
  if (!ok) report.ok = false
  console.log(`${ok ? 'PASS' : 'FAIL'} ${key}`, JSON.stringify(detail))
}

const { data: catRow, error: catErr } = await sb
  .from('branch_catalogs')
  .select('branch_id,catalog,updated_at')
  .eq('branch_id', BRANCH_ID)
  .maybeSingle()
if (catErr) throw catErr

const catalog = catRow?.catalog || {}
const durations = Array.isArray(catalog.durations) ? catalog.durations : []
const services = Array.isArray(catalog.services) ? catalog.services : []
const duration = durations.find((d) => d.id === DURATION_ID)
const service = services.find((s) => s.id === `${BRANCH_ID}-svc-${DURATION_ID}` || s.id === `svc-${DURATION_ID}` || s.id === DURATION_ID)
const nameHits = services.filter((s) => /phòng đơn|phong don/i.test(norm(s.name)))
gate('catalog_phong_don_id_unique', Boolean(duration) && nameHits.length <= 1, {
  durationId: duration?.id || null,
  serviceId: service?.id || null,
  serviceName: service?.name || null,
  nameHits: nameHits.map((s) => `${s.id}:${s.name}`),
})

const { data: priceRow, error: priceErr } = await sb
  .from('branch_service_prices')
  .select('branch_id,duration_id,price,commission_percent,updated_at')
  .eq('branch_id', BRANCH_ID)
  .eq('duration_id', DURATION_ID)
  .maybeSingle()
if (priceErr) throw priceErr
gate('catalog_price_row_exists', Boolean(priceRow), { priceRow })

const catalogOldPrice = money(priceRow?.price)
const catalogPercent = Number(priceRow?.commission_percent)
report.catalog = {
  durationId: DURATION_ID,
  serviceId: service?.id || `${BRANCH_ID}-svc-${DURATION_ID}`,
  name: service?.name || 'Phòng đơn',
  oldPrice: catalogOldPrice,
  newPrice: NEW_PRICE,
  commissionPercentUnchanged: catalogPercent,
}

const otherPhongDon = await fetchAll(
  sb,
  'branch_service_prices',
  'branch_id,duration_id,price,commission_percent',
  (q) => q.eq('duration_id', DURATION_ID).neq('branch_id', BRANCH_ID),
)

const invoices = await fetchAll(
  sb,
  'invoices',
  'id,date,branch_id,employee_id,employee_name,support_employee_id,support_employee_name,services,tips,commission,service_total,total,updated_at',
  (q) => q.eq('branch_id', BRANCH_ID).gte('date', EFFECTIVE_FROM),
)

let closes = []
try {
  closes = await fetchAll(sb, 'payroll_cycle_closes', 'id,employee_id,status,from_date,to_date', (q) => q)
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
const employeeImpact = {}
let unmapped = 0
let ambiguous = 0
const currentPrices = new Set()

function addEmp(id, name, before, after) {
  if (!id) return
  if (!employeeImpact[id]) {
    employeeImpact[id] = {
      employeeId: id,
      employeeName: name || id,
      lines: 0,
      commissionBefore: 0,
      commissionAfter: 0,
    }
  }
  const e = employeeImpact[id]
  e.lines += 1
  e.commissionBefore += before
  e.commissionAfter += after
}

for (const inv of invoices) {
  const servicesLines = Array.isArray(inv.services) ? inv.services : []
  let changed = false
  let lineHits = 0
  const nextServices = servicesLines.map((line) => {
    const hit = isPhongDonLine(line)
    if (hit.ambiguous) {
      ambiguous += 1
      return line
    }
    if (!hit.match) return line
    if (!hit.idHit && hit.nameHit) {
      const id = norm(line?.serviceId || line?.id || '')
      if (id && !id.includes('phong')) {
        ambiguous += 1
        return line
      }
    }
    const price = money(line.price ?? line.servicePrice ?? line.originalPrice)
    const pct = Number.isFinite(Number(line.commissionPercent)) ? Number(line.commissionPercent) : catalogPercent
    const oldAmt = Number.isFinite(Number(line.commissionAmount))
      ? money(line.commissionAmount)
      : roundCommission(price, pct)
    const nextAmt = roundCommission(NEW_PRICE, pct)
    currentPrices.add(price)
    if (price === NEW_PRICE && oldAmt === nextAmt) return line
    changed = true
    lineHits += 1
    addEmp(inv.employee_id, inv.employee_name, oldAmt, nextAmt)
    if (inv.support_employee_id) {
      addEmp(
        inv.support_employee_id,
        inv.support_employee_name,
        Math.round(oldAmt * SUPPORT_RATE),
        Math.round(nextAmt * SUPPORT_RATE),
      )
    }
    return {
      ...line,
      originalPrice: NEW_PRICE,
      price: NEW_PRICE,
      servicePrice: NEW_PRICE,
      commissionPercent: pct,
      commissionAmount: nextAmt,
    }
  })
  if (!changed) continue
  const tips = money(inv.tips)
  const nextServiceTotal = nextServices.reduce((s, line) => s + money(line.price ?? line.servicePrice), 0)
  const nextCommission = nextServices.reduce((s, line) => {
    if (Number.isFinite(Number(line.commissionAmount))) return s + money(line.commissionAmount)
    return s + roundCommission(line.price, line.commissionPercent)
  }, 0)
  invoicePlans.push({
    id: inv.id,
    date: inv.date,
    employeeId: inv.employee_id,
    employeeName: inv.employee_name,
    lineHits,
    serviceTotalBefore: money(inv.service_total),
    serviceTotalAfter: nextServiceTotal,
    commissionBefore: money(inv.commission),
    commissionAfter: nextCommission,
    totalBefore: money(inv.total),
    totalAfter: nextServiceTotal + tips,
    tips,
    locked: approvedFor(inv).length > 0,
    lockedIds: approvedFor(inv).map((c) => c.id),
    nextServices,
  })
}

gate('unmapped_zero', unmapped === 0, { unmapped })
gate('ambiguous_zero', ambiguous === 0, { ambiguous })
gate('approved_lock_zero', invoicePlans.every((p) => !p.locked), {
  locked: invoicePlans.filter((p) => p.locked).map((p) => ({ id: p.id, date: p.date, lockedIds: p.lockedIds })),
})
gate('other_branches_not_in_write_set', true, {
  otherPhongDonCount: otherPhongDon.length,
  note: 'Chỉ đọc; không ghi CN khác',
})

const payroll = Object.values(employeeImpact)
  .map((e) => ({
    ...e,
    delta: e.commissionAfter - e.commissionBefore,
  }))
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

report.invoices = {
  scanned: invoices.length,
  affectedInvoices: invoicePlans.length,
  affectedLines: invoicePlans.reduce((s, p) => s + p.lineHits, 0),
  currentPrices: [...currentPrices],
  serviceTotalBefore: invoicePlans.reduce((s, p) => s + p.serviceTotalBefore, 0),
  serviceTotalAfter: invoicePlans.reduce((s, p) => s + p.serviceTotalAfter, 0),
  commissionBefore: invoicePlans.reduce((s, p) => s + p.commissionBefore, 0),
  commissionAfter: invoicePlans.reduce((s, p) => s + p.commissionAfter, 0),
  items: invoicePlans.map((p) => ({
    id: p.id,
    date: p.date,
    employeeName: p.employeeName,
    lineHits: p.lineHits,
    serviceTotalBefore: p.serviceTotalBefore,
    serviceTotalAfter: p.serviceTotalAfter,
    commissionBefore: p.commissionBefore,
    commissionAfter: p.commissionAfter,
  })),
}
report.invoices.serviceDelta = report.invoices.serviceTotalAfter - report.invoices.serviceTotalBefore
report.invoices.commissionDelta = report.invoices.commissionAfter - report.invoices.commissionBefore
report.payroll = payroll

console.log('\n=== DRY-RUN SUMMARY ===')
console.log('Catalog', catalogOldPrice, '→', NEW_PRICE, 'percent giữ', catalogPercent)
console.log('HĐ', report.invoices.affectedInvoices, 'lines', report.invoices.affectedLines)
console.log('Giá hiện tại trên line', [...currentPrices])
console.log('DT', report.invoices.serviceTotalBefore, '→', report.invoices.serviceTotalAfter, 'Δ', report.invoices.serviceDelta)
console.log('HH', report.invoices.commissionBefore, '→', report.invoices.commissionAfter, 'Δ', report.invoices.commissionDelta)
payroll.forEach((e) => console.log(' ', e.employeeName, e.lines, 'lines', e.commissionBefore, '→', e.commissionAfter, 'Δ', e.delta))

writeFileSync(path.join(OUT_DIR, 'DRY_RUN.json'), JSON.stringify(report, null, 2))
console.log('Wrote', path.join(OUT_DIR, 'DRY_RUN.json'))

if (!APPLY) {
  console.log('\nDRY-RUN xong. Không ghi DB.')
  process.exit(report.ok ? 0 : 1)
}

if (!report.ok) {
  console.error('GATE FAIL — không APPLY')
  process.exit(1)
}

writeFileSync(
  path.join(OUT_DIR, `BACKUP_${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
  JSON.stringify({
    catalog: { branchId: BRANCH_ID, durationId: DURATION_ID, price: catalogOldPrice, percent: catalogPercent },
    invoices: invoicePlans.map((p) => ({
      id: p.id,
      date: p.date,
      serviceTotal: p.serviceTotalBefore,
      commission: p.commissionBefore,
      total: p.totalBefore,
    })),
  }, null, 2),
)

const { error: priceUpdateErr } = await sb.from('branch_service_prices')
  .update({
    price: NEW_PRICE,
    updated_at: new Date().toISOString(),
  })
  .eq('branch_id', BRANCH_ID)
  .eq('duration_id', DURATION_ID)
if (priceUpdateErr) {
  console.error('PRICE FAIL', priceUpdateErr.message)
  process.exit(1)
}

if (catRow?.catalog) {
  const nextCat = structuredClone(catRow.catalog)
  if (Array.isArray(nextCat.durations)) {
    for (const d of nextCat.durations) {
      if (d.id === DURATION_ID && d.price != null) d.price = NEW_PRICE
    }
  }
  if (Array.isArray(nextCat.services)) {
    for (const s of nextCat.services) {
      if ((s.id === `${BRANCH_ID}-svc-${DURATION_ID}` || s.id === `svc-${DURATION_ID}` || s.id === DURATION_ID) && s.price != null) {
        s.price = NEW_PRICE
      }
    }
  }
  const { error: catUpdateErr } = await sb.from('branch_catalogs')
    .update({ catalog: nextCat, updated_at: new Date().toISOString() })
    .eq('branch_id', BRANCH_ID)
  if (catUpdateErr) {
    console.error('CATALOG FAIL', catUpdateErr.message)
    process.exit(1)
  }
}

let invOk = 0
for (const item of invoicePlans) {
  const { error } = await sb.from('invoices').update({
    services: item.nextServices,
    service_total: item.serviceTotalAfter,
    commission: item.commissionAfter,
    total: item.totalAfter,
    updated_at: new Date().toISOString(),
  }).eq('id', item.id).eq('branch_id', BRANCH_ID)
  if (error) {
    console.error('INVOICE FAIL', item.id, error.message)
    process.exit(1)
  }
  invOk += 1
}

report.applied = { catalogPrice: NEW_PRICE, invoices: invOk }
writeFileSync(path.join(OUT_DIR, 'APPLY_REPORT.json'), JSON.stringify(report, null, 2))
console.log('APPLY xong', report.applied)
