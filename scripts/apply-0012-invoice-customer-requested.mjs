/**
 * Apply / verify migration 0012_invoice_customer_requested.sql
 *
 * Requires: SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 * Fallback: chạy thủ công trên Supabase SQL Editor
 *
 * Run: node --env-file=.env.local scripts/apply-0012-invoice-customer-requested.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const sqlPath = path.join(process.cwd(), 'supabase/migrations/0012_invoice_customer_requested.sql')
const sql = fs.readFileSync(sqlPath, 'utf8').trim()

async function verifyColumn(sb) {
  const { error } = await sb.from('invoices').select('customer_requested').limit(1)
  return !error
}

console.log('\n=== Migration 0012: invoice.customer_requested ===\n')
console.log('SQL:', sql)
console.log('')

if (!url || !serviceKey) {
  console.error('Thiếu SUPABASE_SERVICE_ROLE_KEY — chạy thủ công trên Supabase SQL Editor:')
  console.error(`  ${sqlPath}`)
  process.exit(2)
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

try {
  if (await verifyColumn(sb)) {
    console.log('OK — Cột customer_requested đã tồn tại')
    process.exit(0)
  }

  const { error } = await sb.rpc('exec_sql', { query: `${sql};` })
  if (error) throw error

  if (!(await verifyColumn(sb))) {
    console.error('Migration chạy xong nhưng chưa probe được customer_requested')
    process.exit(1)
  }
  console.log('OK — Migration 0012 đã áp dụng')
  process.exit(0)
} catch (error) {
  console.error('Lỗi:', error.message)
  console.error('\nChạy thủ công trên Supabase Dashboard → SQL Editor:')
  console.error(`  ${sqlPath}\n`)
  process.exit(1)
}
