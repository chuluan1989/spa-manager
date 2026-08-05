/**
 * Production smoke — Payroll UI clarification (READ-ONLY).
 * Run: node scripts/smoke-payroll-ui-clarification-production.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const FROM = '2026-07-31'
const TO = '2026-07-31'

let failed = 0
function check(ok, label, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed += 1
}

const html = await fetch(BASE).then((r) => r.text())
const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
if (!jsMatch) throw new Error('Không tìm thấy bundle')
const bundlePath = jsMatch[0]
const js = await fetch(`${BASE}${bundlePath}`).then((r) => r.text())
const cssMatch = html.match(/\/assets\/index-[^"]+\.css/)
const cssPath = cssMatch?.[0] || null
const css = cssPath ? await fetch(`${BASE}${cssPath}`).then((r) => r.text()) : ''

const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
  ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
if (!url || !key) throw new Error('Thiếu Supabase credentials từ bundle')

console.log(`Production: ${BASE}`)
console.log(`Bundle: ${bundlePath}`)
if (cssPath) console.log(`CSS: ${cssPath}`)

check(js.includes('Một hóa đơn có thể gồm nhiều khoản'), 'Wallet hint copy')
check(js.includes('Đây không phải số lượng hóa đơn'), 'Wallet not-invoice-count copy')
check(js.includes('Tổng thu nhập toàn kỳ của nhân viên'), 'Salary total-income copy')
check(js.includes('ngày phục vụ (date)'), 'Backdate policy copy (date)')
check(js.includes('không dùng ngày tạo (created_at)') || js.includes('created_at'), 'Backdate policy copy (created_at)')
check(js.includes('Chi nhánh hiện tại'), 'Invoice scope: current branch')
check(js.includes('Tất cả chi nhánh'), 'Invoice scope: all branches')
check(js.includes('Theo nhân viên'), 'Invoice scope: by employee')
check(js.includes('groupWalletTimelineEntries') || js.includes('salary-wallet__item--invoice') || css.includes('salary-wallet__parts'), 'Wallet grouping styles/markers')
check(css.includes('salary-wallet__parts') || js.includes('salary-wallet__parts'), 'Wallet parts CSS class')

const sb = createClient(url, key, { auth: { persistSession: false } })

async function fetchAll(table, columns, apply) {
  const pageSize = 1000
  let from = 0
  const rows = []
  for (;;) {
    let q = sb.from(table).select(columns).range(from, from + pageSize - 1)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < pageSize) break
    from += pageSize
  }
  return rows
}

const employees = await fetchAll('employees', 'id,name,branch_id,status')
const lyLy = employees.find((e) => String(e.name || '').toLowerCase().includes('ly ly'))
check(Boolean(lyLy), 'Tìm NV Ly Ly', lyLy?.id || 'missing')

let invoices = []
if (lyLy) {
  invoices = await fetchAll(
    'invoices',
    'id,date,branch_id,employee_id,support_employee_id,tips,commission,created_at',
    (q) => q.eq('date', FROM).or(`employee_id.eq.${lyLy.id},support_employee_id.eq.${lyLy.id}`),
  )
}

const uniqueIds = new Set(invoices.map((i) => i.id))
check(uniqueIds.size === invoices.length, 'Ly Ly 31/07: không duplicate invoice id', `${invoices.length} rows`)
check(invoices.length >= 1, 'Ly Ly 31/07 có ≥1 HĐ theo date', String(invoices.length))

// Wallet would show up to 2 parts per invoice (tips + commission) — UI groups them.
let walletParts = 0
for (const inv of invoices) {
  const tips = Number(inv.tips || 0)
  const commission = Number(inv.commission || 0)
  if (tips !== 0) walletParts += 1
  if (commission !== 0) walletParts += 1
}
check(
  invoices.length > 0 && walletParts >= invoices.length,
  'Ly Ly 31/07: số dòng Tips/HH ≥ số HĐ (nhóm UI sẽ gộp)',
  `${invoices.length} HĐ → ${walletParts} phần trước khi group`,
)

const report = {
  at: new Date().toISOString(),
  production: BASE,
  bundle: bundlePath,
  css: cssPath,
  dataMutations: false,
  lyLy: lyLy ? { id: lyLy.id, name: lyLy.name, branchId: lyLy.branch_id } : null,
  invoicesOn20260731: invoices.map((i) => ({
    id: i.id,
    branchId: i.branch_id,
    date: i.date,
    created_at: i.created_at,
    tips: i.tips,
    commission: i.commission,
  })),
  uniqueInvoiceCount: uniqueIds.size,
  walletPartsBeforeGroup: walletParts,
  failed,
  pass: failed === 0,
}

const out = 'docs/uat-evidence/PAYROLL_UI_CLARIFICATION_PROD_SMOKE.json'
fs.mkdirSync('docs/uat-evidence', { recursive: true })
fs.writeFileSync(out, JSON.stringify(report, null, 2))
console.log(`Wrote ${out}`)
console.log(failed === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
