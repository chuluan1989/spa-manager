/**
 * UAT logic — Ly Ly 31/07 payroll invoice list vs net (READ-ONLY).
 * Run: node scripts/uat-lyly-payroll-invoice-list-scope.mjs
 *
 * Kỳ vọng nghiệp vụ:
 * - Danh sách HĐ khi xem Sóc Trăng = 2 (khớp màn HĐ)
 * - Net vẫn gồm tiền Trạm Spa
 * - Script này chỉ kiểm tra dữ liệu + quy tắc lọc; chưa đồng nghĩa PASS Production
 */
import { createClient } from '@supabase/supabase-js'

function canon(id) {
  return String(id || '').trim().toLowerCase()
}

function filterPayrollDisplayInvoices(invoices, employeeId, viewBranchId = '') {
  return invoices.filter((invoice) => {
    if (invoice.employee_id !== employeeId && invoice.support_employee_id !== employeeId) return false
    if (viewBranchId && canon(invoice.branch_id) !== canon(viewBranchId)) return false
    return true
  })
}

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const EMPLOYEE_ID = 'soc-trang-ly-ly'
const VIEW_BRANCH = 'soc-trang'
const DATE = '2026-07-31'

let failed = 0
function check(ok, label, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed += 1
}

const html = await fetch(BASE).then((r) => r.text())
const jsPath = html.match(/\/assets\/index-[^"]+\.js/)?.[0]
const js = jsPath ? await fetch(`${BASE}${jsPath}`).then((r) => r.text()) : ''
const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
  ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
if (!url || !key) throw new Error('Thiếu Supabase credentials')

const sb = createClient(url, key, { auth: { persistSession: false } })
const { data: invoices, error } = await sb.from('invoices')
  .select('id,date,branch_id,employee_id,support_employee_id,tips,commission')
  .eq('date', DATE)
  .or(`employee_id.eq.${EMPLOYEE_ID},support_employee_id.eq.${EMPLOYEE_ID}`)
if (error) throw error

const allForEmployee = filterPayrollDisplayInvoices(invoices, EMPLOYEE_ID, '')
const listForSocTrang = filterPayrollDisplayInvoices(invoices, EMPLOYEE_ID, VIEW_BRANCH)
const tram = allForEmployee.filter((i) => i.branch_id === 'tram-spa')

const tipsAll = allForEmployee.reduce((s, i) => s + Number(i.tips || 0), 0)
const tipsList = listForSocTrang.reduce((s, i) => s + Number(i.tips || 0), 0)
const tipsTram = tram.reduce((s, i) => s + Number(i.tips || 0), 0)
const commissionAll = allForEmployee.reduce((s, i) => s + Number(i.commission || 0), 0)
const commissionList = listForSocTrang.reduce((s, i) => s + Number(i.commission || 0), 0)

check(listForSocTrang.length === 2, 'Danh sách HĐ Sóc Trăng = 2', String(listForSocTrang.length))
check(allForEmployee.length === 3, 'Toàn bộ HĐ NV theo date = 3 (nguồn net)', String(allForEmployee.length))
check(tram.length === 1, 'Có đúng 1 HĐ Trạm (không vào list ST)', tram[0]?.id || 'missing')
check(
  !listForSocTrang.some((i) => i.branch_id === 'tram-spa'),
  'List ST không chứa Trạm Spa',
)
check(tipsTram > 0, 'Tips Trạm > 0 (phải cộng vào net)', String(tipsTram))
check(tipsAll === tipsList + tipsTram, 'Tips all = tips ST + tips Trạm', `${tipsAll} = ${tipsList} + ${tipsTram}`)
check(commissionAll > commissionList, 'HH all > HH list ST (Trạm đóng góp net)', `${commissionAll} > ${commissionList}`)

console.log('\nList ST ids:', listForSocTrang.map((i) => i.id))
console.log('Excluded Tram id:', tram.map((i) => i.id))
console.log(failed === 0 ? '\nUAT LOGIC OK — chưa deploy Production, chưa PASS' : `\nUAT LOGIC FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
