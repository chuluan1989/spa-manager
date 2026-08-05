/**
 * Backup + (optional) fix đúng 38 dòng HĐ Kỳ 2/7 trong audit.
 *
 * Default: DRY-RUN (không ghi DB).
 * Apply: APPLY=1 node --env-file=.env.local scripts/fix-commission-jul-p2-38-lines.mjs
 *
 * Chỉ cập nhật khi:
 * - invoiceId ∈ audit sampleLineDiffs (38 dòng)
 * - Không có payroll_cycle_closes approved cho NV trong kỳ
 * - APPLY=1
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const AUDIT_PATH = path.resolve('docs/uat-evidence/COMMISSION_FORMULA_JUL_P2_AUDIT.json')
const OUT_DIR = path.resolve('docs/uat-evidence')
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')
const APPLY = process.env.APPLY === '1'
const FROM = '2026-07-16'
const TO = '2026-07-31'
const BILLING_MONTH = '2026-07'
const CYCLE = 'period2'

async function resolveSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (process.env.AUDIT_FROM_PRODUCTION === '1' || !url || !(serviceKey || anon)) {
    const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
    const html = await fetch(BASE).then((r) => r.text())
    const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
    if (!jsMatch) throw new Error('Không tìm thấy bundle JS Production')
    const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
    const prodUrl = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
    const prodKey = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
      ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
    if (!prodUrl || !prodKey) throw new Error('Không lấy được Supabase từ Production')
    // Anon từ bundle — ghi có thể bị RLS chặn; ưu tiên service role từ env nếu cùng project
    if (serviceKey && url && url.includes(prodUrl.replace('https://', '').split('.')[0])) {
      return { url, key: serviceKey, source: 'env_service_role_matched_prod', canWrite: true }
    }
    return { url: prodUrl, key: prodKey, source: 'production_bundle_anon', canWrite: false }
  }

  if (serviceKey) return { url, key: serviceKey, source: 'env_service_role', canWrite: true }
  return { url, key: anon, source: 'env_anon', canWrite: false }
}

function money(n) {
  return Number(n || 0)
}

function lineKey(line) {
  return `${line.invoiceId}::${line.serviceId}::${line.snapPct}::${line.snapAmt}`
}

const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'))
const targets = audit.sampleLineDiffs
const expectedCount = audit.counts?.mismatchLines ?? 38
if (!Array.isArray(targets) || targets.length !== expectedCount) {
  throw new Error(`Audit sampleLineDiffs phải đúng ${expectedCount} dòng, hiện: ${targets?.length}. Chạy lại audit-commission-formula-jul-p2-readonly.mjs`)
}

const targetIds = [...new Set(targets.map((t) => t.invoiceId))]
const employeeIds = [...new Set(targets.flatMap((t) => [t.employeeId, t.supportId].filter(Boolean)))]

const { url, key, source, canWrite } = await resolveSupabase()
console.log(`Credential: ${source} | APPLY=${APPLY} | canWrite=${canWrite}`)
const sb = createClient(url, key, { auth: { persistSession: false } })

// --- Fetch invoices ---
const { data: invoices, error: invErr } = await sb
  .from('invoices')
  .select('id,date,branch_id,employee_id,support_employee_id,services,tips,commission,updated_at,created_at')
  .in('id', targetIds)
if (invErr) throw invErr
if ((invoices?.length ?? 0) !== targetIds.length) {
  console.warn(`Cảnh báo: fetch ${invoices?.length}/${targetIds.length} HĐ`)
}

const invMap = new Map((invoices || []).map((r) => [r.id, r]))

// --- Closes for affected employees Kỳ 2/7 ---
const { data: closes, error: closeErr } = await sb
  .from('payroll_cycle_closes')
  .select('id,employee_id,branch_id,billing_month,cycle,status,from_date,to_date,submitted_at,approved_at,snapshot')
  .eq('billing_month', BILLING_MONTH)
  .eq('cycle', CYCLE)
  .in('employee_id', employeeIds)
if (closeErr) {
  console.warn('closes query error:', closeErr.message)
}

const closesByEmp = new Map()
for (const c of closes || []) {
  const list = closesByEmp.get(c.employee_id) || []
  list.push(c)
  closesByEmp.set(c.employee_id, list)
}

const APPROVED = new Set(['approved', 'locked', 'paid', 'final'])
const mutableStatuses = new Set(['draft', 'returned', 'open', ''])
// submitted/resubmitted: cho phép sửa nguồn theo user ("kỳ chưa duyệt") nhưng cần log — coi submitted là chưa duyệt

function empCloseGate(employeeId) {
  const rows = closesByEmp.get(employeeId) || []
  const approved = rows.filter((r) => APPROVED.has(String(r.status || '').toLowerCase()))
  const submitted = rows.filter((r) => ['submitted', 'resubmitted'].includes(String(r.status || '').toLowerCase()))
  return {
    rows,
    hasApproved: approved.length > 0,
    hasSubmitted: submitted.length > 0,
    statuses: rows.map((r) => `${r.id}:${r.status}`),
  }
}

// --- Control sample: HĐ cùng kỳ không thuộc 38 ---
const { data: controlSample, error: ctrlErr } = await sb
  .from('invoices')
  .select('id,branch_id,services,commission')
  .gte('date', FROM)
  .lte('date', TO)
  .not('id', 'in', `(${targetIds.map((id) => `"${id}"`).join(',')})`)
  .limit(20)
if (ctrlErr) console.warn('control sample:', ctrlErr.message)

const beforeExport = []
const plannedUpdates = []
const blocked = []
let deltaSocTrang = 0
let deltaBacLieu = 0

for (const target of targets) {
  const inv = invMap.get(target.invoiceId)
  if (!inv) {
    blocked.push({ ...target, reason: 'invoice_not_found' })
    continue
  }

  const gate = empCloseGate(target.employeeId)
  if (gate.hasApproved) {
    blocked.push({
      ...target,
      reason: 'employee_close_approved',
      closes: gate.statuses,
    })
    continue
  }

  const services = Array.isArray(inv.services) ? structuredClone(inv.services) : []
  // Match đúng dòng: cùng serviceId + snapPct + snapAmt (tránh sửa nhầm dòng khác cùng HĐ)
  const idx = services.findIndex((s) => {
    const sid = s.id || s.serviceId
    const pct = Number(s.commissionPercent)
    const amt = Number(s.commissionAmount)
    return sid === target.serviceId
      && pct === target.snapPct
      && amt === target.snapAmt
  })

  if (idx < 0) {
    // fallback: cùng id + pct nếu amount đã lệch nhẹ
    const idx2 = services.findIndex((s) => (s.id || s.serviceId) === target.serviceId && Number(s.commissionPercent) === target.snapPct)
    if (idx2 < 0) {
      blocked.push({ ...target, reason: 'line_not_matched', servicesPreview: services.map((s) => ({
        id: s.id || s.serviceId, pct: s.commissionPercent, amt: s.commissionAmount, price: s.price,
      })) })
      continue
    }
    // use idx2 only if unique match for that id+pct
    const matches = services.filter((s) => (s.id || s.serviceId) === target.serviceId && Number(s.commissionPercent) === target.snapPct)
    if (matches.length !== 1) {
      blocked.push({ ...target, reason: 'ambiguous_line_match', matchCount: matches.length })
      continue
    }
    services[idx2] = {
      ...services[idx2],
      commissionPercent: target.expPct,
      commissionAmount: target.expAmt,
    }
    const newCommission = services.reduce((sum, s) => sum + money(s.commissionAmount), 0)
    const oldCommission = money(inv.commission)
    const lineDelta = target.expAmt - target.snapAmt
    if (target.branchId === 'soc-trang') deltaSocTrang += lineDelta
    if (target.branchId === 'bac-lieu') deltaBacLieu += lineDelta

    beforeExport.push({
      invoiceId: inv.id,
      date: inv.date,
      branchId: inv.branch_id,
      employeeId: inv.employee_id,
      supportId: inv.support_employee_id,
      lineIndex: idx2,
      serviceId: target.serviceId,
      before: { pct: target.snapPct, amt: target.snapAmt, invoiceCommission: oldCommission, services: inv.services },
      after: { pct: target.expPct, amt: target.expAmt, invoiceCommission: newCommission },
      closeGate: gate,
      lineDelta,
    })
    plannedUpdates.push({
      id: inv.id,
      services,
      commission: newCommission,
      lineDelta,
      target,
      closeGate: gate,
    })
    continue
  }

  const oldCommission = services.reduce((sum, s) => sum + money(s.commissionAmount), 0)
  services[idx] = {
    ...services[idx],
    commissionPercent: target.expPct,
    commissionAmount: target.expAmt,
  }
  const newCommission = services.reduce((sum, s) => sum + money(s.commissionAmount), 0)
  const lineDelta = target.expAmt - target.snapAmt
  if (target.branchId === 'soc-trang') deltaSocTrang += lineDelta
  if (target.branchId === 'bac-lieu') deltaBacLieu += lineDelta

  beforeExport.push({
    invoiceId: inv.id,
    date: inv.date,
    branchId: inv.branch_id,
    employeeId: inv.employee_id,
    supportId: inv.support_employee_id,
    lineIndex: idx,
    serviceId: target.serviceId,
    before: {
      pct: target.snapPct,
      amt: target.snapAmt,
      invoiceCommissionField: money(inv.commission),
      invoiceCommissionFromLines: oldCommission,
      line: inv.services[idx],
      services: inv.services,
    },
    after: { pct: target.expPct, amt: target.expAmt, invoiceCommission: newCommission },
    closeGate: gate,
    lineDelta,
  })

  plannedUpdates.push({
    id: inv.id,
    services,
    commission: newCommission,
    lineDelta,
    target,
    closeGate: gate,
  })
}

const backupPath = path.join(OUT_DIR, `COMMISSION_JUL_P2_38_BACKUP_${STAMP}.json`)
const beforePath = path.join(OUT_DIR, `COMMISSION_JUL_P2_38_BEFORE_${STAMP}.json`)
const planPath = path.join(OUT_DIR, `COMMISSION_JUL_P2_38_PLAN_${STAMP}.json`)

const backupPayload = {
  stamp: STAMP,
  credentialSource: source,
  apply: APPLY,
  targetsCount: targets.length,
  invoices: invoices,
  closes: closes || [],
  controlSample: controlSample || [],
}

fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2))
fs.writeFileSync(beforePath, JSON.stringify(beforeExport, null, 2))

const plan = {
  stamp: STAMP,
  apply: APPLY,
  canWrite,
  plannedCount: plannedUpdates.length,
  blockedCount: blocked.length,
  blocked,
  expectedDeltas: {
    socTrangLineSum: deltaSocTrang,
    bacLieuLineSum: deltaBacLieu,
    netLineSum: deltaSocTrang + deltaBacLieu,
    note: 'Line-level primary deltas (không × support). Kỳ audit net emp = -1.579.000 gồm support×0.5 nếu có.',
  },
  employeeCloseStatus: Object.fromEntries(
    employeeIds.map((id) => [id, empCloseGate(id)]),
  ),
  plannedInvoiceIds: plannedUpdates.map((u) => u.id),
}

fs.writeFileSync(planPath, JSON.stringify(plan, null, 2))

console.log(`Backup: ${backupPath}`)
console.log(`Before: ${beforePath}`)
console.log(`Plan:   ${planPath}`)
console.log(`Planned updates: ${plannedUpdates.length} | Blocked: ${blocked.length}`)
console.log(`Δ lines Sóc Trăng: ${deltaSocTrang} | Bạc Liêu: ${deltaBacLieu} | net: ${deltaSocTrang + deltaBacLieu}`)
console.log('Close status by employee:')
for (const id of employeeIds) {
  const g = empCloseGate(id)
  console.log(`  ${id}: approved=${g.hasApproved} submitted=${g.hasSubmitted} rows=${g.statuses.join('|') || 'none'}`)
}

if (blocked.length) {
  console.log('BLOCKED (sẽ không ghi):')
  for (const b of blocked) console.log(`  ${b.invoiceId} ${b.serviceId}: ${b.reason}`)
}

if (!APPLY) {
  console.log('\nDRY-RUN only. Để ghi DB: APPLY=1 SUPABASE_SERVICE_ROLE_KEY=... (hoặc ALLOW_ANON_WRITE=1 nếu RLS cho phép).')
  process.exit(blocked.some((b) => b.reason === 'employee_close_approved') ? 2 : 0)
}

if (!canWrite && process.env.ALLOW_ANON_WRITE !== '1') {
  console.error('Không có quyền ghi (thiếu SUPABASE_SERVICE_ROLE_KEY khớp Production).')
  console.error('Nếu chắc RLS anon cho phép update invoices: ALLOW_ANON_WRITE=1 APPLY=1 ...')
  process.exit(1)
}

if (!canWrite && process.env.ALLOW_ANON_WRITE === '1') {
  console.warn('ALLOW_ANON_WRITE=1 — thử ghi bằng anon key (có thể bị RLS chặn).')
}

if (blocked.some((b) => b.reason === 'employee_close_approved')) {
  console.error('Có NV đã approved — không ghi đè. Xem plan blocked.')
  process.exit(1)
}

// Deduplicate by invoice id (một HĐ có thể nhiều dòng target — services đã merge trong loop sai)
// Fix: rebuild per-invoice from all targets for that invoice
const byInvoice = new Map()
for (const target of targets) {
  const gate = empCloseGate(target.employeeId)
  if (gate.hasApproved) continue
  const inv = invMap.get(target.invoiceId)
  if (!inv) continue
  if (!byInvoice.has(inv.id)) {
    byInvoice.set(inv.id, {
      inv,
      services: structuredClone(inv.services),
      targets: [],
    })
  }
  byInvoice.get(inv.id).targets.push(target)
}

const afterLog = []
let updated = 0
for (const [id, pack] of byInvoice) {
  let services = pack.services
  const changes = []
  for (const target of pack.targets) {
    const idx = services.findIndex((s) => {
      const sid = s.id || s.serviceId
      return sid === target.serviceId
        && Number(s.commissionPercent) === target.snapPct
        && Number(s.commissionAmount) === target.snapAmt
    })
    let useIdx = idx
    if (useIdx < 0) {
      const candidates = services
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => (s.id || s.serviceId) === target.serviceId && Number(s.commissionPercent) === target.snapPct)
      if (candidates.length !== 1) {
        afterLog.push({ id, target, status: 'skip_ambiguous' })
        continue
      }
      useIdx = candidates[0].i
    }
    const beforeLine = { ...services[useIdx] }
    services[useIdx] = {
      ...services[useIdx],
      commissionPercent: target.expPct,
      commissionAmount: target.expAmt,
    }
    changes.push({ index: useIdx, before: beforeLine, after: services[useIdx], target })
  }
  const commission = services.reduce((sum, s) => sum + money(s.commissionAmount), 0)
  const { error } = await sb.from('invoices').update({ services, commission }).eq('id', id)
  if (error) {
    afterLog.push({ id, status: 'error', error: error.message })
    console.error(`FAIL ${id}:`, error.message)
  } else {
    updated += 1
    afterLog.push({ id, status: 'updated', commission, changes })
    console.log(`OK ${id} commission→${commission} changes=${changes.length}`)
  }
}

const afterPath = path.join(OUT_DIR, `COMMISSION_JUL_P2_38_AFTER_${STAMP}.json`)
fs.writeFileSync(afterPath, JSON.stringify({ stamp: STAMP, updated, afterLog }, null, 2))
console.log(`After log: ${afterPath}`)
console.log(`Updated invoices: ${updated}`)
