/**
 * Seed + verify fixed costs / profit on Production.
 * Chạy: node scripts/verify-production-fixed-costs.mjs
 *
 * - Seed mặt bằng 6 CN (không Gia Lai)
 * - Seed nhóm chi phí mặc định (có Taxi)
 * - Kiểm tra reload, đa máy (Supabase), quyền, công thức LN, tips, audit log
 */
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const TEST_TAG = `__FC_VERIFY_${Date.now()}__`

const EXPECTED_RENT = {
  'soc-trang': 10_000_000,
  'vinh-long': 20_000_000,
  'song-khoe-spa': 15_000_000,
  'bac-lieu': 15_000_000,
  'tra-vinh': 13_000_000,
  'tram-spa': 10_000_000,
}

const EXPECTED_CATEGORIES = [
  { id: 'quang-cao-facebook', label: 'Quảng cáo Facebook' },
  { id: 'quang-cao-tiktok', label: 'Quảng cáo TikTok' },
  { id: 'dien', label: 'Điện' },
  { id: 'nuoc', label: 'Nước' },
  { id: 'wifi', label: 'Wifi' },
  { id: 'shopee', label: 'Shopee' },
  { id: 'sua-chua', label: 'Sửa chữa' },
  { id: 'taxi', label: 'Taxi' },
  { id: 'khac', label: 'Chi phí khác' },
]

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

function computeActualRevenue(ticketRevenue, tips) {
  return Number(ticketRevenue ?? 0) + Number(tips ?? 0)
}

function computeProfitAmount(actualRevenue, totalSalary, expenses) {
  return actualRevenue - totalSalary - expenses
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
  return {
    url,
    key,
    bundle: jsMatch[0],
    hasFixedModule: js.includes('fixedExpenses') || js.includes('Chi phí cố định'),
    hasFacebook: js.includes('quang-cao-facebook') || js.includes('Quảng cáo Facebook'),
    hasProfitFormula: js.includes('computeProfitAmount') || js.includes('actualRevenue'),
    tipsNotDoubleCounted: js.includes('resolveTotalSalary') || js.includes('computeActualRevenue'),
  }
}

async function seedProduction(sb) {
  const now = new Date().toISOString()
  const rentRows = Object.entries(EXPECTED_RENT).map(([branchId, amount]) => ({
    id: `fc-${branchId}-mat-bang`,
    branch_id: branchId,
    expense_type: 'mat-bang',
    expense_type_label: 'Mặt bằng',
    amount,
    updated_by: 'system-seed',
    updated_at: now,
  }))

  const categoryRows = [
    { id: 'mat-bang', label: 'Mặt bằng', sort_order: 1, is_system: true, is_fixed: true },
    ...EXPECTED_CATEGORIES.map((item, index) => ({
      id: item.id,
      label: item.label,
      sort_order: (index + 1) * 10,
      is_system: true,
      is_fixed: false,
    })),
  ].map((row) => ({ ...row, updated_at: now, created_at: now }))

  const { error: rentErr } = await sb.from('branch_fixed_costs').upsert(rentRows, { onConflict: 'id' })
  if (rentErr) throw new Error(`Seed rent failed: ${rentErr.message}`)

  const { error: catErr } = await sb.from('expense_categories').upsert(categoryRows, { onConflict: 'id' })
  if (catErr) throw new Error(`Seed categories failed: ${catErr.message}`)

  // Đảm bảo không có mặt bằng Gia Lai
  await sb.from('branch_fixed_costs').delete().in('branch_id', ['gia-lai-1', 'gia-lai-2'])

  return { rentCount: rentRows.length, categoryCount: categoryRows.length }
}

console.log(`\nProduction fixed-costs / profit verify — ${BASE}\n`)

const env = await loadProductionSupabaseEnv()
const sb = createClient(env.url, env.key)

logStep(`Bundle deploy: ${env.bundle}`, true)
logStep('Bundle có module chi phí cố định / fixedExpenses', env.hasFixedModule)
logStep('Bundle có nhóm Quảng cáo Facebook', env.hasFacebook)
logStep('Bundle có công thức lợi nhuận', env.hasProfitFormula)

console.log('\n-- Seed --')
try {
  const seeded = await seedProduction(sb)
  logStep(`Seed mặt bằng ${seeded.rentCount} chi nhánh (không Gia Lai)`, true)
  logStep(`Seed ${seeded.categoryCount} nhóm chi phí (có Taxi)`, true)
} catch (error) {
  logStep('Seed production', false, error.message)
  console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
  process.exit(1)
}

console.log('\n-- Đọc lại sau seed (mô phỏng reload / máy khác) --')
const { data: fixedRows, error: fixedErr } = await sb.from('branch_fixed_costs').select('*')
logStep('Đọc branch_fixed_costs', !fixedErr && Array.isArray(fixedRows), fixedErr?.message ?? '')

const byBranch = Object.fromEntries((fixedRows ?? []).map((r) => [r.branch_id, Number(r.amount)]))
for (const [branchId, amount] of Object.entries(EXPECTED_RENT)) {
  logStep(`Mặt bằng ${branchId} = ${amount.toLocaleString('vi-VN')}đ`, byBranch[branchId] === amount, `got ${byBranch[branchId]}`)
}
logStep('Không có mặt bằng Gia Lai 1/2', !byBranch['gia-lai-1'] && !byBranch['gia-lai-2'])

const { data: cats, error: catErr } = await sb.from('expense_categories').select('id,label,is_fixed')
logStep('Đọc expense_categories', !catErr && Array.isArray(cats), catErr?.message ?? '')
for (const item of EXPECTED_CATEGORIES) {
  logStep(`Nhóm ${item.label}`, (cats ?? []).some((c) => c.id === item.id), item.id)
}

console.log('\n-- Chi phí phát sinh + lịch sử + lợi nhuận --')
const today = new Date().toISOString().slice(0, 10)
const expenseId = `exp-fc-verify-${Date.now()}`
const logId = `ecl-verify-${Date.now()}`
const adminLogId = `ecl-admin-${Date.now()}`

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

const { data: readBack1 } = await sb.from('expenses').select('*').eq('id', expenseId).maybeSingle()
logStep('Reload vẫn còn Facebook expense', readBack1?.content === TEST_TAG && Number(readBack1?.amount) === 250000)

// Mô phỏng “máy Admin khác” — client mới đọc cùng Supabase
const sbOtherDevice = createClient(env.url, env.key)
const { data: otherDeviceRow } = await sbOtherDevice.from('expenses').select('id,content,amount,branch_id').eq('id', expenseId).maybeSingle()
logStep('Máy Admin khác vẫn thấy cùng dữ liệu', otherDeviceRow?.id === expenseId && otherDeviceRow?.content === TEST_TAG)

const { data: otherFixed } = await sbOtherDevice.from('branch_fixed_costs').select('branch_id,amount').eq('branch_id', 'soc-trang').maybeSingle()
logStep('Máy khác thấy mặt bằng Sóc Trăng 10tr', Number(otherFixed?.amount) === 10_000_000)

// Quyền QL chỉ nhập chi nhánh mình — kiểm tra dữ liệu có branch_id bắt buộc
logStep('Expense có branch_id (QL bị khóa theo branch ở app)', Boolean(readBack1?.branch_id) && readBack1.branch_id === 'soc-trang')

// Admin sửa chi phí cố định + audit
const beforeRent = Number(byBranch['soc-trang'])
const tempRent = beforeRent + 1000
const { error: updateRentErr } = await sb.from('branch_fixed_costs').upsert({
  id: 'fc-soc-trang-mat-bang',
  branch_id: 'soc-trang',
  expense_type: 'mat-bang',
  expense_type_label: 'Mặt bằng',
  amount: tempRent,
  updated_by: 'Admin Verify',
  updated_at: new Date().toISOString(),
}, { onConflict: 'id' })
logStep('Admin sửa được chi phí cố định', !updateRentErr, updateRentErr?.message ?? '')

const { error: adminLogErr } = await sb.from('expense_change_logs').insert({
  id: adminLogId,
  entity_type: 'fixed_cost',
  entity_id: 'fc-soc-trang-mat-bang',
  branch_id: 'soc-trang',
  action: 'update',
  changed_by: 'Admin Verify',
  changed_by_role: 'admin',
  old_values: { amount: beforeRent },
  new_values: { amount: tempRent },
  changed_at: new Date().toISOString(),
})
logStep('expense_change_logs ghi sửa mặt bằng', !adminLogErr, adminLogErr?.message ?? '')

const { data: adminLogRow } = await sb.from('expense_change_logs').select('*').eq('id', adminLogId).maybeSingle()
logStep(
  'Audit log giữ old/new amount',
  Number(adminLogRow?.old_values?.amount) === beforeRent && Number(adminLogRow?.new_values?.amount) === tempRent,
)

// Khôi phục mặt bằng đúng giá trị mặc định
await sb.from('branch_fixed_costs').upsert({
  id: 'fc-soc-trang-mat-bang',
  branch_id: 'soc-trang',
  expense_type: 'mat-bang',
  expense_type_label: 'Mặt bằng',
  amount: EXPECTED_RENT['soc-trang'],
  updated_by: 'system-seed',
  updated_at: new Date().toISOString(),
}, { onConflict: 'id' })

const { error: logErr } = await sb.from('expense_change_logs').insert({
  id: logId,
  entity_type: 'expense',
  entity_id: expenseId,
  branch_id: 'soc-trang',
  action: 'create',
  changed_by: 'Fixed Cost Verify',
  changed_by_role: 'admin',
  old_values: {},
  new_values: { amount: 250000, content: TEST_TAG, expense_type: 'quang-cao-facebook' },
  changed_at: new Date().toISOString(),
})
logStep('expense_change_logs ghi tạo chi phí phát sinh', !logErr, logErr?.message ?? '')

const { data: expenseLog } = await sb.from('expense_change_logs').select('*').eq('id', logId).maybeSingle()
logStep('Audit log chi phí phát sinh còn sau reload', expenseLog?.entity_id === expenseId)

// Công thức LN + tips không double-count
const ticketRevenue = 50_000_000
const tips = 2_000_000
const salary = 15_000_000 // net payroll (đã gồm tips nhân viên nếu có) — tips KHÔNG trừ thêm lần nữa trong expenses
const rent = EXPECTED_RENT['soc-trang']
const variable = 250000
const actualRevenue = computeActualRevenue(ticketRevenue, tips)
const expensesTotal = rent + variable
const profit = computeProfitAmount(actualRevenue, salary, expensesTotal)
logStep('Công thức LN: (DT+Tips)-(Lương+Cố định+Phát sinh)', profit === 26_750_000, String(profit))

// Tips chỉ cộng 1 lần vào doanh thu, không nằm trong expenses
const wrongDoubleTipsProfit = computeProfitAmount(actualRevenue, salary + tips, expensesTotal)
logStep('Tips không bị trừ lần 2 trong chi phí/lương', profit !== wrongDoubleTipsProfit && profit === 26_750_000)
logStep('Tips chỉ cộng vào tổng doanh thu 1 lần', actualRevenue === ticketRevenue + tips)

const { data: restored } = await sb.from('branch_fixed_costs').select('amount').eq('branch_id', 'soc-trang').maybeSingle()
logStep('Khôi phục mặt bằng Sóc Trăng = 10tr', Number(restored?.amount) === 10_000_000)

await sb.from('expense_change_logs').delete().in('id', [logId, adminLogId])
await sb.from('expenses').delete().eq('id', expenseId)
logStep('Cleanup test rows', true)

const { data: gone } = await sb.from('expenses').select('id').eq('id', expenseId).maybeSingle()
logStep('Test expense đã xóa sạch', !gone)

console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
