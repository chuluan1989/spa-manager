/**
 * Production API verify: 8 chi nhánh — employees/invoices/attendance theo branch_id.
 * Không cần Puppeteer. Chạy: node scripts/verify-production-branches-api.mjs
 */
const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'

const BRANCH_IDS = [
  'soc-trang', 'song-khoe-spa', 'gia-lai-1', 'tra-vinh',
  'bac-lieu', 'vinh-long', 'gia-lai-2', 'tram-spa',
]

let passed = 0
let failed = 0

function ok(name) { passed++; console.log(`  ✓ ${name}`) }
function fail(name, detail = '') {
  failed++
  console.error(`  ✗ ${name}`)
  if (detail) console.error(`    ${detail}`)
}

async function loadSupabase() {
  const html = await fetch(BASE).then((r) => r.text())
  const jsPath = html.match(/\/assets\/index-[^"]+\.js/)?.[0]
  if (!jsPath) throw new Error('Không tìm thấy bundle JS Production')
  const js = await fetch(`${BASE}${jsPath}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if (!url || !key) throw new Error('Production thiếu Supabase credentials')
  return { url, key, js }
}

function hasBranchFix(js) {
  const markers = [
    '8 chi nhánh chuẩn',
    'Doanh thu hôm nay',
    'Chi nhánh này chưa có',
    'admin-branches',
  ]
  for (const m of markers) {
    if (!js.includes(m)) return { ok: false, missing: m }
  }
  return { ok: true }
}

async function sbGet(baseUrl, key, table, query = '') {
  const res = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${table}: ${res.status} ${text.slice(0, 200)}`)
  }
  const range = res.headers.get('content-range') ?? ''
  const countMatch = range.match(/\/(\d+)$/)
  const data = await res.json()
  return { data, count: countMatch ? Number(countMatch[1]) : data.length }
}

console.log(`\nProduction API branch verify — ${BASE}\n`)

try {
  const { url, key, js } = await loadSupabase()
  ok(`Production bundle + Supabase (${url})`)

  const fix = hasBranchFix(js)
  if (fix.ok) ok('Bundle chứa branch detail fix markers')
  else fail('Bundle thiếu branch fix', fix.missing)

  const { data: branches } = await sbGet(url, key, 'branches', 'select=id,name')
  const branchIds = new Set((branches ?? []).map((b) => b.id))
  for (const id of BRANCH_IDS) {
    if (branchIds.has(id)) ok(`Supabase branches: ${id}`)
    else fail(`Supabase branches: thiếu ${id}`)
  }

  for (const branchId of BRANCH_IDS) {
    const { count: empCount } = await sbGet(
      url, key, 'employees',
      `select=id&branch_id=eq.${branchId}&limit=1`,
    )
    ok(`${branchId}: employees query OK (${empCount ?? 0} NV)`)

    const { data: invSample } = await sbGet(
      url, key, 'invoices',
      `select=id,branch_id,created_at&branch_id=eq.${branchId}&order=created_at.desc&limit=3`,
    )
    const wrongBranch = (invSample ?? []).filter((r) => r.branch_id !== branchId)
    if (wrongBranch.length === 0) ok(`${branchId}: invoices scoped đúng branch_id`)
    else fail(`${branchId}: invoices sai branch_id`, JSON.stringify(wrongBranch))

    const { count: attCount } = await sbGet(
      url, key, 'attendance',
      `select=id&branch_id=eq.${branchId}&limit=1`,
    )
    ok(`${branchId}: attendance query OK (${attCount ?? 0} bản ghi)`)
  }
} catch (err) {
  fail('Lỗi không mong đợi', err.message)
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
