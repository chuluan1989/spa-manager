/**
 * Verify attendance audit log insert/fetch against Supabase.
 * Mirrors attendanceRepository.insertAttendanceEditLogs + fetchAttendanceEditLogs.
 *
 * Run (Production read probe — insert blocked until 0035 applied):
 *   node scripts/verify-attendance-audit.mjs
 *
 * Run insert test after migration (cleans up test row):
 *   ALLOW_AUDIT_WRITE=1 node scripts/verify-attendance-audit.mjs
 */
import { createClient } from '@supabase/supabase-js'

async function loadProductionEnv() {
  const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
  const html = await fetch(BASE).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  if (!jsMatch) throw new Error('Không tìm thấy bundle JS')
  const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if (!url || !key) throw new Error('Không tìm thấy Supabase credentials')
  return { url, key, base: BASE }
}

const allowWrite = process.env.ALLOW_AUDIT_WRITE === '1'
const { url, key, base } = await loadProductionEnv()
const sb = createClient(url, key)

let passed = 0
let failed = 0

function log(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}`)
    if (detail) console.error(`    ${detail}`)
  }
}

function buildLogRow(attendanceId, overrides = {}) {
  const now = new Date().toISOString()
  return {
    id: overrides.id ?? `attlog-verify-${Date.now()}`,
    attendance_id: attendanceId,
    editor_id: overrides.editor_id ?? 'verify-script',
    editor_name: overrides.editor_name ?? 'Verify Script',
    edited_at: overrides.edited_at ?? now,
    field_name: overrides.field_name ?? 'status',
    old_value: overrides.old_value ?? 'on_time',
    new_value: overrides.new_value ?? 'late_2h_permitted',
    note: overrides.note ?? 'Smoke test audit — sẽ xóa sau verify',
  }
}

console.log(`\n=== Verify attendance audit (${base}) ===\n`)

const tableProbe = await sb.from('attendance_edit_logs').select('id').limit(1)
const tableExists = !tableProbe.error
log('Bảng attendance_edit_logs tồn tại', tableExists, tableProbe.error?.message ?? '')

if (!tableExists) {
  console.log('\n→ Cần chạy supabase/migrations/0035_create_attendance_edit_logs.sql trước.')
  console.log('→ KHÔNG chạy 0034 nếu bảng chưa có.\n')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  process.exit(1)
}

const requiredCols = [
  'id', 'attendance_id', 'editor_id', 'editor_name', 'edited_at',
  'field_name', 'old_value', 'new_value', 'note',
]
for (const col of requiredCols) {
  const { error } = await sb.from('attendance_edit_logs').select(col).limit(1)
  log(`Cột ${col}`, !error, error?.message ?? '')
}

const { data: sampleAtt, error: attErr } = await sb
  .from('attendance')
  .select('id,attendance_date,employee_id,status')
  .limit(1)
  .maybeSingle()
log('Có bản ghi attendance mẫu để test FK', Boolean(sampleAtt?.id), attErr?.message ?? '')

if (!allowWrite) {
  console.log('\n(Bỏ qua insert test — set ALLOW_AUDIT_WRITE=1 sau khi chạy migration 0035)\n')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}

if (!sampleAtt?.id) {
  log('Insert audit test', false, 'Không có attendance để gắn FK')
  process.exit(1)
}

const testLogId = `attlog-verify-${Date.now()}`
const insertRow = buildLogRow(sampleAtt.id, { id: testLogId })

const { data: inserted, error: insertErr } = await sb
  .from('attendance_edit_logs')
  .insert(insertRow)
  .select('*')
  .single()
log('Insert audit log (status change)', !insertErr, insertErr?.message ?? '')

const { data: fetched, error: fetchErr } = await sb
  .from('attendance_edit_logs')
  .select('*')
  .eq('attendance_id', sampleAtt.id)
  .order('edited_at', { ascending: false })
log('Fetch audit logs by attendance_id', !fetchErr && (fetched?.length ?? 0) > 0, fetchErr?.message ?? '')

const found = (fetched ?? []).find((row) => row.id === testLogId)
log('Log vừa insert có trong fetch', Boolean(found))
log('field_name / old_value / new_value / note khớp', Boolean(
  found
  && found.field_name === insertRow.field_name
  && found.old_value === insertRow.old_value
  && found.new_value === insertRow.new_value
  && found.note === insertRow.note,
))

const voidRow = buildLogRow(sampleAtt.id, {
  id: `${testLogId}-void`,
  field_name: 'status',
  old_value: sampleAtt.status,
  new_value: 'cancelled',
  note: 'Verify void audit',
})
const { error: voidErr } = await sb.from('attendance_edit_logs').insert(voidRow).select('id').single()
log('Insert audit void/cancelled', !voidErr, voidErr?.message ?? '')

await sb.from('attendance_edit_logs').delete().eq('id', testLogId)
await sb.from('attendance_edit_logs').delete().eq('id', `${testLogId}-void`)
log('Cleanup test logs', true)

console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
