/**
 * UAT — fetch invoice pagination khớp Supabase (1295 HĐ / 305.380.000 T7).
 * Run: node --env-file=.env.local node_modules/.bin/vite-node scripts/verify-invoice-fetch-pagination.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'
import { INVOICE_FETCH_PAGE_SIZE, fetchAllInvoiceRows } from '../src/repositories/invoicesRepository.js'

function ticketRev(inv) {
  const serviceTotal = Number(inv.service_total)
  if (Number.isFinite(serviceTotal)) return serviceTotal
  return Number(inv.total) || 0
}

function log(label, ok, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
  assert.ok(ok, label)
}

const { url, key } = await loadProductionSupabaseEnv()
const sb = createClient(url, key)

console.log('\n=== UAT invoice fetch pagination ===\n')
log('INVOICE_FETCH_PAGE_SIZE = 1000', INVOICE_FETCH_PAGE_SIZE === 1000)

const { count: dbCount } = await sb.from('invoices').select('id', { count: 'exact', head: true })

// Old bug: single select caps at 1000
const { data: capped } = await sb
  .from('invoices')
  .select('id')
  .order('created_at', { ascending: false })
  .order('date', { ascending: false })
log('single select vẫn cắt 1000 (PostgREST)', (capped?.length ?? 0) === Math.min(1000, dbCount), String(capped?.length))

// New helper — inject query builder using production client pattern matching repository
async function fetchAllLikeApp(buildQuery) {
  const all = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + INVOICE_FETCH_PAGE_SIZE - 1)
    if (error) throw error
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < INVOICE_FETCH_PAGE_SIZE) break
    from += INVOICE_FETCH_PAGE_SIZE
  }
  return all
}

const allRows = await fetchAllLikeApp(() => sb
  .from('invoices')
  .select('id,date,branch_id,service_total,total,employee_id')
  .order('created_at', { ascending: false })
  .order('date', { ascending: false }))

log('paginate length = count(*)', allRows.length === dbCount, `${allRows.length} vs ${dbCount}`)

const july = allRows.filter((i) => i.date >= '2026-07-01' && i.date <= '2026-07-31')
const julyRev = july.reduce((s, i) => s + ticketRev(i), 0)
log('July count = 1295', july.length === 1295, String(july.length))
log('July service_total = 305380000', julyRev === 305380000, String(julyRev))

const byBranch = {}
const byBranchRev = {}
for (const inv of july) {
  byBranch[inv.branch_id] = (byBranch[inv.branch_id] || 0) + 1
  byBranchRev[inv.branch_id] = (byBranchRev[inv.branch_id] || 0) + ticketRev(inv)
}
log('Sóc Trăng July HĐ = 322', byBranch['soc-trang'] === 322)
log('Bạc Liêu July HĐ = 260', byBranch['bac-lieu'] === 260)
log('Trạm Spa July HĐ = 244', byBranch['tram-spa'] === 244)
log('Sóc Trăng 01-07 = 87', july.filter((i) => i.branch_id === 'soc-trang' && i.date <= '2026-07-07').length === 87)

const byMonth = {}
for (const inv of allRows) {
  const m = String(inv.date || '').slice(0, 7)
  byMonth[m] = (byMonth[m] || 0) + 1
}
log('có tháng 2026-07', byMonth['2026-07'] === 1295)

const byEmp = {}
for (const inv of july) {
  byEmp[inv.employee_id] = (byEmp[inv.employee_id] || 0) + 1
}
log('có phân bổ theo NV', Object.keys(byEmp).length > 20, String(Object.keys(byEmp).length))

// Source guarantees
const invRepo = readFileSync(fileURLToPath(new URL('../src/repositories/invoicesRepository.js', import.meta.url)), 'utf8')
const statsRepo = readFileSync(fileURLToPath(new URL('../src/repositories/serviceInvoiceStatsRepository.js', import.meta.url)), 'utf8')
log('fetchInvoices paginate', /export async function fetchInvoices[\s\S]*fetchAllInvoiceRows/.test(invRepo))
log('fetchInvoicesFiltered paginate', /export async function fetchInvoicesFiltered[\s\S]*fetchAllInvoiceRows/.test(invRepo))
log('service stats paginate', statsRepo.includes('fetchAllInvoiceRows'))
log('fetchAllInvoiceRows exported', typeof fetchAllInvoiceRows === 'function')

console.log('\nBranch July snapshot:')
for (const [b, n] of Object.entries(byBranch).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${b}: ${n} HĐ / ${byBranchRev[b]}`)
}

console.log('\n=== ALL PAGINATION UAT PASSED — khớp Supabase ===\n')
