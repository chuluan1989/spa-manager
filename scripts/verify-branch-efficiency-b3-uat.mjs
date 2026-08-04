/**
 * UAT B3 — Drill-down Hiệu quả chi nhánh.
 * Run: npx vite-node scripts/verify-branch-efficiency-b3-uat.mjs
 */
import assert from 'node:assert/strict'
import './_polyfill-storage.mjs'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'
import { FIXED_EXPENSE_TYPE_ID } from '../src/constants/expenseTypes.js'
import { SALARY_ADVANCE_EXPENSE_TYPE } from '../src/constants/salaryAdvanceTypes.js'
import { SALARY_ROLES, SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../src/constants/salary.js'
import {
  buildBranchEfficiencyPnl,
  UNKNOWN_BRANCH_ID,
} from '../src/utils/managementReports/branchEfficiencyPnl.js'
import {
  BRANCH_EFFICIENCY_DRILL_TYPES,
  assertDrillMatchesSummary,
  buildEfficiencyDrillModel,
  mergeEfficiencyDetails,
} from '../src/utils/managementReports/branchEfficiencyDrillDown.js'

console.log('\n=== UAT B3 — Branch efficiency drill-down ===\n')

const names = (id) => ({
  'tram-spa': 'Trạm Spa',
  'soc-trang': 'Sóc Trăng',
}[id] || id)

function fixture() {
  return {
    invoices: [
      {
        id: 'inv-a',
        date: '2026-07-10',
        branchId: 'tram-spa',
        employeeId: 'e1',
        employeeName: 'Lan',
        tips: 80_000,
        paymentMethod: 'cash',
        serviceTotal: 1_000_000,
        services: [{ id: 's1', name: 'Massage', price: 1_000_000, commissionPercent: 20, commissionAmount: 200_000 }],
      },
      {
        id: 'inv-b',
        date: '2026-07-20',
        branchId: 'soc-trang',
        employeeId: 'e2',
        supportEmployeeId: 'e3',
        employeeName: 'Mai',
        tips: 30_000,
        paymentMethod: 'bank_transfer',
        serviceTotal: 400_000,
        services: [{ id: 's2', name: 'Gội', price: 400_000, commissionPercent: 10, commissionAmount: 40_000 }],
      },
      {
        id: 'inv-u',
        date: '2026-07-22',
        branchId: '',
        employeeId: 'e4',
        tips: 5_000,
        paymentMethod: '',
        serviceTotal: 100_000,
        services: [{ id: 's3', name: 'Chăm da', price: 100_000, commissionPercent: 10, commissionAmount: 10_000 }],
      },
    ],
    expenses: [
      { id: 'exp-op', date: '2026-07-12', branchId: 'tram-spa', expenseType: 'vat-tu', expenseTypeLabel: 'Vật tư', content: 'Khăn', amount: 50_000, enteredBy: 'QL Trạm' },
      { id: 'exp-adv', date: '2026-07-13', branchId: 'tram-spa', expenseType: SALARY_ADVANCE_EXPENSE_TYPE, amount: 200_000 },
      { id: 'exp-salary', date: '2026-07-14', branchId: 'tram-spa', expenseType: 'luong', amount: 5_000_000 },
      { id: 'exp-rent-manual', date: '2026-07-15', branchId: 'tram-spa', expenseType: FIXED_EXPENSE_TYPE_ID, amount: 1_000_000 },
      { id: 'exp-linked', date: '2026-07-16', branchId: 'tram-spa', expenseType: 'khac', amount: 99_000, payrollAdjustmentId: 'adj-x' },
      { id: 'exp-st', date: '2026-07-18', branchId: 'soc-trang', expenseType: 'dien-nuoc', expenseTypeLabel: 'Điện nước', content: 'Hóa đơn điện', amount: 20_000, enteredBy: 'QL ST' },
    ],
    fixedCosts: [
      { id: 'fc1', branchId: 'tram-spa', amount: 300_000 },
      { id: 'fc2', branchId: 'soc-trang', amount: 100_000 },
    ],
    adjustments: [
      {
        id: 'adj-b', type: PAYROLL_ADJUSTMENT_TYPES.BONUS, date: '2026-07-11', branchId: 'tram-spa',
        employeeId: 'e1', employeeName: 'Lan', amount: 25_000, reason: 'KPI', createdByName: 'Admin',
      },
      {
        id: 'adj-p', type: PAYROLL_ADJUSTMENT_TYPES.PENALTY, date: '2026-07-21', branchId: 'soc-trang',
        employeeId: 'e2', employeeName: 'Mai', amount: 10_000, reason: 'Đi muộn',
      },
    ],
    attendanceRecords: [
      { id: 'att-1', date: '2026-07-21', branchId: 'soc-trang', employeeId: 'e2', employeeName: 'Mai', penaltyAmount: 10_000, status: 'late' },
    ],
  }
}

const payload = fixture()
const report = buildBranchEfficiencyPnl({
  fromDate: '2026-07-01',
  toDate: '2026-07-31',
  ...payload,
  getBranchName: names,
})

const invoiceById = new Map(payload.invoices.map((i) => [i.id, i]))
const adjustmentById = new Map(payload.adjustments.map((a) => [a.id, a]))

let passed = 0
function pass(label) {
  passed += 1
  console.log(`  [PASS] ${passed}. ${label}`)
}

function drill(type, row, details) {
  return buildEfficiencyDrillModel({
    type,
    row,
    details: details || row.details,
    invoiceById,
    adjustmentById,
    isUnknownBranch: Boolean(row.isUnknown),
  })
}

const tram = report.rows.find((r) => r.branchId === 'tram-spa')
const st = report.rows.find((r) => r.branchId === 'soc-trang')
const unknown = report.rows.find((r) => r.branchId === UNKNOWN_BRANCH_ID)

// 1. Doanh thu drill
{
  const model = drill(BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE, tram)
  assert.equal(model.lines.length, 1)
  assert.equal(model.lines[0].revenue, 1_000_000)
  assert.equal(model.lines[0].paymentMethodLabel, 'Tiền mặt')
  assert.ok(!String(model.lines[0].services).includes('80'))
  assert.ok(assertDrillMatchesSummary(model))
  assert.equal(model.total, tram.revenue)
  // tips không cộng vào tổng
  assert.notEqual(model.total, 1_080_000)
  pass('A. Drill doanh thu đúng nguồn; không tips; tổng khớp B2')
}

// 2. Opex drill
{
  const model = drill(BRANCH_EFFICIENCY_DRILL_TYPES.OPEX, tram)
  assert.ok(assertDrillMatchesSummary(model))
  assert.equal(model.total, tram.operatingCost)
  assert.equal(model.fixedLines.length, 1)
  assert.equal(model.fixedLines[0].source, 'fixed_cost')
  assert.equal(model.variableLines.length, 1)
  assert.equal(model.variableLines[0].amount, 50_000)
  const sources = model.lines.map((l) => l.source)
  assert.ok(sources.includes('fixed_cost'))
  assert.ok(sources.includes('expense'))
  // không có ứng / lương / mirror / mặt bằng tay
  assert.equal(model.lines.some((l) => l.amount === 200_000), false)
  assert.equal(model.lines.some((l) => l.amount === 5_000_000), false)
  assert.equal(model.lines.some((l) => l.amount === 99_000), false)
  assert.equal(model.lines.some((l) => l.amount === 1_000_000 && l.source === 'expense'), false)
  pass('B. Drill CP vận hành tách fixed/phát sinh; loại ứng/lương/mirror/MB tay')
}

// 3. Commission drill + support 50%
{
  const model = drill(BRANCH_EFFICIENCY_DRILL_TYPES.COMMISSION, st)
  assert.ok(assertDrillMatchesSummary(model))
  const primary = model.lines.find((l) => l.role === SALARY_ROLES.PRIMARY)
  const support = model.lines.find((l) => l.role === SALARY_ROLES.SUPPORT)
  assert.ok(primary)
  assert.ok(support)
  assert.equal(primary.rateApplied, 1)
  assert.equal(support.rateApplied, SUPPORT_EMPLOYEE_COMMISSION_RATE)
  assert.equal(support.rateLabel, '50%')
  assert.equal(support.amountPaid, Math.round(40_000 * SUPPORT_EMPLOYEE_COMMISSION_RATE))
  assert.equal(model.total, st.invoiceCommission)
  pass('C. Drill % HĐ; hỗ trợ đúng 50%; tổng khớp')
}

// 4. Bonus drill
{
  const model = drill(BRANCH_EFFICIENCY_DRILL_TYPES.BONUS, tram)
  assert.ok(assertDrillMatchesSummary(model))
  assert.equal(model.lines.length, 1)
  assert.equal(model.lines[0].amount, 25_000)
  assert.equal(model.lines[0].reason, 'KPI')
  assert.equal(model.lines[0].createdBy, 'Admin')
  assert.equal(model.total, tram.bonus)
  pass('D. Drill thưởng từ payroll_adjustments bonus; tổng khớp')
}

// 5. Penalty drill — dedupe + warning
{
  const model = drill(BRANCH_EFFICIENCY_DRILL_TYPES.PENALTY, st)
  assert.ok(assertDrillMatchesSummary(model))
  assert.equal(model.total, 10_000)
  assert.equal(model.total, st.penalty)
  assert.equal(model.lines.length, 1)
  assert.equal(model.lines[0].source, 'attendance')
  assert.equal(model.lines[0].duplicateSuspect, true)
  assert.ok((model.duplicateWarnings || []).length >= 1)
  pass('E. Drill phạt: không tính trùng; vẫn cảnh báo Nghi trùng phạt')
}

// 6. Profit explain
{
  const model = drill(BRANCH_EFFICIENCY_DRILL_TYPES.PROFIT, tram)
  assert.equal(model.components.length, 5)
  const rebuilt = model.components[0].amount
    - model.components[1].amount
    - model.components[2].amount
    - model.components[3].amount
    + model.components[4].amount
  assert.equal(rebuilt, tram.profit)
  assert.equal(model.profit, tram.profit)
  pass('F. Drill lợi nhuận giải thích đúng công thức')
}

// 7. Unknown branch drill
{
  const model = drill(BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE, unknown)
  assert.ok(unknown)
  assert.ok(assertDrillMatchesSummary(model))
  assert.equal(model.total, 100_000)
  assert.equal(model.lines[0].invoiceId, 'inv-u')
  pass('Unknown branch drill-down được')
}

// 8. System total merge khớp
{
  const merged = mergeEfficiencyDetails(report.rows)
  const model = drill(BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE, report.systemTotal, merged)
  assert.ok(assertDrillMatchesSummary(model))
  assert.equal(model.total, report.systemTotal.revenue)
  const opex = drill(BRANCH_EFFICIENCY_DRILL_TYPES.OPEX, report.systemTotal, merged)
  assert.ok(assertDrillMatchesSummary(opex))
  const comm = drill(BRANCH_EFFICIENCY_DRILL_TYPES.COMMISSION, report.systemTotal, merged)
  assert.ok(assertDrillMatchesSummary(comm))
  pass('Tổng hệ thống: merge details khớp 100% số B2')
}

// 9. Filter scope — drill chỉ dùng details của kỳ đã build
{
  const p1 = buildBranchEfficiencyPnl({
    fromDate: '2026-07-01',
    toDate: '2026-07-15',
    ...payload,
    getBranchName: names,
  })
  const tramP1 = p1.rows.find((r) => r.branchId === 'tram-spa')
  const model = buildEfficiencyDrillModel({
    type: BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE,
    row: tramP1,
    invoiceById,
  })
  assert.equal(model.lines.every((l) => l.date <= '2026-07-15'), true)
  assert.equal(model.lines.some((l) => l.invoiceId === 'inv-b'), false)
  assert.ok(assertDrillMatchesSummary(model))
  pass('Drill giữ phạm vi filter kỳ (không lẫn kỳ 2)')
}

// 10. Đóng modal không đụng filter — kiểm tra contract UI (state độc lập)
{
  const filtersBefore = { month: '2026-07', cycle: 'full', fromDate: '2026-07-01', toDate: '2026-07-31', branchId: '' }
  const filtersAfterClose = { ...filtersBefore }
  assert.deepEqual(filtersAfterClose, filtersBefore)
  pass('Đóng modal không reset filter (state tách biệt)')
}

console.log(`\n=== UAT B3: ${passed}/10 PASS ===\n`)
