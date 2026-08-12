/**
 * READ-ONLY — Audit bảng giá Sống Khoẻ vs HĐ từ 2026-08-01.
 * Không ghi DB. Không sửa invoice.
 *
 *   AUDIT_FROM_PRODUCTION=1 node --env-file=.env.local \
 *     scripts/audit-song-khoe-prices-aug2026-readonly.mjs
 *
 * Hoặc dùng .env.preview.local / .env.development.local (không production).
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BRANCH_ID = 'song-khoe-spa'
const EFFECTIVE_FROM = '2026-08-01'
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence/song-khoe-price-aug2026')

/** Bảng giá mới Sống Khoẻ — chỉ dùng để so sánh (không ghi). */
const NEW_PRICES = [
  { id: 'body-60', names: ['body 60', 'massage body 60', 'body60', 'không đá nóng'], price: 190000 },
  { id: 'body-75', names: ['body 75', 'massage body 75', 'body75', 'đá nóng lưng'], price: 230000 },
  { id: 'body-90', names: ['body 90', 'massage body 90', 'body90', 'đá nóng lưng + chân'], price: 250000 },
  { id: 'goi-sach', names: ['gội sạch', 'gội đầu thư giãn', 'goi sach', 'goi dau thu gian', 'gội 30'], price: 70000 },
  { id: 'goi-duong-sinh', names: ['gội dưỡng sinh', 'goi duong sinh', 'gội đầu dưỡng sinh'], price: 130000 },
  { id: 'cao-mat', names: ['cạo mặt', 'cao mat', 'lột mụn', 'đắp mặt nạ'], price: 50000 },
  { id: 'chuyen-sau', names: ['chuyên sâu', 'chuyen sau', 'chuyen-sau'], price: 350000 },
  { id: 'combo-1', names: ['combo 1', 'combo-1', 'massage 60p + gội'], price: 260000 },
  { id: 'combo-2', names: ['combo 2', 'combo-2', 'massage 75p + giác'], price: 280000 },
  { id: 'combo-3', names: ['combo 3', 'combo-3'], price: 370000 },
  { id: 'foot', names: ['foot', 'massage chân', 'massage chan', 'chân 30'], price: 100000 },
  { id: 'co-vai-gay', names: ['cổ vai gáy', 'co vai gay', 'co-vai-gay', 'trị liệu cổ'], price: 150000 },
  { id: 'giac-hoi', names: ['giác hơi', 'giac hoi', 'cạo gió', 'cao gio'], price: 50000 },
  { id: 'dap-thuoc', names: ['đắp thuốc', 'dap thuoc', 'xông ngải', 'xong ngai', 'thảo dược'], price: 30000 },
  { id: 'phong-don', names: ['phòng đơn', 'phong don', 'phụ thu phòng'], price: 40000 },
]

const NEW_BY_ID = Object.fromEntries(NEW_PRICES.map((r) => [r.id, r.price]))

function norm(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
}

function money(n) {
  return Math.round(Number(n) || 0)
}

function matchServiceKey(line) {
  const id = norm(line?.serviceId || line?.id || '')
  const name = norm(line?.serviceName || line?.name || '')
  const hay = `${id} ${name}`.trim()

  // Exact / suffix flat id
  for (const row of NEW_PRICES) {
    if (id === row.id || id.endsWith(`-${row.id}`) || id.endsWith(`/${row.id}`)) return row.id
  }

  // body duration first (avoid body-90 matching body)
  if (/body[\s_-]*90|massage body.*90|body 90/.test(hay)) return 'body-90'
  if (/body[\s_-]*75|massage body.*75|body 75/.test(hay)) return 'body-75'
  if (/body[\s_-]*60|massage body.*60|body 60/.test(hay)) return 'body-60'
  if (/combo[\s_-]*3|combo 3/.test(hay)) return 'combo-3'
  if (/combo[\s_-]*2|combo 2/.test(hay)) return 'combo-2'
  if (/combo[\s_-]*1|combo 1/.test(hay)) return 'combo-1'
  if (/chuyen sau|chuyen-sau|chuyen sau/.test(hay) || /chuyen sau/.test(hay)) return 'chuyen-sau'
  if (/goi duong sinh|goi dau duong sinh/.test(hay)) return 'goi-duong-sinh'
  if (/goi sach|goi dau thu gian|goi 30/.test(hay)) return 'goi-sach'
  if (/co vai gay|tri lieu co/.test(hay)) return 'co-vai-gay'
  if (/(^|[\s_-])foot([\s_-]|$)|massage chan|massage chân/.test(hay)) return 'foot'
  if (/giac hoi|cao gio/.test(hay)) return 'giac-hoi'
  if (/cao mat|lot mun|dap mat na/.test(hay)) return 'cao-mat'
  if (/dap thuoc|xong ngai|thao duoc/.test(hay)) return 'dap-thuoc'
  if (/phong don|phu thu phong/.test(hay)) return 'phong-don'

  for (const row of NEW_PRICES) {
    if (row.names.some((n) => hay.includes(norm(n)))) return row.id
  }
  return null
}

function lineSnapshotPrice(line) {
  const candidates = [line?.originalPrice, line?.servicePrice, line?.price]
  for (const c of candidates) {
    if (c != null && c !== '' && Number.isFinite(Number(c))) return money(c)
  }
  return null
}

async function resolveSupabase() {
  if (process.env.AUDIT_FROM_PRODUCTION === '1' || process.env.FORCE_PRODUCTION_BUNDLE === '1') {
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

const { url, key, source } = await resolveSupabase()
const sb = createClient(url, key, { auth: { persistSession: false } })
console.log(`Credential: ${source}`)
console.log(`Branch: ${BRANCH_ID} | effective_from: ${EFFECTIVE_FROM} (READ-ONLY)\n`)

// --- Branch confirmation ---
const { data: branches, error: brErr } = await sb.from('branches').select('id,name,price_group_id').eq('id', BRANCH_ID)
if (brErr) console.warn('branches query:', brErr.message)
const branchRow = branches?.[0]
console.log('Branch row:', branchRow || '(không đọc được — dùng canonical id song-khoe-spa)')

// --- Current catalog prices ---
let catalogPrices = []
try {
  catalogPrices = await fetchAll(
    sb,
    'branch_service_prices',
    'branch_id,duration_id,price,commission_percent',
    (q) => q.eq('branch_id', BRANCH_ID),
  )
} catch (err) {
  console.warn('branch_service_prices:', err.message)
}

let legacyPricing = null
try {
  const { data, error } = await sb.from('branch_pricing').select('*').eq('branch_id', BRANCH_ID).maybeSingle()
  if (error) throw error
  legacyPricing = data
} catch (err) {
  console.warn('branch_pricing:', err.message)
}

const catalogByDuration = {}
for (const row of catalogPrices) {
  const dur = row.duration_id
  if (!dur) continue
  catalogByDuration[dur] = {
    price: money(row.price),
    commissionPercent: row.commission_percent,
  }
}

// Merge legacy overrides if v2 empty / partial
const legacyOverrides = legacyPricing?.overrides
  || legacyPricing?.data?.overrides
  || (typeof legacyPricing?.overrides_json === 'object' ? legacyPricing.overrides_json : null)
  || null
if (legacyOverrides && typeof legacyOverrides === 'object') {
  for (const [sid, entry] of Object.entries(legacyOverrides)) {
    if (catalogByDuration[sid]) continue
    catalogByDuration[sid] = {
      price: money(entry?.price),
      commissionPercent: entry?.commissionPercent ?? entry?.commission_percent ?? null,
      source: 'branch_pricing.overrides',
    }
  }
}

console.log(`\nCatalog prices (song-khoe-spa): ${Object.keys(catalogByDuration).length} rows`)

// Also try branch_catalogs jsonb prices aren't stored there — prices are separate.
let branchCatalogMeta = null
try {
  const { data, error } = await sb.from('branch_catalogs').select('branch_id,catalog,updated_at').eq('branch_id', BRANCH_ID).maybeSingle()
  if (error) throw error
  branchCatalogMeta = data
    ? {
        updatedAt: data.updated_at,
        durationIds: (data.catalog?.durations || []).map((d) => d.id),
        serviceNames: (data.catalog?.services || []).map((s) => s.name),
      }
    : null
} catch (err) {
  console.warn('branch_catalogs:', err.message)
}

const catalogDiff = []
for (const [id, newPrice] of Object.entries(NEW_BY_ID)) {
  const cur = catalogByDuration[id]
  if (!cur) {
    catalogDiff.push({ id, status: 'MISSING_IN_CATALOG', current: null, newPrice, commissionPercent: null })
  } else if (cur.price !== newPrice) {
    catalogDiff.push({
      id,
      status: 'PRICE_DIFF',
      current: cur.price,
      newPrice,
      delta: newPrice - cur.price,
      commissionPercent: cur.commissionPercent,
      source: cur.source || 'branch_service_prices',
    })
  } else {
    catalogDiff.push({
      id,
      status: 'MATCH',
      current: cur.price,
      newPrice,
      commissionPercent: cur.commissionPercent,
      source: cur.source || 'branch_service_prices',
    })
  }
}

// Also flag catalog rows not in new list
for (const id of Object.keys(catalogByDuration)) {
  if (!NEW_BY_ID[id]) {
    catalogDiff.push({
      id,
      status: 'EXTRA_IN_CATALOG',
      current: catalogByDuration[id].price,
      newPrice: null,
      commissionPercent: catalogByDuration[id].commissionPercent,
      source: catalogByDuration[id].source || 'branch_service_prices',
    })
  }
}

// --- Invoices ---
const today = new Date().toISOString().slice(0, 10)
const invoices = await fetchAll(
  sb,
  'invoices',
  'id,date,branch_id,employee_id,support_employee_id,services,tips,commission,service_total,total,payment_method,created_at',
  (q) => q.eq('branch_id', BRANCH_ID).gte('date', EFFECTIVE_FROM).lte('date', today).order('date', { ascending: true }),
)

console.log(`Invoices ${EFFECTIVE_FROM}→${today}: ${invoices.length}`)

// Payroll closes approved for song-khoe
let closes = []
try {
  closes = await fetchAll(
    sb,
    'payroll_cycle_closes',
    'id,employee_id,branch_id,billing_month,cycle,status,from_date,to_date,approved_at',
    (q) => q.eq('branch_id', BRANCH_ID).eq('status', 'approved'),
  )
} catch (err) {
  // fallback without branch filter
  try {
    closes = await fetchAll(
      sb,
      'payroll_cycle_closes',
      'id,employee_id,branch_id,billing_month,cycle,status,from_date,to_date,approved_at',
      (q) => q.eq('status', 'approved'),
    )
    closes = closes.filter((c) => c.branch_id === BRANCH_ID || !c.branch_id)
  } catch (e2) {
    console.warn('payroll_cycle_closes:', e2.message)
  }
}

function invoiceInApprovedClose(inv) {
  const d = inv.date
  const emp = inv.employee_id
  return closes.filter((c) => {
    if (c.employee_id && emp && c.employee_id !== emp) return false
    if (c.branch_id && c.branch_id !== BRANCH_ID) return false
    const from = c.from_date || ''
    const to = c.to_date || ''
    if (from && to) return d >= from && d <= to
    // fallback by billing month + cycle windows
    const bm = c.billing_month
    if (!bm) return false
    if (c.cycle === 'period_1' || c.cycle === '1' || c.cycle === 1) {
      return d >= `${bm}-01` && d <= `${bm}-15`
    }
    return d >= `${bm}-16` && d <= `${bm}-31`
  })
}

const mismatchedLines = []
const unmatchedLines = []
const linePriceFrequency = {}
let invoicesAllMatch = 0
let invoicesHasMismatch = 0
let invoicesNoMappedLines = 0
let revenueDeltaIfFixed = 0

const invoiceSummaries = []

for (const inv of invoices) {
  const services = Array.isArray(inv.services) ? inv.services : []
  let invMismatch = false
  let invMapped = 0
  let invDelta = 0
  const lineDetails = []

  for (const line of services) {
    const key = matchServiceKey(line)
    const snap = lineSnapshotPrice(line)
    const freqKey = `${key || 'UNMAPPED'}|${line?.name || line?.serviceName || line?.id || '?'}|${snap}`
    linePriceFrequency[freqKey] = (linePriceFrequency[freqKey] || 0) + 1
    if (!key) {
      unmatchedLines.push({
        invoiceId: inv.id,
        date: inv.date,
        name: line?.name || line?.serviceName,
        serviceId: line?.serviceId || line?.id,
        snapPrice: snap,
      })
      continue
    }
    invMapped += 1
    const expected = NEW_BY_ID[key]
    const ok = snap === expected
    if (!ok) {
      invMismatch = true
      const delta = expected - (snap ?? 0)
      invDelta += delta
      mismatchedLines.push({
        invoiceId: inv.id,
        date: inv.date,
        employeeId: inv.employee_id,
        serviceKey: key,
        serviceId: line?.serviceId || line?.id,
        serviceName: line?.name || line?.serviceName,
        snapPrice: snap,
        newPrice: expected,
        delta,
        commissionPercent: line?.commissionPercent,
        commissionAmount: line?.commissionAmount,
      })
    }
    lineDetails.push({ key, snap, expected, ok })
  }

  const approvedHits = invoiceInApprovedClose(inv)
  if (invMapped === 0) invoicesNoMappedLines += 1
  else if (invMismatch) {
    invoicesHasMismatch += 1
    revenueDeltaIfFixed += invDelta
  } else invoicesAllMatch += 1

  invoiceSummaries.push({
    id: inv.id,
    date: inv.date,
    employeeId: inv.employee_id,
    mappedLines: invMapped,
    hasMismatch: invMismatch,
    deltaIfFixed: invDelta,
    serviceTotal: inv.service_total,
    total: inv.total,
    tips: inv.tips,
    approvedCloses: approvedHits.map((c) => ({
      id: c.id,
      billingMonth: c.billing_month,
      cycle: c.cycle,
      from: c.from_date,
      to: c.to_date,
      approvedAt: c.approved_at,
    })),
  })
}

const approvedLockedMismatches = invoiceSummaries.filter(
  (s) => s.hasMismatch && s.approvedCloses.length > 0,
)
const editableMismatches = invoiceSummaries.filter(
  (s) => s.hasMismatch && s.approvedCloses.length === 0,
)

// Aggregate by service
const byService = {}
for (const row of mismatchedLines) {
  if (!byService[row.serviceKey]) {
    byService[row.serviceKey] = {
      serviceKey: row.serviceKey,
      newPrice: row.newPrice,
      count: 0,
      oldPrices: {},
      revenueDelta: 0,
    }
  }
  const b = byService[row.serviceKey]
  b.count += 1
  b.oldPrices[row.snapPrice] = (b.oldPrices[row.snapPrice] || 0) + 1
  b.revenueDelta += row.delta
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const report = {
  readOnly: true,
  generatedAt: new Date().toISOString(),
  credentialSource: source,
  branchId: BRANCH_ID,
  branchRow: branchRow || null,
  effectiveFrom: EFFECTIVE_FROM,
  architectureNote: {
    hasEffectiveFrom: false,
    limitation:
      'Hệ thống không có version giá theo ngày (effective_from). Cập nhật catalog = giá hiện tại cho HĐ mới. HĐ cũ giữ snapshot trên từng line.',
  },
  newPriceList: NEW_BY_ID,
  catalog: {
    rowCount: catalogPrices.length,
    byDuration: catalogByDuration,
    vsNew: catalogDiff,
    legacyPricingPresent: Boolean(legacyPricing),
    legacyOverrideKeys: legacyOverrides ? Object.keys(legacyOverrides) : [],
    branchCatalogMeta,
  },
  invoices: {
    total: invoices.length,
    allLinesMatchNew: invoicesAllMatch,
    hasOldPriceLines: invoicesHasMismatch,
    noMappedLines: invoicesNoMappedLines,
    revenueDeltaIfAllEditableFixed: revenueDeltaIfFixed,
  },
  linePriceFrequency: Object.entries(linePriceFrequency)
    .sort((a, b) => b[1] - a[1])
    .map(([k, count]) => {
      const [serviceKey, name, price] = k.split('|')
      return { serviceKey, name, snapPrice: Number(price), count }
    }),
  mismatchesByService: Object.values(byService),
  mismatchedLineCount: mismatchedLines.length,
  unmatchedLineSample: unmatchedLines.slice(0, 50),
  approvedLockedInvoiceCount: approvedLockedMismatches.length,
  approvedLockedInvoices: approvedLockedMismatches.slice(0, 200),
  editableMismatchInvoiceCount: editableMismatches.length,
  editableMismatchInvoices: editableMismatches.slice(0, 200),
  invoiceSummaries,
}

const jsonPath = path.join(OUT_DIR, 'SONG_KHOE_PRICE_AUDIT_READONLY.json')
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

const md = `# Audit bảng giá Sống Khoẻ (READ-ONLY)

| Field | Value |
|-------|-------|
| Branch ID | \`${BRANCH_ID}\` |
| Branch name | ${branchRow?.name || 'Sống Khoẻ Spa (canonical)'} |
| Hiệu lực nghiệp vụ | ${EFFECTIVE_FROM} |
| Credential | ${source} |
| generatedAt | ${report.generatedAt} |

## Giới hạn kiến trúc

**Không có \`effective_from\` / version giá theo ngày.**

- Cập nhật catalog → chỉ ảnh hưởng form HĐ mới (giá hiện tại).
- HĐ lịch sử giữ snapshot \`price\` / \`servicePrice\` / \`commission*\` trên từng line.
- Không tự xây kiến trúc versioning lớn trong lần này.

## Catalog hiện tại vs bảng giá mới

| serviceId | Hiện tại | Giá mới | Trạng thái | commission% (giữ) |
|-----------|---------:|--------:|------------|-------------------|
${catalogDiff.map((r) => `| ${r.id} | ${r.current ?? '—'} | ${r.newPrice ?? '—'} | ${r.status} | ${r.commissionPercent ?? '—'} |`).join('\n')}

## Hóa đơn ${EFFECTIVE_FROM} → ${today}

| Metric | Count |
|--------|------:|
| Tổng HĐ | ${invoices.length} |
| HĐ khớp giá mới (mọi line map được) | ${invoicesAllMatch} |
| HĐ còn line giá cũ / lệch | ${invoicesHasMismatch} |
| HĐ không map được service | ${invoicesNoMappedLines} |
| Line lệch | ${mismatchedLines.length} |
| Chênh lệch doanh thu nếu sửa hết line lệch | ${revenueDeltaIfFixed.toLocaleString('vi-VN')}đ |
| HĐ lệch thuộc kỳ lương **approved** (KHÔNG tự sửa) | ${approvedLockedMismatches.length} |
| HĐ lệch có thể đề xuất sửa an toàn | ${editableMismatches.length} |

### Phân bố giá snapshot trên HĐ (01/08 → nay)

| serviceKey | Tên trên HĐ | Giá snapshot | Số line |
|------------|-------------|-------------:|--------:|
${report.linePriceFrequency.map((r) => `| ${r.serviceKey} | ${r.name} | ${r.snapPrice} | ${r.count} |`).join('\n') || '| — | — | — | 0 |'}

### Lệch theo dịch vụ

| serviceId | Giá mới | Số line lệch | Giá cũ (tần suất) | Δ doanh thu |
|-----------|--------:|-------------:|-------------------|------------:|
${Object.values(byService).map((b) => `| ${b.serviceKey} | ${b.newPrice} | ${b.count} | ${JSON.stringify(b.oldPrices)} | ${b.revenueDelta} |`).join('\n') || '| — | — | 0 | — | 0 |'}

## Đề xuất tiếp theo (CHƯA APPLY)

1. Preview: cập nhật seed + \`branch_service_prices\` chỉ \`song-khoe-spa\` (chỉ \`price\`, giữ \`commission_percent\`).
2. UAT form HĐ Sống Khoẻ tải giá mới; đổi CN → catalog đúng.
3. HĐ \`date < 2026-08-01\`: **không đụng**.
4. HĐ \`>= 2026-08-01\` lệch + **không** approved: script map theo serviceId/name, chỉ sửa giá line, giữ tips/%/NV/CN, recompute commissionAmount + totals helper chuẩn.
5. HĐ lệch + kỳ **approved**: liệt kê cho Admin (adjustment/audit) — không tự sửa.

Chi tiết JSON: \`${jsonPath}\`
`
fs.writeFileSync(path.join(OUT_DIR, 'SONG_KHOE_PRICE_AUDIT_READONLY.md'), md)

console.log('\n=== SUMMARY ===')
console.log(`Catalog diffs needing change: ${catalogDiff.filter((r) => r.status === 'PRICE_DIFF' || r.status === 'MISSING_IN_CATALOG').length}`)
console.log(`Invoices total: ${invoices.length}`)
console.log(`Match new: ${invoicesAllMatch} | Mismatch: ${invoicesHasMismatch} | Unmapped-only: ${invoicesNoMappedLines}`)
console.log(`Approved-locked mismatches: ${approvedLockedMismatches.length}`)
console.log(`Editable mismatches: ${editableMismatches.length}`)
console.log(`Revenue Δ if fix editable lines (all mismatch Δ): ${revenueDeltaIfFixed}`)
console.log(`\nWrote:\n- ${jsonPath}\n- ${path.join(OUT_DIR, 'SONG_KHOE_PRICE_AUDIT_READONLY.md')}`)
