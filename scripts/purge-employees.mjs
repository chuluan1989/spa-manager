/**
 * Xóa nhân viên khỏi Supabase (employees + app_credentials).
 * Chạy: node scripts/purge-employees.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return {}
  const vars = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
    vars[key] = value
  }
  return vars
}

const env = { ...process.env, ...loadEnvLocal() }
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY — chạy với .env.local (vite-node).')
  process.exit(1)
}

const sb = createClient(url, key)

const TARGET_IDS = [
  '96f4db26-9194-43e5-a6e1-d8e03fd398e7',
]

const TARGET_NAME_PATTERNS = [
  /^__SUPA_VERIFY_/,
  /^Mỹ Thanh$/i,
]

async function removeCredential(employeeId) {
  const { data: row, error: fetchErr } = await sb
    .from('app_credentials')
    .select('payload')
    .eq('id', 'default')
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!row?.payload?.employees?.[employeeId]) return false

  const payload = { ...row.payload, employees: { ...row.payload.employees } }
  delete payload.employees[employeeId]
  const { error: upsertErr } = await sb
    .from('app_credentials')
    .upsert({ id: 'default', payload, updated_at: new Date().toISOString() })
  if (upsertErr) throw upsertErr
  return true
}

async function purgeEmployee(emp) {
  console.log(`\nXóa: ${emp.name} (${emp.id})`)
  const credRemoved = await removeCredential(emp.id)
  console.log(credRemoved ? '  ✓ app_credentials' : '  · app_credentials (không có)')

  const { error } = await sb.from('employees').delete().eq('id', emp.id)
  if (error) throw error
  console.log('  ✓ employees')
}

async function main() {
  const toDelete = new Map()

  for (const id of TARGET_IDS) {
    const { data, error } = await sb.from('employees').select('id,name,branch_id,status').eq('id', id).maybeSingle()
    if (error) throw error
    if (data) toDelete.set(data.id, data)
    else console.log(`Không tìm thấy employee id=${id}`)
  }

  const { data: all, error: listErr } = await sb.from('employees').select('id,name,branch_id,status')
  if (listErr) throw listErr
  for (const emp of all ?? []) {
    if (TARGET_NAME_PATTERNS.some((re) => re.test(emp.name ?? ''))) {
      toDelete.set(emp.id, emp)
    }
  }

  if (toDelete.size === 0) {
    console.log('Không có nhân viên nào cần xóa.')
    return
  }

  for (const emp of toDelete.values()) {
    await purgeEmployee(emp)
  }

  console.log(`\nĐã xóa ${toDelete.size} nhân viên.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
