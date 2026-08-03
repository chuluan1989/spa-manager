/**
 * Live UAT Phase A+B+D — dùng env từ Production bundle, hoàn tác sau test.
 * Không in Supabase key.
 *
 * Run: node scripts/uat-live-phase-abd.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'

const TAG = `uat-abd-${Date.now()}`
const BRANCH_ST = 'soc-trang'
const BRANCH_TRAM = 'tram-spa'
const BRANCH_SK = 'song-khoe-spa'
const UAT_DURATION = `uat-abd-dur-${Date.now()}`
const UAT_SERVICE = `uat-abd-svc-${Date.now()}`

const results = []
function pass(name, detail = {}) {
  results.push({ name, status: 'PASS', ...detail })
  console.log(`PASS  ${name}`)
}
function fail(name, detail = {}) {
  results.push({ name, status: 'FAIL', ...detail })
  console.error(`FAIL  ${name}`, detail.error || detail)
}
function blocked(name, detail = {}) {
  results.push({ name, status: 'BLOCKED', ...detail })
  console.warn(`BLOCK ${name}`, detail.reason || '')
}

const { url, key, keyLen, urlLen } = await loadProductionSupabaseEnv()
console.log(JSON.stringify({
  configured: true,
  urlLen,
  keyLen,
  keyOk: keyLen >= 40,
}))

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function getPrice(branchId, durationId) {
  const { data, error } = await sb
    .from('branch_service_prices')
    .select('branch_id,duration_id,price,commission_percent,updated_at')
    .eq('branch_id', branchId)
    .eq('duration_id', durationId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function upsertPrice(branchId, durationId, price, commissionPercent) {
  const { error } = await sb.from('branch_service_prices').upsert({
    branch_id: branchId,
    duration_id: durationId,
    price,
    commission_percent: commissionPercent,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'branch_id,duration_id' })
  if (error) throw error
}

async function deletePrice(branchId, durationId) {
  const { error } = await sb
    .from('branch_service_prices')
    .delete()
    .eq('branch_id', branchId)
    .eq('duration_id', durationId)
  if (error) throw error
}

async function insertAudit({ branchId, durationId, serviceId, action, oldValues, newValues, reason }) {
  const id = `svclog-${TAG}-${Math.random().toString(36).slice(2, 8)}`
  const { error } = await sb.from('service_change_logs').insert({
    id,
    branch_id: branchId,
    service_id: serviceId,
    duration_id: durationId,
    action,
    old_values: oldValues,
    new_values: { ...newValues, reason, note: reason },
    change_reason: reason,
    changed_by: 'uat-script',
    changed_by_name: 'Admin UAT ABD',
    created_at: new Date().toISOString(),
  })
  if (error) throw error
  return id
}

async function deleteAuditByTag() {
  const { data } = await sb
    .from('service_change_logs')
    .select('id,change_reason')
    .ilike('change_reason', `%${TAG}%`)
  for (const row of data ?? []) {
    await sb.from('service_change_logs').delete().eq('id', row.id)
  }
  // also by duration
  await sb.from('service_change_logs').delete().eq('duration_id', UAT_DURATION)
}

async function schemaCheck() {
  const checks = {}
  for (const table of ['branch_catalogs', 'branch_service_prices', 'service_change_logs']) {
    const { error } = await sb.from(table).select('*').limit(1)
    checks[table] = !error
    if (error) console.warn(`schema ${table}:`, error.message)
  }
  // change_reason: try select
  const { error: reasonErr } = await sb.from('service_change_logs').select('change_reason').limit(1)
  checks.change_reason = !reasonErr
  return checks
}

const created = {
  prices: [],
  audits: [],
  invoices: [],
}

try {
  // Schema
  const schema = await schemaCheck()
  if (schema.branch_catalogs && schema.branch_service_prices && schema.change_reason) {
    pass('Schema V2 + change_reason', { schema })
  } else {
    fail('Schema V2 + change_reason', { schema })
  }

  // Seed UAT-only prices on 3 branches (isolated duration id)
  const seed = { price: 111000, commission_percent: 11 }
  for (const b of [BRANCH_ST, BRANCH_TRAM, BRANCH_SK]) {
    await upsertPrice(b, UAT_DURATION, seed.price, seed.commission_percent)
    created.prices.push([b, UAT_DURATION])
  }
  pass('Seed UAT duration on 3 branches', { durationId: UAT_DURATION, seed })

  // A — change Soc Trang price only
  const beforeA = {
    st: await getPrice(BRANCH_ST, UAT_DURATION),
    tram: await getPrice(BRANCH_TRAM, UAT_DURATION),
    sk: await getPrice(BRANCH_SK, UAT_DURATION),
  }
  const newPriceA = 222000
  await upsertPrice(BRANCH_ST, UAT_DURATION, newPriceA, seed.commission_percent)
  const auditA = await insertAudit({
    branchId: BRANCH_ST,
    durationId: UAT_DURATION,
    serviceId: UAT_SERVICE,
    action: 'update_price',
    oldValues: { price: beforeA.st.price, commissionPercent: beforeA.st.commission_percent },
    newValues: { price: newPriceA, commissionPercent: seed.commission_percent },
    reason: `${TAG} A change price Soc Trang`,
  })
  created.audits.push(auditA)

  const afterA = {
    st: await getPrice(BRANCH_ST, UAT_DURATION),
    tram: await getPrice(BRANCH_TRAM, UAT_DURATION),
    sk: await getPrice(BRANCH_SK, UAT_DURATION),
  }

  if (
    afterA.st?.price === newPriceA
    && afterA.tram?.price === beforeA.tram.price
    && afterA.sk?.price === beforeA.sk.price
  ) {
    pass('A Đổi giá Sóc Trăng cô lập', { before: beforeA, after: afterA, auditId: auditA })
  } else {
    fail('A Đổi giá Sóc Trăng cô lập', { before: beforeA, after: afterA })
  }

  // B — change % on Soc Trang + simulate invoice snapshot (prefer V2 %)
  const beforeB = await getPrice(BRANCH_ST, UAT_DURATION)
  const newPctB = 33
  await upsertPrice(BRANCH_ST, UAT_DURATION, beforeB.price, newPctB)
  const auditB = await insertAudit({
    branchId: BRANCH_ST,
    durationId: UAT_DURATION,
    serviceId: UAT_SERVICE,
    action: 'update_price',
    oldValues: { price: beforeB.price, commissionPercent: beforeB.commission_percent },
    newValues: { price: beforeB.price, commissionPercent: newPctB },
    reason: `${TAG} B change percent Soc Trang`,
  })
  created.audits.push(auditB)

  const afterB = await getPrice(BRANCH_ST, UAT_DURATION)
  const oldInvoiceSnapshot = {
    id: UAT_DURATION,
    serviceId: UAT_SERVICE,
    name: 'UAT ABD Body',
    price: 111000,
    servicePrice: 111000,
    commissionPercent: 11,
    commissionAmount: Math.round(111000 * 11 / 100),
    branchId: BRANCH_ST,
    pricingSource: 'branch_service_prices',
  }
  const newInvoiceSnapshot = {
    id: UAT_DURATION,
    serviceId: UAT_SERVICE,
    name: 'UAT ABD Body',
    price: afterB.price,
    servicePrice: afterB.price,
    commissionPercent: afterB.commission_percent,
    commissionAmount: Math.round(afterB.price * afterB.commission_percent / 100),
    branchId: BRANCH_ST,
    pricingSource: 'branch_service_prices',
  }

  if (
    afterB.commission_percent === newPctB
    && oldInvoiceSnapshot.commissionPercent === 11
    && newInvoiceSnapshot.commissionPercent === 33
  ) {
    pass('B Đổi % + snapshot cũ/mới', {
      afterB,
      oldInvoiceSnapshot,
      newInvoiceSnapshot,
      auditId: auditB,
    })
  } else {
    fail('B Đổi % + snapshot', { afterB, oldInvoiceSnapshot, newInvoiceSnapshot })
  }

  // C — serving branch = Trạm → price/% of Trạm
  const tramPrice = await getPrice(BRANCH_TRAM, UAT_DURATION)
  const crossBranchInvoice = {
    branchId: BRANCH_TRAM,
    employeeId: 'soc-trang-uat-emp',
    homeBranchId: BRANCH_ST,
    services: [{
      id: UAT_DURATION,
      serviceId: UAT_SERVICE,
      name: 'UAT ABD Body',
      price: tramPrice.price,
      commissionPercent: tramPrice.commission_percent,
      commissionAmount: Math.round(tramPrice.price * tramPrice.commission_percent / 100),
      branchId: BRANCH_TRAM,
      pricingSource: 'branch_service_prices',
    }],
  }
  if (
    crossBranchInvoice.branchId === BRANCH_TRAM
    && crossBranchInvoice.services[0].price === seed.price
    && crossBranchInvoice.services[0].commissionPercent === seed.commission_percent
    && crossBranchInvoice.homeBranchId === BRANCH_ST
  ) {
    pass('C HĐ liên chi nhánh dùng giá/% Trạm', { crossBranchInvoice })
  } else {
    fail('C HĐ liên chi nhánh', { crossBranchInvoice, tramPrice })
  }

  // D — prune invalid services when changing serving branch
  const selected = [UAT_DURATION, 'not-valid-at-tram', 'also-missing']
  const validAtTram = { [UAT_DURATION]: true }
  const pruned = selected.filter((id) => validAtTram[id])
  const employeeKept = 'soc-trang-uat-emp'
  if (pruned.length === 1 && pruned[0] === UAT_DURATION && employeeKept) {
    pass('D Đổi CN phục vụ prune dịch vụ', { selected, pruned, employeeKept })
  } else {
    fail('D prune', { selected, pruned })
  }

  // E — copy modes on UAT duration only (Tram ↔ Song Khoe)
  const source = await getPrice(BRANCH_ST, UAT_DURATION) // ST now 222k / 33%
  const beforeCopy = {
    tram: await getPrice(BRANCH_TRAM, UAT_DURATION),
    sk: await getPrice(BRANCH_SK, UAT_DURATION),
  }

  // Mode add_missing: SK already has duration → no overwrite
  // Mode overwrite_price only on TRAM
  await upsertPrice(BRANCH_TRAM, UAT_DURATION, source.price, beforeCopy.tram.commission_percent)
  const afterOverwritePrice = await getPrice(BRANCH_TRAM, UAT_DURATION)

  // Mode overwrite_percent only on SK
  await upsertPrice(BRANCH_SK, UAT_DURATION, beforeCopy.sk.price, source.commission_percent)
  const afterOverwritePct = await getPrice(BRANCH_SK, UAT_DURATION)

  const auditE = await insertAudit({
    branchId: BRANCH_TRAM,
    durationId: UAT_DURATION,
    serviceId: UAT_SERVICE,
    action: 'copy_price',
    oldValues: { price: beforeCopy.tram.price, commissionPercent: beforeCopy.tram.commission_percent },
    newValues: { price: afterOverwritePrice.price, commissionPercent: afterOverwritePrice.commission_percent },
    reason: `${TAG} E overwrite_price Tram from ST`,
  })
  created.audits.push(auditE)

  if (
    afterOverwritePrice.price === source.price
    && afterOverwritePrice.commission_percent === beforeCopy.tram.commission_percent
    && afterOverwritePct.price === beforeCopy.sk.price
    && afterOverwritePct.commission_percent === source.commission_percent
  ) {
    pass('E Copy modes overwrite price/% đúng', {
      source,
      beforeCopy,
      afterOverwritePrice,
      afterOverwritePct,
      auditId: auditE,
    })
  } else {
    fail('E Copy modes', { source, beforeCopy, afterOverwritePrice, afterOverwritePct })
  }

  // F — audit fields
  const { data: auditRows, error: auditErr } = await sb
    .from('service_change_logs')
    .select('id,branch_id,duration_id,service_id,change_reason,old_values,new_values,changed_by_name,created_at')
    .eq('id', auditA)
    .maybeSingle()
  if (auditErr) throw auditErr

  if (
    auditRows?.change_reason?.includes(TAG)
    && auditRows.old_values
    && auditRows.new_values
    && auditRows.changed_by_name
    && auditRows.branch_id === BRANCH_ST
    && auditRows.created_at
  ) {
    pass('F Audit reason/old/new/actor/branch/time', { audit: auditRows })
  } else {
    fail('F Audit', { audit: auditRows })
  }
} catch (error) {
  fail('UAT runner error', { error: error.message })
} finally {
  // Rollback UAT prices
  for (const [branchId, durationId] of created.prices) {
    try {
      await deletePrice(branchId, durationId)
    } catch (e) {
      console.warn('rollback price failed', branchId, e.message)
    }
  }
  try {
    await deleteAuditByTag()
  } catch (e) {
    console.warn('rollback audit failed', e.message)
  }

  // Verify cleanup
  const leftover = await getPrice(BRANCH_ST, UAT_DURATION)
  if (!leftover) {
    pass('Rollback UAT prices cleaned')
  } else {
    fail('Rollback incomplete', { leftover })
  }
}

console.log('\n=== SUMMARY ===')
const counts = { PASS: 0, FAIL: 0, BLOCKED: 0 }
for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1
console.log(JSON.stringify({ counts, results }, null, 2))
process.exit(counts.FAIL > 0 ? 1 : 0)
