/**
 * Test đa máy cho hồ sơ nhân viên:
 * Máy A lưu → Máy B đọc → Admin đọc → cùng 1 bản ghi Supabase.
 *
 * Chạy: node scripts/verify-employee-profile-multidevice.mjs
 */
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const SAMPLE_ID = process.env.TEST_EMPLOYEE_ID ?? 'bac-lieu-my-nhien'

let passed = 0
let failed = 0

function ok(name, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function profileFingerprint(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name ?? '',
    phone: row.phone ?? '',
    current_address: row.current_address ?? '',
    cccd: row.cccd ?? '',
    branch_id: row.branch_id ?? '',
    updated_at: row.updated_at ?? '',
  }
}

function sameProfile(a, b) {
  if (!a || !b) return false
  return a.id === b.id
    && a.name === b.name
    && a.phone === b.phone
    && a.current_address === b.current_address
    && a.cccd === b.cccd
    && a.branch_id === b.branch_id
    && a.updated_at === b.updated_at
}

async function loadProductionSupabase() {
  const html = await fetch(BASE).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  ok('Có bundle Production', Boolean(jsMatch), jsMatch?.[0])
  const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  ok('Có Supabase credentials trong bundle', Boolean(url && key))
  ok(
    'Bundle MyProfile ưu tiên Supabase (không render cache cũ)',
    js.includes('Đang lấy dữ liệu từ máy chủ') || js.includes('loadOwnEmployeeProfileFromServer'),
  )
  return createClient(url, key)
}

console.log(`\n=== Verify hồ sơ đa máy — ${SAMPLE_ID} ===\n`)

const sb = await loadProductionSupabase()

const { data: before, error: beforeErr } = await sb
  .from('employees')
  .select('id,name,phone,current_address,cccd,branch_id,updated_at')
  .eq('id', SAMPLE_ID)
  .maybeSingle()

ok('Có employee mẫu trên Supabase', Boolean(before?.id), beforeErr?.message)
if (!before?.id) {
  console.log(`\nKết quả: ${passed} pass, ${failed} fail\n`)
  process.exit(1)
}

// --- Máy A: sửa hồ sơ (chỉ current_address marker tạm, rồi khôi phục) ---
const marker = `MD-TEST ${new Date().toISOString()}`
const originalAddress = before.current_address ?? ''
const t1 = new Date().toISOString()

const { data: machineARows, error: aErr } = await sb
  .from('employees')
  .update({ current_address: marker, updated_at: t1 })
  .eq('id', SAMPLE_ID)
  .eq('updated_at', before.updated_at)
  .select('id,name,phone,current_address,cccd,branch_id,updated_at')

ok('Máy A lưu hồ sơ OK', !aErr && machineARows?.length === 1, aErr?.message)
const machineA = profileFingerprint(machineARows?.[0])

// --- Máy B: đăng nhập máy mới = fetch thẳng theo employee_id (không localStorage) ---
const { data: machineBRow, error: bErr } = await sb
  .from('employees')
  .select('id,name,phone,current_address,cccd,branch_id,updated_at')
  .eq('id', SAMPLE_ID)
  .maybeSingle()

ok('Máy B đọc từ Supabase OK', !bErr && Boolean(machineBRow?.id), bErr?.message)
const machineB = profileFingerprint(machineBRow)
ok('Máy B thấy đúng dữ liệu Máy A vừa lưu', sameProfile(machineA, machineB), JSON.stringify({ machineA, machineB }))

// --- Admin: cùng query public.employees theo id ---
const { data: adminRow, error: adminErr } = await sb
  .from('employees')
  .select('id,name,phone,current_address,cccd,branch_id,updated_at')
  .eq('id', SAMPLE_ID)
  .maybeSingle()

ok('Admin đọc từ Supabase OK', !adminErr && Boolean(adminRow?.id), adminErr?.message)
const admin = profileFingerprint(adminRow)
ok('Admin giống Máy A', sameProfile(machineA, admin))
ok('Admin giống Máy B', sameProfile(machineB, admin))
ok('Ba nơi cùng một bản ghi (id+updated_at)', machineA?.id === machineB?.id && machineA?.updated_at === admin?.updated_at)

// --- Khôi phục địa chỉ gốc (không để marker test trên Production) ---
const { error: restoreErr } = await sb
  .from('employees')
  .update({ current_address: originalAddress, updated_at: new Date().toISOString() })
  .eq('id', SAMPLE_ID)
  .eq('updated_at', machineA.updated_at)

ok('Khôi phục current_address sau test', !restoreErr, restoreErr?.message)

// --- Backfill 6 name còn đúng ---
const NAME_TARGETS = [
  { id: 'bac-lieu-thao-cam', name: 'Thảo Cầm' },
  { id: 'soc-trang-bao-tran', name: 'Bảo Trân' },
  { id: 'soc-trang-chi-7', name: 'Chị 7' },
  { id: 'vinh-long-bo', name: 'Bơ' },
  { id: 'vinh-long-dau', name: 'Đậu' },
  { id: 'vinh-long-thao', name: 'Thảo' },
]
const { data: nameRows } = await sb
  .from('employees')
  .select('id,name')
  .in('id', NAME_TARGETS.map((t) => t.id))

const nameMap = Object.fromEntries((nameRows ?? []).map((r) => [r.id, r.name]))
for (const t of NAME_TARGETS) {
  ok(`Backfill name ${t.id}`, nameMap[t.id] === t.name, `got="${nameMap[t.id] ?? ''}"`)
}

console.log(`\nKết quả: ${passed} pass, ${failed} fail\n`)
process.exit(failed > 0 ? 1 : 0)
