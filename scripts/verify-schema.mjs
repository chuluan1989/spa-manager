/**
 * Kiểm tra schema Supabase vs code — báo thiếu cột, truy vấn lỗi, đối chiếu Dashboard/Báo cáo.
 *
 * Chạy: npx vite-node scripts/verify-schema.mjs
 * Cần VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY trong .env.local
 */
import assert from 'node:assert/strict'

const { isSupabaseConfigured, supabase } = await import('../src/lib/supabaseClient.js')
const { fetchExpenses, fetchExpensesFiltered } = await import('../src/repositories/expensesRepository.js')
const { fetchInvoicesFiltered } = await import('../src/repositories/invoicesRepository.js')
const { buildDrillDownSummary } = await import('../src/utils/drillDownReport.js')
const { computeReportData } = await import('../src/utils/report.js')
const { getMonthStartDate, getTodayDate } = await import('../src/utils/invoiceStorage.js')

let passed = 0
let failed = 0
const issues = []

function ok(name) {
  passed += 1
  console.log(`  ✓ ${name}`)
}

function fail(name, error) {
  failed += 1
  const message = error?.message ?? String(error)
  issues.push({ name, message })
  console.error(`  ✗ ${name}`)
  console.error(`    ${message}`)
}

async function checkColumn(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1)
  if (error) throw error
}

const TABLE_COLUMNS = {
  branches: ['id', 'name', 'status', 'price_group_id', 'support_enabled', 'updated_at'],
  employees: ['id', 'name', 'branch_id', 'phone', 'status', 'updated_at'],
  services: ['id', 'name', 'is_active', 'updated_at'],
  branch_pricing: ['id', 'updated_at'],
  invoices: [
    'id', 'date', 'branch_id', 'employee_id', 'customer_name', 'customer_phone',
    'note', 'services', 'tips', 'commission', 'updated_at',
  ],
  expenses: [
    'id', 'date', 'branch_id', 'expense_type', 'content', 'amount', 'entered_by', 'note', 'updated_at',
  ],
  app_settings: ['id', 'payload', 'updated_at'],
  app_permissions: ['id', 'payload', 'updated_at'],
  app_credentials: ['id', 'payload', 'updated_at'],
}

const EXPENSE_OPTIONAL_COLUMNS = ['expense_time', 'paid_by', 'receipt_image', 'entered_by_id']

const INVOICE_OPTIONAL_COLUMNS = [
  'customer_name', 'customer_phone', 'customer_requested', 'note', 'invoice_time', 'entered_by',
  'discount_type', 'discount_value', 'discount_amount',
]

console.log('\nSpa Manager — kiểm tra schema & luồng báo cáo\n')

if (!isSupabaseConfigured) {
  console.error('✗ Supabase chưa cấu hình — cần VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY\n')
  process.exit(1)
}

console.log('1. Kiểm tra cột bắt buộc từng bảng:')
for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
  for (const column of columns) {
    try {
      await checkColumn(table, column)
      ok(`${table}.${column}`)
    } catch (error) {
      fail(`${table}.${column}`, error)
    }
  }
}

console.log('\n2. Kiểm tra cột tuỳ chọn expenses (ERP):')
const missingExpenseOptional = []
for (const column of EXPENSE_OPTIONAL_COLUMNS) {
  try {
    await checkColumn('expenses', column)
    ok(`expenses.${column}`)
  } catch (error) {
    missingExpenseOptional.push(column)
    console.warn(`  ⚠ expenses.${column} — chưa có (app fallback core-only upsert)`)
  }
}

if (missingExpenseOptional.includes('expense_time')) {
  issues.push({
    name: 'migration',
    message: 'Chạy supabase/migrations/0009_add_expense_time.sql trên Supabase SQL Editor',
  })
}

console.log('\n3. Truy vấn Dashboard/Báo cáo (expenses + invoices):')
const fromDate = getMonthStartDate()
const toDate = getTodayDate()
let invoices = []
let expenses = []

try {
  invoices = await fetchInvoicesFiltered({ fromDate, toDate }) ?? []
  ok(`fetchInvoicesFiltered (${invoices.length} hóa đơn)`)
} catch (error) {
  fail('fetchInvoicesFiltered', error)
}

try {
  expenses = await fetchExpensesFiltered({ fromDate, toDate }) ?? []
  ok(`fetchExpensesFiltered (${expenses.length} chi phí) — không order expense_time`)
} catch (error) {
  fail('fetchExpensesFiltered', error)
}

try {
  await fetchExpenses()
  ok('fetchExpenses (toàn bộ)')
} catch (error) {
  fail('fetchExpenses', error)
}

console.log('\n4. Đối chiếu số liệu Dashboard vs Báo cáo:')
try {
  const drill = buildDrillDownSummary(invoices, expenses, { fromDate, toDate })
  const report = computeReportData(invoices, expenses, { fromDate, toDate })

  assert.equal(drill.ticketRevenue, report.summary.ticketRevenue, 'ticketRevenue')
  assert.equal(drill.expenses, report.summary.expenses, 'expenses')
  assert.equal(drill.commission, report.summary.commission, 'commission')
  assert.equal(drill.profit, report.summary.profit, 'profit')

  ok(`ticketRevenue khớp: ${drill.ticketRevenue}`)
  ok(`expenses khớp: ${drill.expenses}`)
  ok(`profit khớp: ${drill.profit} (= DT vé - HH - CP)`)
} catch (error) {
  fail('Dashboard vs Báo cáo', error)
}

console.log('\n5. Kiểm tra cột invoices tuỳ chọn:')
for (const column of INVOICE_OPTIONAL_COLUMNS) {
  try {
    await checkColumn('invoices', column)
    ok(`invoices.${column}`)
  } catch {
    console.warn(`  ⚠ invoices.${column} — chưa migrate`)
  }
}

console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)

if (issues.length > 0) {
  console.log('Vấn đề cần xử lý:')
  for (const item of issues) {
    console.log(`  • ${item.name}: ${item.message}`)
  }
  console.log('')
}

process.exit(failed > 0 ? 1 : 0)
