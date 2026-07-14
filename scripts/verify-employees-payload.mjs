/**
 * Phase 0.5 — đo payload employees trước/sau tối ưu SELECT.
 *
 * Chạy: npx vite-node scripts/verify-employees-payload.mjs
 *
 * Cần VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (.env.local hoặc shell).
 */
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

const EMPLOYEE_LOGIN_COLUMNS = 'id,name,branch_id,status,position,updated_at'
const EMPLOYEE_IMAGE_COLUMNS = 'avatar,cccd_front_image,cccd_back_image'
const EMPLOYEE_LIST_COLUMNS = [
  'id', 'branch_id', 'name', 'date_of_birth', 'gender', 'phone', 'email', 'cccd',
  'cccd_issue_date', 'cccd_issue_place', 'cccd_address', 'current_address',
  'bank_name', 'bank_account_holder', 'bank_account',
  'emergency_contact_name', 'emergency_contact_phone',
  'position', 'start_date', 'commission_rate', 'salary_rate',
  'status', 'note', 'days_off', 'branch_history', 'updated_at',
].join(',')

function fmtBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(3)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function measureJson(rows) {
  const json = JSON.stringify(rows ?? [])
  return {
    rows: rows?.length ?? 0,
    bytes: Buffer.byteLength(json, 'utf8'),
    json,
  }
}

async function fetchSelect(columns) {
  const { data, error } = await supabase
    .from('employees')
    .select(columns)
    .order('branch_id', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

async function main() {
  console.log('=== Phase 0.5 Employees Payload Verify ===\n')

  const before = measureJson(await fetchSelect('*'))
  const login = measureJson(await fetchSelect(EMPLOYEE_LOGIN_COLUMNS))
  const list = measureJson(await fetchSelect(EMPLOYEE_LIST_COLUMNS))
  const images = measureJson(await fetchSelect(EMPLOYEE_IMAGE_COLUMNS))

  const reductionList = before.bytes - list.bytes
  const reductionPct = ((reductionList / before.bytes) * 100).toFixed(1)

  console.log('| Query | Rows | Payload |')
  console.log('|---|---:|---:|')
  console.log(`| BEFORE select('*') | ${before.rows} | ${fmtBytes(before.bytes)} |`)
  console.log(`| Login columns | ${login.rows} | ${fmtBytes(login.bytes)} |`)
  console.log(`| AFTER list (no images) | ${list.rows} | ${fmtBytes(list.bytes)} |`)
  console.log(`| Images only (lazy) | ${images.rows} | ${fmtBytes(images.bytes)} |`)
  console.log('')
  console.log(`Giảm pullAll employees: ${fmtBytes(before.bytes)} → ${fmtBytes(list.bytes)} (−${reductionPct}%)`)
  console.log(`1 pullAll tiết kiệm: ~${fmtBytes(reductionList)}`)
  console.log('')

  assert.ok(before.rows > 0, 'Không có nhân viên trên Supabase')
  assert.ok(list.bytes < before.bytes * 0.05, `List payload vẫn quá lớn: ${fmtBytes(list.bytes)}`)
  assert.ok(login.bytes < before.bytes * 0.01, `Login payload vẫn quá lớn: ${fmtBytes(login.bytes)}`)

  const out = {
    measuredAt: new Date().toISOString(),
    rowCount: before.rows,
    beforeSelectStarBytes: before.bytes,
    loginBytes: login.bytes,
    listNoImagesBytes: list.bytes,
    imagesOnlyBytes: images.bytes,
    reductionBytes: reductionList,
    reductionPercent: Number(reductionPct),
    pass: true,
  }

  console.log('PASS — payload employees đã giảm MB → KB')
  console.log(JSON.stringify(out, null, 2))
}

main().catch((error) => {
  console.error('FAIL:', error?.message ?? error)
  process.exit(1)
})
