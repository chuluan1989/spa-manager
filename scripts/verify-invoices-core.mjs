import { createClient } from '@supabase/supabase-js'
import { fetchInvoices, fetchInvoicesFiltered } from '../src/repositories/invoicesRepository.js'
import { sortInvoicesDesc } from '../src/utils/invoiceFilters.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(url, key)

let passed = 0
let failed = 0

function ok(msg) { passed++; console.log(`  ✓ ${msg}`) }
function fail(msg, err) { failed++; console.error(`  ✗ ${msg}`); console.error(`    ${err?.message ?? err}`) }

console.log('\n=== A. Kiểm tra bảng invoices ===\n')

const { data: sample, error: sampleErr } = await sb.from('invoices').select('id,date,branch_id,employee_id,customer_name,customer_phone,created_at,updated_at,tips,total,service_total').order('created_at', { ascending: false }).limit(5)
if (sampleErr) fail('Query invoices cơ bản', sampleErr)
else {
  ok(`Query OK — ${sample?.length ?? 0} mẫu gần nhất`)
  for (const row of sample ?? []) {
    console.log(`    ${row.date} | ${row.branch_id} | ${row.employee_name ?? row.employee_id} | ${row.customer_name} | created=${row.created_at}`)
  }
}

const { count: totalCount, error: countErr } = await sb.from('invoices').select('id', { count: 'exact', head: true })
if (countErr) fail('Đếm tổng hóa đơn', countErr)
else ok(`Tổng hóa đơn trên Supabase: ${totalCount ?? 0}`)

console.log('\n=== B. Hóa đơn ngày 07/07/2026 ===\n')
const { data: jul7, error: jul7Err } = await sb.from('invoices').select('id,date,branch_id,employee_id,employee_name,customer_name,created_at').eq('date', '2026-07-07').order('created_at', { ascending: false })
if (jul7Err) fail('Query 2026-07-07', jul7Err)
else {
  ok(`Hóa đơn 07/07/2026: ${jul7?.length ?? 0} dòng`)
  for (const row of jul7 ?? []) {
    console.log(`    ${row.id} | ${row.branch_id} | ${row.employee_name} | ${row.customer_name}`)
  }
}

console.log('\n=== C. Repository fetchInvoices ===\n')
try {
  const all = await fetchInvoices()
  ok(`fetchInvoices(): ${all.length} hóa đơn`)
  const sorted = sortInvoicesDesc(all)
  if (sorted[0]) {
    console.log(`    Mới nhất: ${sorted[0].date} | ${sorted[0].customerName} | createdAt=${sorted[0].createdAt}`)
  }
} catch (error) {
  fail('fetchInvoices()', error)
}

console.log('\n=== D. Filter tháng 07/2026 ===\n')
try {
  const month = await fetchInvoicesFiltered({ fromDate: '2026-07-01', toDate: '2026-07-31' })
  ok(`fetchInvoicesFiltered tháng 7: ${month.length} hóa đơn`)
} catch (error) {
  fail('fetchInvoicesFiltered tháng 7', error)
}

console.log('\n=== E. Kiểm tra cột có thể thiếu ===\n')
for (const col of ['created_at', 'customer_phone', 'invoice_time', 'entered_by', 'discount_amount', 'original_service_total']) {
  const { error } = await sb.from('invoices').select(col).limit(1)
  if (error) console.log(`  ⚠ invoices.${col} — ${error.message}`)
  else ok(`invoices.${col}`)
}

console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
