/**
 * READ-ONLY audit — commission formula vs expected rules for Kỳ 2 tháng 7 (2026-07-16..31).
 * Không ghi DB, không sửa code.
 *
 * Run: node --env-file=.env.local scripts/audit-commission-formula-jul-p2-readonly.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

async function resolveSupabase() {
  if (process.env.AUDIT_FROM_PRODUCTION === '1' || process.env.VITE_SUPABASE_ANON_KEY?.length < 40) {
    const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
    const html = await fetch(BASE).then((r) => r.text())
    const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
    if (!jsMatch) throw new Error('Không tìm thấy bundle JS Production')
    const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
    const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
    const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
      ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
    if (!url || !key) throw new Error('Không lấy được Supabase URL/key từ Production bundle')
    return { url, key, source: 'production_bundle' }
  }
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Thiếu VITE_SUPABASE_URL / ANON_KEY')
  return { url, key, source: 'env' }
}

const { url, key, source: credentialSource } = await resolveSupabase()
console.log(`Credential source: ${credentialSource}`)
const sb = createClient(url, key, { auth: { persistSession: false } })

const FROM = '2026-07-16'
const TO = '2026-07-31'

const TIERED = new Set(['tram-spa', 'soc-trang', 'song-khoe-spa'])
const FLAT20 = new Set(['tra-vinh', 'bac-lieu', 'vinh-long'])

function norm(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
}

/** Công thức đúng theo xác nhận nghiệp vụ (user). */
function expectedPercent(branchId, service) {
  const id = norm(service?.id || service?.serviceId)
  const name = norm(service?.name || service?.serviceName)
  const hay = `${id} ${name}`

  const isBody60 = /body[\s_-]*60|massage body.*60|body 60p/.test(hay)
  const isBody75 = /body[\s_-]*75|massage body.*75|body 75p/.test(hay)
  const isBody90 = /body[\s_-]*90|massage body.*90|body 90p/.test(hay)
  const isCvg = /co vai gay|cvg|co-vai-gay/.test(hay)
  const isFoot = /(^|[\s_-])foot([\s_-]|$)|massage foot|foot massage/.test(hay)
  const isCombo = /combo[\s_-]*[123]|combo 1|combo 2|combo 3/.test(hay)
  const isChuyenSau = /chuyen sau|chuyen-sau|chuyên sâu/.test(hay) || id.includes('chuyen-sau')

  if (TIERED.has(branchId)) {
    if (isBody60 || isBody75 || isBody90 || isCvg || isFoot) return 0
    if (isCombo || isChuyenSau) return 10
    return 20
  }

  if (FLAT20.has(branchId)) {
    if (branchId === 'bac-lieu' && isChuyenSau) return 30
    return 20
  }

  // Gia Lai / khác — ngoài phạm vi spec user; giữ hiện trạng 40 flat cho GL nếu cần
  if (branchId === 'gia-lai-1' || branchId === 'gia-lai-2') return 40
  return 20
}

function money(n) {
  return Math.round(Number(n) || 0)
}

async function fetchAll(table, select, apply) {
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

console.log(`Credential source: ${credentialSource}`)
console.log(`\n=== READ-ONLY commission audit Kỳ 2/7 ${FROM}→${TO} ===\n`)

async function tryFetch(label, fn) {
  try {
    return await fn()
  } catch (err) {
    console.warn(`[WARN] ${label}: ${err?.message || err}`)
    return []
  }
}

const [invoices, policies, prices, closes] = await Promise.all([
  fetchAll('invoices', 'id,date,branch_id,employee_id,support_employee_id,services,tips,commission,created_at', (q) =>
    q.gte('date', FROM).lte('date', TO).order('date', { ascending: true }),
  ),
  tryFetch('branch_commission_policies', () => fetchAll('branch_commission_policies', '*', (q) => q)),
  tryFetch('branch_service_prices', () =>
    fetchAll('branch_service_prices', 'branch_id,service_id,duration_id,price,commission_percent,is_active', (q) => q.eq('is_active', true)),
  ),
  tryFetch('payroll_cycle_closes', () =>
    fetchAll(
      'payroll_cycle_closes',
      'id,month,cycle,branch_id,status,snapshot,commission,tips,net_salary,employee_id,created_at,updated_at',
      (q) => q.eq('month', '2026-07').eq('cycle', 'period2'),
    ),
  ),
])

console.log(`Invoices: ${invoices.length}`)
console.log(`Policies: ${policies.length}`)
console.log(`Active branch_service_prices: ${prices.length}`)
console.log(`payroll_cycle_closes Jul P2: ${closes.length}`)

// Policy map
const policyByBranch = Object.fromEntries(policies.map((p) => [p.branch_id, p]))
console.log('\n--- branch_commission_policies (DB) ---')
for (const [bid, p] of Object.entries(policyByBranch).sort()) {
  console.log(`  ${bid}: type=${p.policy_type} flat=${p.flat_rate} default=${p.default_rate} groups=${Array.isArray(p.groups) ? p.groups.length : 0}`)
}

// Price samples for chuyen-sau / body-75 / bac-lieu
console.log('\n--- branch_service_prices samples (chuyen-sau / body) ---')
const interesting = prices.filter((p) => {
  const sid = String(p.service_id || '')
  return /chuyen|body-60|body-75|body-90|combo|foot|co-vai/.test(sid)
})
const byKey = new Map()
for (const p of interesting) {
  const k = `${p.branch_id}|${p.service_id}|${p.commission_percent}`
  byKey.set(k, (byKey.get(k) || 0) + 1)
}
;[...byKey.entries()].sort().slice(0, 80).forEach(([k, c]) => console.log(`  ${k} ×${c}`))

// Line-level audit
const lineDiffs = []
const empAgg = new Map()
const branchAgg = new Map()
const serviceNameMap = new Map()
let invAffected = new Set()
let lineCount = 0
let mismatchLines = 0
let totalDelta = 0 // expected - actual (positive = đang thiếu trả NV)

function bumpEmp(empId, branchId, delta, actual, expected, tips) {
  if (!empId) return
  if (!empAgg.has(empId)) {
    empAgg.set(empId, {
      employeeId: empId,
      branches: new Set(),
      invoiceIds: new Set(),
      actualCommission: 0,
      expectedCommission: 0,
      delta: 0,
      tips: 0,
      mismatchLines: 0,
    })
  }
  const row = empAgg.get(empId)
  row.branches.add(branchId)
  row.actualCommission += actual
  row.expectedCommission += expected
  row.delta += delta
  row.tips += tips
  if (delta !== 0) row.mismatchLines += 1
}

for (const inv of invoices) {
  const branchId = inv.branch_id || ''
  const services = Array.isArray(inv.services) ? inv.services : []
  let invHasMismatch = false
  let invActual = 0
  let invExpected = 0

  for (const svc of services) {
    lineCount += 1
    const price = money(svc.price ?? svc.servicePrice ?? svc.originalPrice)
    const snapPct = Number.isFinite(Number(svc.commissionPercent)) ? Number(svc.commissionPercent) : null
    const snapAmt = Number.isFinite(Number(svc.commissionAmount)) ? money(svc.commissionAmount) : null
    const expPct = expectedPercent(branchId, svc)
    const expAmt = Math.round(price * expPct / 100)
    const actAmt = snapAmt != null ? snapAmt : Math.round(price * (snapPct ?? 0) / 100)
    const delta = expAmt - actAmt // + = hệ thống đang trả thiếu

    const nameKey = `${branchId}|${svc.id || svc.serviceId}|${svc.name || ''}`
    if (!serviceNameMap.has(nameKey)) {
      serviceNameMap.set(nameKey, {
        branchId,
        id: svc.id || svc.serviceId || '',
        name: svc.name || svc.serviceName || '',
        snapPct,
        expPct,
        count: 0,
        deltaSum: 0,
      })
    }
    const sn = serviceNameMap.get(nameKey)
    sn.count += 1
    sn.deltaSum += delta

    invActual += actAmt
    invExpected += expAmt

    if (delta !== 0) {
      mismatchLines += 1
      invHasMismatch = true
      lineDiffs.push({
        invoiceId: inv.id,
        date: inv.date,
        branchId,
        employeeId: inv.employee_id,
        supportId: inv.support_employee_id,
        serviceId: svc.id || svc.serviceId || '',
        serviceName: svc.name || '',
        price,
        snapPct,
        snapAmt,
        expPct,
        expAmt,
        actAmt,
        delta,
      })
    }
  }

  const tips = money(inv.tips)
  // tips 100% primary — không đổi kỳ vọng
  bumpEmp(inv.employee_id, branchId, invExpected - invActual, invActual, invExpected, tips)
  if (inv.support_employee_id && inv.support_employee_id !== inv.employee_id) {
    // support 50% of service commission — apply same relative delta * 0.5
    const d = Math.round((invExpected - invActual) * 0.5)
    bumpEmp(
      inv.support_employee_id,
      branchId,
      d,
      Math.round(invActual * 0.5),
      Math.round(invExpected * 0.5),
      0,
    )
  }

  if (invHasMismatch) invAffected.add(inv.id)

  if (!branchAgg.has(branchId)) {
    branchAgg.set(branchId, { branchId, invoices: 0, actual: 0, expected: 0, delta: 0, mismatchInvoices: 0 })
  }
  const ba = branchAgg.get(branchId)
  ba.invoices += 1
  ba.actual += invActual
  ba.expected += invExpected
  ba.delta += invExpected - invActual
  if (invHasMismatch) ba.mismatchInvoices += 1
}

totalDelta = [...empAgg.values()].reduce((s, e) => s + e.delta, 0)

const empRows = [...empAgg.values()]
  .map((e) => ({
    ...e,
    branches: [...e.branches].join(','),
    invoiceCount: e.invoiceIds?.size || 0,
  }))
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

// Fix invoice counts on emp
for (const inv of invoices) {
  if (empAgg.has(inv.employee_id)) empAgg.get(inv.employee_id).invoiceIds.add(inv.id)
  if (inv.support_employee_id && empAgg.has(inv.support_employee_id)) {
    empAgg.get(inv.support_employee_id).invoiceIds.add(inv.id)
  }
}
for (const e of empRows) {
  e.invoiceCount = empAgg.get(e.employeeId)?.invoiceIds.size || 0
}

const mismatchServices = [...serviceNameMap.values()]
  .filter((s) => s.deltaSum !== 0)
  .sort((a, b) => Math.abs(b.deltaSum) - Math.abs(a.deltaSum))

const report = {
  period: { from: FROM, to: TO, label: 'Kỳ 2 tháng 7/2026' },
  counts: {
    invoices: invoices.length,
    serviceLines: lineCount,
    mismatchLines,
    affectedInvoices: invAffected.size,
    affectedEmployees: empRows.filter((e) => e.delta !== 0).length,
    closesJulP2: closes.length,
  },
  policies: policyByBranch,
  branchAgg: [...branchAgg.values()].sort((a, b) => a.branchId.localeCompare(b.branchId)),
  totalDeltaPrimaryPlusSupport: totalDelta,
  topMismatchServices: mismatchServices.slice(0, 40),
  topEmployeesByAbsDelta: empRows.filter((e) => e.delta !== 0).slice(0, 50).map((e) => ({
    employeeId: e.employeeId,
    branches: e.branches,
    invoiceCount: e.invoiceCount,
    actualCommission: e.actualCommission,
    expectedCommission: e.expectedCommission,
    delta: e.delta,
    tips: e.tips,
    mismatchLines: e.mismatchLines,
  })),
  sampleLineDiffs: lineDiffs,
  closesStatus: closes.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {}),
  codeFindings: {
    body75InTieredZeroIds: false,
    body75InCatalogZero: true,
    bacLieuChuyenSau30Implemented: false,
    catalogPercentOverridesFlatPolicy: true,
    payrollUsesInvoiceSnapshot: true,
  },
}

const outDir = path.join(process.cwd(), 'docs/uat-evidence')
fs.mkdirSync(outDir, { recursive: true })
const jsonPath = path.join(outDir, 'COMMISSION_FORMULA_JUL_P2_AUDIT.json')
const csvPath = path.join(outDir, 'COMMISSION_FORMULA_JUL_P2_EMPLOYEES.csv')
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

const csv = [
  'employeeId,branches,invoiceCount,actualCommission,expectedCommission,delta,tips,mismatchLines',
  ...empRows.map((e) =>
    [e.employeeId, e.branches, e.invoiceCount, e.actualCommission, e.expectedCommission, e.delta, e.tips, e.mismatchLines].join(','),
  ),
].join('\n')
fs.writeFileSync(csvPath, csv)

console.log('\n=== SUMMARY ===')
console.log(JSON.stringify(report.counts, null, 2))
console.log('\nBranch deltas (expected - actual):')
for (const b of report.branchAgg) {
  console.log(`  ${b.branchId}: inv=${b.invoices} mismatchInv=${b.mismatchInvoices} actual=${b.actual} expected=${b.expected} delta=${b.delta}`)
}
console.log(`\nTotal delta (primary+support scaled): ${totalDelta}`)
console.log(`Closes Jul P2 by status:`, report.closesStatus)
console.log(`\nWrote ${jsonPath}`)
console.log(`Wrote ${csvPath}`)
console.log('\nTop mismatch services:')
for (const s of mismatchServices.slice(0, 20)) {
  console.log(`  [${s.branchId}] ${s.id} | ${s.name} snap%=${s.snapPct} exp%=${s.expPct} n=${s.count} Δ=${s.deltaSum}`)
}
console.log('\nTop employees by |delta|:')
for (const e of report.topEmployeesByAbsDelta.slice(0, 20)) {
  console.log(`  ${e.employeeId} (${e.branches}) act=${e.actualCommission} exp=${e.expectedCommission} Δ=${e.delta} inv=${e.invoiceCount}`)
}
