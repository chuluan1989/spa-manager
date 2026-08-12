/**
 * Preview / dry-run — cập nhật catalog + giá Sống Khoẻ (chỉ branch song-khoe-spa).
 * MẶC ĐỊNH DRY-RUN. Không commit/deploy. Chặn production URL.
 *
 *   node --env-file=.env.preview.local scripts/apply-song-khoe-prices-aug2026.mjs
 *
 *   APPLY=1 CONFIRM=SONG_KHOE_PRICE_AUG2026 \
 *     node --env-file=.env.preview.local scripts/apply-song-khoe-prices-aug2026.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_PRICE_GROUPS } from '../src/constants/defaultPriceGroups.js'
import { PRICE_GROUP_IDS } from '../src/constants/priceGroupIds.js'

const BRANCH_ID = 'song-khoe-spa'
const APPLY = process.env.APPLY === '1'
const CONFIRM = process.env.CONFIRM || ''
const REQUIRED_CONFIRM = 'SONG_KHOE_PRICE_AUG2026'
const TARGET = DEFAULT_PRICE_GROUPS[PRICE_GROUP_IDS.SONG_KHOE_SPA]
const ACTIVE = 'active'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Thiếu Supabase URL/key trong env')
  process.exit(1)
}

if (/khoespa\.net\.vn/i.test(url) || process.env.AUDIT_FROM_PRODUCTION === '1') {
  console.error('CHẶN: từ chối ghi qua production flag/host. Dùng preview env.')
  process.exit(1)
}

// Extra safety: known production project ref used by khoespa (shared with broken local keys).
// Allow only when ALLOW_SHARED_SUPABASE=1 explicitly for preview sandbox on same project.
if (!process.env.ALLOW_SHARED_SUPABASE && APPLY) {
  console.error('APPLY trên shared Supabase cần ALLOW_SHARED_SUPABASE=1 + CONFIRM. Mặc định chặn.')
  process.exit(1)
}

if (APPLY && CONFIRM !== REQUIRED_CONFIRM) {
  console.error(`APPLY=1 cần CONFIRM=${REQUIRED_CONFIRM}`)
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | branch=${BRANCH_ID}`)
console.log(`Supabase host: ${new URL(url).host}`)

const { data: branch, error: brErr } = await sb
  .from('branches')
  .select('id,name,price_group_id')
  .eq('id', BRANCH_ID)
  .maybeSingle()
if (brErr) {
  console.error('branches:', brErr.message)
  process.exit(1)
}
if (!branch) {
  console.error('Không tìm thấy branch song-khoe-spa')
  process.exit(1)
}
console.log('Branch OK:', branch.name, branch.price_group_id)

const { data: priceRows, error: priceErr } = await sb
  .from('branch_service_prices')
  .select('branch_id,duration_id,price,commission_percent')
  .eq('branch_id', BRANCH_ID)
if (priceErr) {
  console.error('branch_service_prices:', priceErr.message)
  process.exit(1)
}
const byDur = Object.fromEntries((priceRows || []).map((r) => [r.duration_id, r]))

const { data: catRow, error: catErr } = await sb
  .from('branch_catalogs')
  .select('branch_id,catalog,updated_at')
  .eq('branch_id', BRANCH_ID)
  .maybeSingle()
if (catErr) {
  console.error('branch_catalogs:', catErr.message)
  process.exit(1)
}

const catalog = structuredClone(catRow?.catalog || {
  version: 1,
  categories: [],
  services: [],
  durations: [],
})

if (!catalog.categories?.length) {
  catalog.categories = [{
    id: `${BRANCH_ID}-services`,
    name: 'DỊCH VỤ',
    sortOrder: 0,
    status: ACTIVE,
  }]
}
const categoryId = catalog.categories[0].id

const pricePlan = []
const catalogPlan = []

for (const [index, item] of TARGET.entries()) {
  const cur = byDur[item.id]
  const keepCommission = cur != null && Number.isFinite(Number(cur.commission_percent))
    ? Number(cur.commission_percent)
    : item.commissionPercent

  pricePlan.push({
    durationId: item.id,
    name: item.name,
    currentPrice: cur ? Number(cur.price) : null,
    newPrice: item.price,
    keepCommission,
    action: !cur
      ? 'INSERT_PRICE'
      : Number(cur.price) === item.price
        ? 'NOOP_PRICE'
        : 'UPDATE_PRICE_ONLY',
  })

  const duration = (catalog.durations || []).find((d) => d.id === item.id)
  const serviceId = duration?.serviceId || `${BRANCH_ID}-svc-${item.id}`
  const service = (catalog.services || []).find((s) => s.id === serviceId)

  if (!duration) {
    catalogPlan.push({ action: 'ADD_DURATION_SERVICE', durationId: item.id, serviceId, name: item.name })
    catalog.services.push({
      id: serviceId,
      categoryId,
      name: item.name,
      sortOrder: index,
      status: ACTIVE,
    })
    catalog.durations.push({
      id: item.id,
      serviceId,
      durationMinutes: (() => {
        const m = String(item.id).match(/(\d+)$/)
        return m ? Number(m[1]) : null
      })(),
      sortOrder: 0,
      status: ACTIVE,
    })
  } else if (service && service.name !== item.name) {
    catalogPlan.push({
      action: 'RENAME_SERVICE',
      durationId: item.id,
      serviceId,
      from: service.name,
      to: item.name,
    })
    service.name = item.name
    service.status = ACTIVE
    duration.status = ACTIVE
  } else {
    catalogPlan.push({ action: 'NOOP_CATALOG', durationId: item.id, serviceId, name: service?.name || item.name })
  }
}

console.log('\n=== PRICE PLAN (commission giữ nguyên) ===')
console.table(pricePlan.map((p) => ({
  id: p.durationId,
  action: p.action,
  from: p.currentPrice,
  to: p.newPrice,
  commissionKeep: p.keepCommission,
})))

console.log('\n=== CATALOG PLAN (chỉ song-khoe-spa) ===')
console.table(catalogPlan.map((p) => ({
  action: p.action,
  id: p.durationId,
  from: p.from || '',
  to: p.to || p.name || '',
})))

if (!APPLY) {
  console.log('\nDRY-RUN xong. Không ghi DB. Chưa commit/deploy.')
  process.exit(0)
}

// Apply prices
let priceOk = 0
let priceFail = 0
for (const p of pricePlan) {
  if (p.action === 'NOOP_PRICE') continue
  const { error: upErr } = await sb.from('branch_service_prices').upsert({
    branch_id: BRANCH_ID,
    duration_id: p.durationId,
    price: p.newPrice,
    commission_percent: p.keepCommission,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'branch_id,duration_id' })
  if (upErr) {
    console.error('PRICE FAIL', p.durationId, upErr.message)
    priceFail += 1
  } else {
    priceOk += 1
    console.log('PRICE OK', p.action, p.durationId, p.currentPrice, '→', p.newPrice, 'comm=', p.keepCommission)
  }
}

const { error: catUpErr } = await sb.from('branch_catalogs').upsert({
  branch_id: BRANCH_ID,
  catalog,
  updated_at: new Date().toISOString(),
}, { onConflict: 'branch_id' })

if (catUpErr) {
  console.error('CATALOG FAIL', catUpErr.message)
  process.exit(1)
}
console.log('CATALOG OK upsert song-khoe-spa')
console.log(`\nDone. prices touched=${priceOk} fail=${priceFail}`)
process.exit(priceFail ? 1 : 0)
