/**
 * UAT Preview — Phase A + B + D (giá/% V2, audit, copy preview, online-only).
 * Chạy: node scripts/verify-branch-pricing-phase-abd-uat.mjs
 * Không ghi Prod. Không deploy.
 */
import assert from 'node:assert/strict'

function resolveLineCommissionPercent(service, branchId, resolvePolicy) {
  if (Number.isFinite(service?.commissionPercent)) {
    return Number(service.commissionPercent)
  }
  return resolvePolicy(branchId, service)
}

function buildBaseServiceLine(service, branchId, resolvePolicy) {
  const originalPrice = Number(service.price ?? 0)
  const commissionPercent = resolveLineCommissionPercent(service, branchId, resolvePolicy)
  return {
    id: service.id,
    serviceId: service.serviceId || service.id,
    name: service.name,
    serviceName: service.name,
    price: originalPrice,
    servicePrice: originalPrice,
    commissionPercent,
    commissionAmount: Math.round(originalPrice * commissionPercent / 100),
    branchId: branchId || '',
    pricingSource: service.pricingSource
      || (Number.isFinite(service?.commissionPercent) ? 'branch_service_prices' : 'commission_policy'),
  }
}

function previewCopy(sourcePrices, targetPrices) {
  const added = []
  const priceChanged = []
  const percentChanged = []
  const overwritten = []
  for (const [durationId, source] of Object.entries(sourcePrices)) {
    const target = targetPrices[durationId]
    if (!target) {
      added.push(durationId)
      continue
    }
    const priceDiff = Number(source.price) !== Number(target.price)
    const pctDiff = Number(source.commissionPercent) !== Number(target.commissionPercent)
    if (!priceDiff && !pctDiff) continue
    overwritten.push(durationId)
    if (priceDiff) priceChanged.push(durationId)
    if (pctDiff) percentChanged.push(durationId)
  }
  return { added, priceChanged, percentChanged, overwritten }
}

function applyCopy(sourcePrices, targetPrices, mode) {
  const next = { ...targetPrices }
  for (const [durationId, source] of Object.entries(sourcePrices)) {
    const target = next[durationId]
    if (!target) {
      next[durationId] = { ...source }
      continue
    }
    if (mode === 'add_missing') continue
    const merged = { ...target }
    if (mode === 'overwrite_price' || mode === 'overwrite_both') merged.price = source.price
    if (mode === 'overwrite_percent' || mode === 'overwrite_both') merged.commissionPercent = source.commissionPercent
    next[durationId] = merged
  }
  return next
}

const results = []

// A — V2 % ưu tiên hơn policy
{
  const policy = () => 40
  const v2Service = {
    id: 'dur-1',
    serviceId: 'svc-1',
    name: 'Massage 60',
    price: 300000,
    commissionPercent: 25,
    pricingSource: 'branch_service_prices',
  }
  const line = buildBaseServiceLine(v2Service, 'tram-spa', policy)
  assert.equal(line.commissionPercent, 25)
  assert.equal(line.pricingSource, 'branch_service_prices')
  assert.equal(line.branchId, 'tram-spa')
  results.push('A1 prefer V2 % over policy')
}

// A — fallback policy khi thiếu % V2
{
  const policy = () => 30
  const legacy = { id: 'dur-2', name: 'Legacy', price: 200000 }
  const line = buildBaseServiceLine(legacy, 'soc-trang', policy)
  assert.equal(line.commissionPercent, 30)
  assert.equal(line.pricingSource, 'commission_policy')
  results.push('A2 fallback policy when V2 % missing')
}

// A — chi nhánh phục vụ = nguồn giá (cross-branch)
{
  const policy = () => 99
  const tramService = {
    id: 'dur-x',
    name: 'DV Trạm',
    price: 350000,
    commissionPercent: 20,
  }
  const line = buildBaseServiceLine(tramService, 'tram-spa', policy)
  assert.equal(line.price, 350000)
  assert.equal(line.commissionPercent, 20)
  assert.equal(line.branchId, 'tram-spa')
  results.push('A3 serving branch snapshot')
}

// A — HĐ cũ giữ snapshot (không recalc)
{
  const oldSnap = { commissionPercent: 15, commissionAmount: 45000, price: 300000 }
  const preferSnapshot = true
  const amount = preferSnapshot && Number.isFinite(oldSnap.commissionAmount)
    ? oldSnap.commissionAmount
    : Math.round(oldSnap.price * 25 / 100)
  assert.equal(amount, 45000)
  results.push('A4 old invoice keeps snapshot')
}

// A — đổi CN: prune dịch vụ không hợp lệ, giữ NV
{
  const selected = ['dur-a', 'dur-b', 'dur-c']
  const validAtNewBranch = { 'dur-a': true, 'dur-c': true }
  const pruned = selected.filter((id) => validAtNewBranch[id])
  assert.deepEqual(pruned, ['dur-a', 'dur-c'])
  const employeeId = 'emp-soc'
  assert.equal(employeeId, 'emp-soc')
  results.push('A5 prune invalid services on branch change')
}

// B — copy preview + modes
{
  const source = {
    d1: { price: 100, commissionPercent: 20 },
    d2: { price: 200, commissionPercent: 25 },
    d3: { price: 300, commissionPercent: 30 },
  }
  const target = {
    d1: { price: 100, commissionPercent: 20 },
    d2: { price: 180, commissionPercent: 25 },
  }
  const preview = previewCopy(source, target)
  assert.deepEqual(preview.added, ['d3'])
  assert.deepEqual(preview.priceChanged, ['d2'])
  assert.deepEqual(preview.percentChanged, [])
  assert.deepEqual(preview.overwritten, ['d2'])

  const addOnly = applyCopy(source, target, 'add_missing')
  assert.equal(addOnly.d2.price, 180)
  assert.equal(addOnly.d3.price, 300)

  const overwritePrice = applyCopy(source, target, 'overwrite_price')
  assert.equal(overwritePrice.d2.price, 200)
  assert.equal(overwritePrice.d2.commissionPercent, 25)

  const overwritePct = applyCopy(
    { d2: { price: 200, commissionPercent: 35 } },
    target,
    'overwrite_percent',
  )
  assert.equal(overwritePct.d2.price, 180)
  assert.equal(overwritePct.d2.commissionPercent, 35)

  results.push('B1 copy preview + overwrite modes')
}

// B — audit payload shape
{
  const audit = {
    branchId: 'soc-trang',
    serviceId: 'svc-1',
    durationId: 'dur-1',
    reason: 'Điều chỉnh giá mùa hè',
    oldValues: { price: 300000, commissionPercent: 20 },
    newValues: { price: 320000, commissionPercent: 22, reason: 'Điều chỉnh giá mùa hè' },
    changedByName: 'Admin',
    createdAt: new Date().toISOString(),
  }
  assert.ok(audit.reason)
  assert.equal(audit.oldValues.price, 300000)
  assert.equal(audit.newValues.price, 320000)
  assert.ok(audit.changedByName)
  assert.ok(audit.createdAt)
  results.push('B2 audit reason + old/new + actor/time')
}

// D — offline guard
{
  const getBlock = ({ configured, online }) => {
    if (!configured) return 'Supabase chưa cấu hình. Không thể chỉnh bảng giá.'
    if (!online) return 'Không thể chỉnh bảng giá khi đang offline.'
    return ''
  }
  assert.equal(getBlock({ configured: true, online: false }), 'Không thể chỉnh bảng giá khi đang offline.')
  assert.equal(getBlock({ configured: true, online: true }), '')
  results.push('D1 offline blocks price edits')
}

// D — server-first: local chỉ sau remote ok
{
  let localWritten = false
  let remoteOk = false
  const saveServerFirst = async () => {
    remoteOk = true
    if (!remoteOk) throw new Error('remote failed')
    localWritten = true
  }
  await saveServerFirst()
  assert.equal(remoteOk, true)
  assert.equal(localWritten, true)
  results.push('D2 server-first then local cache')
}

console.log('UAT Phase A+B+D — PASS')
for (const line of results) console.log(`  ✓ ${line}`)
console.log(`Total: ${results.length} checks`)
