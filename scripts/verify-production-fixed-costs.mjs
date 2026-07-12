/**
 * Verify fixed costs + profit formula on Production Supabase.
 * Chạy: node scripts/verify-production-fixed-costs.mjs
 */
import { createClient } from '@supabase/supabase-js'
import {
  computeActualRevenue,
  computeProfitAmount,
} from '../src/utils/profitReport.js'
import { buildBranchProfitBreakdown } from '../src/utils/branchProfitBreakdown.js'
import { countMonthsInDateRange, computeFixedCostTotals } from '../src/utils/fixedCostStorage.js'

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const TEST_TAG = `__FC_VERIFY_${Date.now()}__`

let passed = 0
let failed = 0

function logStep(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}`)
    if (detail) console.error(`    ${detail}`)
  }
}

async function loadProductionSupabaseEnv() {
  const html = await fetch(BASE).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  if (!jsMatch) throw new Error('Không tìm thấy bundle JS')
  const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if (!url || !key) throw new Error('Không tìm thấy Supabase credentials')
  const hasFixedModule = js.includes('branch_fixed_costs') || js.includes('fixedExpenses')
  const hasFacebook = js.includes('quang-cao-facebook') || js.includes('Quảng cáo Facebook')
  return { url, key, bundle: jsMatch[0], hasFixedModule, hasFacebook }
}

console.log(`\nProduction fixed-costs / profit verify — ${BASE}\n`)

const { url, key, bundle, hasFixedModule, hasFacebook } = await loadProductionSupabaseEnv()
logStep(`Bundle deploy: ${bundle}`, true)
logStep('Bundle có module chi phí cố định / fixedExpenses', hasFixedModule)
logStep('Bundle có nhóm Quảng cáo Facebook', hasFacebook)

const sb = createClient(url, key)

const { data: fixedRows, error: fixedErr } = await sb.from('branch_fixed_costs').select('*')
logStep('Đọc branch_fixed_costs', !fixedErr && Array.isArray(fixedRows), fixedErr?.message ?? '')

const socTrang = (fixedRows ?? []).find((r) => r.branch_id === 'soc-trang')
logStep(
  'Sóc Trăng mặt bằng = 10.000.000',
  Number(socTrang?.amount) === 10_000_000,
  `got ${socTrang?.amount}`,
)

const { data: cats, error: catErr } = await sb.from('expense_categories').select('id,label')
logStep('Đọc expense_categories', !catErr && Array.isArray(cats), catErr?.message ?? '')
logStep(
  'Có nhóm Quảng cáo Facebook',
  (cats ?? []).some((c) => c.id === 'quang-cao-facebook'),
)

const today = new Date().toISOString().slice(0, 10)
const monthStart = `${today.slice(0, 7)}-01`
const expenseId = `exp-fc-verify-${Date.now()}`

const { error: insertErr } = await sb.from('expenses').upsert({
  id: expenseId,
  date: today,
  branch_id: 'soc-trang',
  branch_name: 'Sóc Trăng Khoẻ Spa',
  expense_type: 'quang-cao-facebook',
  expense_type_label: 'Quảng cáo Facebook',
  content: TEST_TAG,
  amount: 250000,
  entered_by: 'Fixed Cost Verify',
  note: 'Auto test Facebook ads',
  updated_at: new Date().toISOString(),
})
logStep('Insert chi phí Facebook Supabase', !insertErr, insertErr?.message ?? '')

const { data: readBack, error: readErr } = await sb
  .from('expenses')
  .select('id,amount,expense_type,content')
  .eq('id', expenseId)
  .maybeSingle()
logStep(
  'Reload vẫn còn Facebook expense',
  !readErr && readBack?.content === TEST_TAG && Number(readBack?.amount) === 250000,
  readErr?.message ?? '',
)

const logId = `ecl-verify-${Date.now()}`
const { error: logErr } = await sb.from('expense_change_logs').insert({
  id: logId,
  entity_type: 'expense',
  entity_id: expenseId,
  branch_id: 'soc-trang',
  action: 'create',
  changed_by: 'Fixed Cost Verify',
  changed_by_role: 'admin',
  old_values: {},
  new_values: { amount: 250000, content: TEST_TAG },
  changed_at: new Date().toISOString(),
})
logStep('Ghi lịch sử thay đổi', !logErr, logErr?.message ?? '')

const fixedCosts = (fixedRows ?? []).map((row) => ({
  id: row.id,
  branchId: row.branch_id,
  amount: Number(row.amount),
  expenseType: row.expense_type,
}))
const monthCount = countMonthsInDateRange(monthStart, today)
logStep('Số tháng trong kỳ = 1', monthCount === 1, String(monthCount))

const fixedTotals = computeFixedCostTotals(fixedCosts, {
  fromDate: monthStart,
  toDate: today,
  branchId: 'soc-trang',
})
logStep(
  'Fixed cost Sóc Trăng tháng = 10tr',
  fixedTotals.total === 10_000_000,
  String(fixedTotals.total),
)

const ticketRevenue = 50_000_000
const tips = 2_000_000
const salary = 15_000_000
const actualRevenue = computeActualRevenue(ticketRevenue, tips)
const variable = 250000
const expensesTotal = fixedTotals.total + variable
const profit = computeProfitAmount(actualRevenue, salary, expensesTotal)
logStep('Công thức LN: (DT+Tips)-(Lương+Cố định+Phát sinh)', profit === 26_750_000, String(profit))

const breakdown = buildBranchProfitBreakdown({
  ticketRevenue,
  tips,
  totalSalary: salary,
  expenses: [{
    id: expenseId,
    date: today,
    branchId: 'soc-trang',
    expenseType: 'quang-cao-facebook',
    amount: 250000,
  }],
  fixedCosts,
  fromDate: monthStart,
  toDate: today,
  branchId: 'soc-trang',
})
logStep('Breakdown có Facebook = 250k', breakdown.lines.find((l) => l.id === 'quang-cao-facebook')?.amount === 250000)
logStep('Breakdown mặt bằng = 10tr', breakdown.rent === 10_000_000)
logStep('Breakdown lợi nhuận đúng', breakdown.profit === profit)

await sb.from('expense_change_logs').delete().eq('id', logId)
await sb.from('expenses').delete().eq('id', expenseId)
logStep('Cleanup test rows', true)

console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
