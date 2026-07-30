/**
 * Verify luồng "Khách yêu cầu": schema + dữ liệu thật trên Production.
 * Usage: node scripts/verify-customer-requested.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'

const { url, key } = await loadProductionSupabaseEnv()
const sb = createClient(url, key)

console.log('\n=== Verify Khách yêu cầu (Production) ===\n')

const probe = await sb.from('invoices').select('id,customer_requested,date,branch_id,employee_id').limit(1)
if (probe.error) {
  console.log('FAIL — Cột customer_requested:', probe.error.message)
  console.log('Root cause: Production thiếu migration 0012_invoice_customer_requested.sql')
  console.log('Hệ quả: upsert silently drops customer_requested → báo cáo luôn = 0\n')
  process.exit(1)
}
console.log('PASS — Cột customer_requested tồn tại')

const { data: flagged, error: flagErr } = await sb
  .from('invoices')
  .select('id,date,branch_id,employee_id,employee_name,customer_requested')
  .eq('customer_requested', true)
  .order('date', { ascending: false })
  .limit(20)

if (flagErr) {
  console.log('FAIL — Query flagged invoices:', flagErr.message)
  process.exit(1)
}

const { count: totalFlagged } = await sb
  .from('invoices')
  .select('id', { count: 'exact', head: true })
  .eq('customer_requested', true)

console.log(`Hóa đơn có customer_requested=true: ${totalFlagged ?? flagged?.length ?? 0}`)
if ((flagged ?? []).length > 0) {
  console.log('Mẫu gần nhất:')
  for (const inv of flagged.slice(0, 5)) {
    console.log(`  ${inv.date} | ${inv.employee_name ?? inv.employee_id} | ${inv.id}`)
  }
} else {
  console.log('Chưa có hóa đơn nào được đánh dấu — có thể chưa ai tick hoặc dữ liệu cũ không lưu field.')
}

const { count: totalInvoices } = await sb
  .from('invoices')
  .select('id', { count: 'exact', head: true })

console.log(`\nTổng hóa đơn: ${totalInvoices ?? '—'}`)
console.log('Phạm vi thống kê: chỉ hóa đơn có customer_requested=true được lưu trong DB.\n')
