/**
 * Probe attendance + audit tables on Supabase (read-only).
 * Usage:
 *   node scripts/probe-attendance-audit-schema.mjs
 *   PRODUCTION_URL=https://www.khoespa.net.vn node scripts/probe-attendance-audit-schema.mjs
 */
import { createClient } from '@supabase/supabase-js'

async function loadEnvFromProduction() {
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

function useLocalEnv() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
  if (!url || !key) return null
  return { url, key, base: 'local env' }
}

const env = useLocalEnv() ?? await loadEnvFromProduction()
const sb = createClient(env.url, env.key)

console.log(`\n=== Attendance audit schema probe (${env.base}) ===\n`)

const tables = [
  'attendance',
  'employee_attendance',
  'attendance_edit_logs',
]

for (const table of tables) {
  const { data, error } = await sb.from(table).select('*').limit(1)
  if (error) {
    console.log(`TABLE ${table}: MISSING/INACCESSIBLE — ${error.code ?? ''} ${error.message}`)
    continue
  }
  const cols = data?.[0] ? Object.keys(data[0]).sort().join(', ') : '(empty table — no row sample)'
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true })
  console.log(`TABLE ${table}: EXISTS rows≈${count ?? '?'} sample_cols=[${cols}]`)
}

const logColumns = [
  'id',
  'attendance_id',
  'editor_id',
  'editor_name',
  'edited_at',
  'field_name',
  'old_value',
  'new_value',
  'note',
]

console.log('\n--- attendance_edit_logs column probe ---')
for (const col of logColumns) {
  const { error } = await sb.from('attendance_edit_logs').select(col).limit(1)
  console.log(error ? `  MISSING ${col}: ${error.message}` : `  OK ${col}`)
}

console.log('\n--- attendance sample ---')
const att = await sb.from('attendance').select('id,attendance_date,employee_id,status').limit(3)
if (att.error) {
  console.log('attendance query failed:', att.error.message)
} else {
  console.log(JSON.stringify(att.data, null, 2))
}
