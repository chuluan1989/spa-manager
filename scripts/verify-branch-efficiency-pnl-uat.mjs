/**
 * UAT B1 — Engine Báo cáo Hiệu quả chi nhánh (branchEfficiencyPnl).
 * Run: npx vite-node scripts/verify-branch-efficiency-pnl-uat.mjs
 */
import assert from 'node:assert/strict'
import './_polyfill-storage.mjs'
import { SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../src/constants/salary.js'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'
import {
  UNKNOWN_BRANCH_ID,
  UNKNOWN_BRANCH_LABEL,
  BRANCH_EFFICIENCY_PNL_FORMULA,
  allocateInvoiceCommissionPaid,
  buildBranchEfficiencyPnl,
  buildPenaltyPnlItems,
  computeBranchEfficiencyProfit,
  isPnlOperatingExpense,
} from '../src/utils/managementReports/branchEfficiencyPnl.js'

console.log('\n=== UAT B1 — Branch efficiency P&L engine ===\n')

const names = (id) => ({
  'tram-spa': 'Trạm Spa',
  'soc-trang': 'Sóc Trăng',
  'song-khoe-spa': 'Sống Khoẻ',
}[id] || id)

// --- Fixture công thức đơn giản ---
{
  const profit = computeBranchEfficiencyProfit({
    revenue: 1_000_000,
    operatingCost: 200_000,
    invoiceCommission: 100_000,
    bonus: 50_000,
    penalty: 20_000,
  })
  // 1_000_000 - 200_000 - 100_000 - 50_000 + 20_000 = 670_000
  assert.equal(profit, 670_000)
  assert.match(BRANCH_EFFICIENCY_PNL_FORMULA, /Doanh thu dịch vụ/)
  assert.match(BRANCH_EFFICIENCY_PNL_FORMULA, /Phạt nhân viên/)
  console.log('  [PASS] 1. Công thức LN = DT − CP − %HĐ − Thưởng + Phạt')
}

// --- Doanh thu: không tips, theo serving branch ---
{
  const invoices = [
    {
      id: 'inv-1',
      date: '2026-07-20',
      branchId: 'tram-spa',
      employeeId: 'ly-ly', // home soc-trang nhưng serving tram
      tips: 50_000,
      serviceTotal: 500_000,
      services: [{ id: 's1', price: 500_000, commissionPercent: 20, commissionAmount: 100_000 }],
    },
    {
      id: 'inv-2',
      date: '2026-07-21',
      branchId: 'soc-trang',
      employeeId: 'a',
      tips: 10_000,
      serviceTotal: 200_000,
      services: [{ id: 's2', price: 200_000, commissionPercent: 10, commissionAmount: 20_000 }],
    },
  ]
  const result = buildBranchEfficiencyPnl({
    fromDate: '2026-07-16',
    toDate: '2026-07-31',
    invoices,
    expenses: [],
    fixedCosts: [],
    adjustments: [],
    attendanceRecords: [],
    getBranchName: names,
  })
  const tram = result.rows.find((r) => r.branchId === 'tram-spa')
  const st = result.rows.find((r) => r.branchId === 'soc-trang')
  assert.equal(tram.revenue, 500_000)
  assert.equal(st.revenue, 200_000)
  assert.equal(result.systemTotal.revenue, 700_000)
  // tips không vào DT
  assert.ok(tram.details.revenueLines[0].tipsExcluded === 50_000)
  console.log('  [PASS] 2. DT theo serving branch; không gồm tips')
}

// --- % HĐ: chính + hỗ trợ = 100% + 50% snapshot ---
{
  const invoice = {
    id: 'inv-cross',
    date: '2026-07-18',
    branchId: 'tram-spa',
    employeeId: 'primary-st',
    supportEmployeeId: 'support-tram',
    tips: 0,
    serviceTotal: 400_000,
    services: [{ id: 's', price: 400_000, commissionPercent: 25, commissionAmount: 100_000 }],
  }
  const lines = allocateInvoiceCommissionPaid(invoice)
  assert.equal(lines.length, 2)
  assert.equal(lines[0].amountPaid, 100_000)
  assert.equal(lines[1].amountPaid, Math.round(100_000 * SUPPORT_EMPLOYEE_COMMISSION_RATE))
  assert.equal(lines[1].role, 'support')

  const result = buildBranchEfficiencyPnl({
    fromDate: '2026-07-16',
    toDate: '2026-07-31',
    invoices: [invoice],
    expenses: [],
    fixedCosts: [],
    adjustments: [],
    attendanceRecords: [],
    getBranchName: names,
  })
  const tram = result.rows.find((r) => r.branchId === 'tram-spa')
  assert.equal(tram.invoiceCommission, 100_000 + 50_000)
  assert.equal(tram.revenue, 400_000)
  // %HĐ thuộc serving tram, không soc-trang
  assert.equal(result.rows.some((r) => r.branchId === 'soc-trang'), false)
  console.log('  [PASS] 3. %HĐ thực trả = chính + hỗ trợ×rate; theo serving')
}

// --- OpEx: loại ung-luong, luong, mat-bang tay, linked; lấy fixed ---
{
  assert.equal(isPnlOperatingExpense({ expenseType: 'dien', amount: 1 }), true)
  assert.equal(isPnlOperatingExpense({ expenseType: 'ung-luong', amount: 1 }), false)
  assert.equal(isPnlOperatingExpense({ expenseType: 'luong', amount: 1 }), false)
  assert.equal(isPnlOperatingExpense({ expenseType: 'mat-bang', amount: 1 }), false)
  assert.equal(isPnlOperatingExpense({
    expenseType: 'dien',
    payrollAdjustmentId: 'adj-1',
    amount: 1,
  }), false)

  const result = buildBranchEfficiencyPnl({
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    invoices: [],
    expenses: [
      { id: 'e1', date: '2026-07-05', branchId: 'tram-spa', expenseType: 'dien', amount: 30_000 },
      { id: 'e2', date: '2026-07-05', branchId: 'tram-spa', expenseType: 'ung-luong', amount: 99_000 },
      { id: 'e3', date: '2026-07-05', branchId: 'tram-spa', expenseType: 'luong', amount: 88_000 },
      { id: 'e4', date: '2026-07-05', branchId: 'tram-spa', expenseType: 'mat-bang', amount: 10_000_000 },
      {
        id: 'e5',
        date: '2026-07-05',
        branchId: 'tram-spa',
        expenseType: 'khac',
        amount: 15_000,
        payrollAdjustmentId: 'bonus-mirror',
      },
    ],
    fixedCosts: [
      { id: 'fc-tram', branchId: 'tram-spa', expenseType: 'mat-bang', amount: 10_000_000 },
    ],
    adjustments: [],
    attendanceRecords: [],
    getBranchName: names,
  })
  const tram = result.rows.find((r) => r.branchId === 'tram-spa')
  assert.equal(tram.operatingCostVariable, 30_000)
  assert.equal(tram.operatingCostFixed, 10_000_000)
  assert.equal(tram.operatingCost, 10_030_000)
  console.log('  [PASS] 4. OpEx = fixed + biến động hợp lệ; loại ứng/lương/mat-bang tay/linked')
}

// --- Thưởng trừ LN ---
{
  const result = buildBranchEfficiencyPnl({
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    invoices: [{
      id: 'i',
      date: '2026-07-10',
      branchId: 'soc-trang',
      employeeId: 'e1',
      serviceTotal: 100_000,
      services: [{ price: 100_000, commissionAmount: 0, commissionPercent: 0 }],
    }],
    expenses: [],
    fixedCosts: [],
    adjustments: [
      {
        id: 'b1',
        type: PAYROLL_ADJUSTMENT_TYPES.BONUS,
        date: '2026-07-12',
        branchId: 'soc-trang',
        employeeId: 'e1',
        amount: 25_000,
        reason: 'Thưởng nóng',
      },
    ],
    attendanceRecords: [],
    getBranchName: names,
  })
  const st = result.rows.find((r) => r.branchId === 'soc-trang')
  assert.equal(st.bonus, 25_000)
  assert.equal(st.profit, 100_000 - 0 - 0 - 25_000 + 0)
  console.log('  [PASS] 5. Thưởng từ adjustments.bonus; trừ LN')
}

// --- Phạt A: dedupe employeeId+date+amount ---
{
  const pool = buildPenaltyPnlItems({
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    attendanceRecords: [
      {
        id: 'att-1',
        employeeId: 'e1',
        branchId: 'tram-spa',
        date: '2026-07-08',
        penaltyAmount: 20_000,
        status: 'late',
      },
    ],
    adjustments: [
      {
        id: 'pen-1',
        type: PAYROLL_ADJUSTMENT_TYPES.PENALTY,
        employeeId: 'e1',
        branchId: 'tram-spa',
        date: '2026-07-08',
        amount: 20_000,
        reason: 'Đi trễ',
      },
      {
        id: 'pen-2',
        type: PAYROLL_ADJUSTMENT_TYPES.PENALTY,
        employeeId: 'e1',
        branchId: 'tram-spa',
        date: '2026-07-09',
        amount: 50_000,
        reason: 'Phạt tay',
      },
    ],
  })
  assert.equal(pool.total, 20_000 + 50_000)
  assert.equal(pool.duplicateWarnings.length, 1)
  assert.equal(pool.duplicateWarnings[0].label, 'Nghi trùng phạt')
  assert.equal(pool.items.filter((i) => i.source === 'adjustment').length, 1)

  const result = buildBranchEfficiencyPnl({
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    invoices: [],
    expenses: [],
    fixedCosts: [],
    adjustments: [
      {
        id: 'pen-1',
        type: PAYROLL_ADJUSTMENT_TYPES.PENALTY,
        employeeId: 'e1',
        branchId: 'tram-spa',
        date: '2026-07-08',
        amount: 20_000,
      },
      {
        id: 'pen-2',
        type: PAYROLL_ADJUSTMENT_TYPES.PENALTY,
        employeeId: 'e1',
        branchId: 'tram-spa',
        date: '2026-07-09',
        amount: 50_000,
      },
    ],
    attendanceRecords: [
      {
        id: 'att-1',
        employeeId: 'e1',
        branchId: 'tram-spa',
        date: '2026-07-08',
        penaltyAmount: 20_000,
      },
    ],
    getBranchName: names,
  })
  const tram = result.rows.find((r) => r.branchId === 'tram-spa')
  assert.equal(tram.penalty, 70_000)
  assert.ok(tram.duplicatePenaltyCount >= 1)
  assert.equal(tram.profit, 0 - 0 - 0 - 0 + 70_000)
  console.log('  [PASS] 6. Phạt A: dedupe; cộng LN; cảnh báo nghi trùng')
}

// --- Unknown branch vẫn vào tổng hệ thống ---
{
  const result = buildBranchEfficiencyPnl({
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    invoices: [
      {
        id: 'inv-u',
        date: '2026-07-03',
        branchId: '',
        employeeId: 'e',
        serviceTotal: 80_000,
        services: [{ price: 80_000, commissionAmount: 8_000, commissionPercent: 10 }],
      },
      {
        id: 'inv-ok',
        date: '2026-07-03',
        branchId: 'soc-trang',
        employeeId: 'e2',
        serviceTotal: 20_000,
        services: [{ price: 20_000, commissionAmount: 0, commissionPercent: 0 }],
      },
    ],
    expenses: [
      { id: 'eu', date: '2026-07-04', branchId: '', expenseType: 'dien', amount: 5_000 },
    ],
    fixedCosts: [],
    adjustments: [],
    attendanceRecords: [],
    getBranchName: names,
  })
  const unknown = result.rows.find((r) => r.branchId === UNKNOWN_BRANCH_ID)
  assert.ok(unknown)
  assert.equal(unknown.branchName, UNKNOWN_BRANCH_LABEL)
  assert.equal(unknown.revenue, 80_000)
  assert.equal(unknown.operatingCostVariable, 5_000)
  assert.equal(result.systemTotal.revenue, 100_000)
  assert.ok(unknown.missingBranch.invoiceCount >= 1)
  console.log('  [PASS] 7. Thiếu branchId → “Chưa xác định chi nhánh”; vẫn vào Tổng hệ thống')
}

// --- End-to-end fixture số ---
{
  // DT tram 500k, %HĐ 100k (chỉ primary), CP 30k + fixed 0, thưởng 0, phạt 20k
  // LN = 500k - 30k - 100k - 0 + 20k = 390k
  const result = buildBranchEfficiencyPnl({
    fromDate: '2026-07-16',
    toDate: '2026-07-31',
    invoices: [{
      id: 'inv',
      date: '2026-07-20',
      branchId: 'tram-spa',
      employeeId: 'e1',
      tips: 99_999,
      serviceTotal: 500_000,
      services: [{ price: 500_000, commissionAmount: 100_000, commissionPercent: 20 }],
    }],
    expenses: [
      { id: 'e', date: '2026-07-21', branchId: 'tram-spa', expenseType: 'nuoc', amount: 30_000 },
    ],
    fixedCosts: [],
    adjustments: [],
    attendanceRecords: [
      {
        id: 'a',
        date: '2026-07-22',
        branchId: 'tram-spa',
        employeeId: 'e1',
        penaltyAmount: 20_000,
      },
    ],
    getBranchName: names,
  })
  const tram = result.rows.find((r) => r.branchId === 'tram-spa')
  assert.equal(tram.revenue, 500_000)
  assert.equal(tram.operatingCost, 30_000)
  assert.equal(tram.invoiceCommission, 100_000)
  assert.equal(tram.bonus, 0)
  assert.equal(tram.penalty, 20_000)
  assert.equal(tram.profit, 390_000)
  assert.equal(tram.marginPercent, Math.round((390_000 / 500_000) * 10000) / 100)
  console.log('  [PASS] 8. Fixture E2E số + biên LN')
}

console.log('\n=== ALL PASS — Branch efficiency P&L B1 ===\n')
console.log(JSON.stringify({
  formula: BRANCH_EFFICIENCY_PNL_FORMULA,
  supportRate: SUPPORT_EMPLOYEE_COMMISSION_RATE,
  unknownBranchId: UNKNOWN_BRANCH_ID,
}, null, 2))
