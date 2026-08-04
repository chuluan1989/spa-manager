/**
 * UAT B2 — Tab tổng hợp Hiệu quả chi nhánh (UI aggregation + filters + rules).
 * Không sửa engine B1 — chỉ assert qua buildBranchEfficiencyPnl.
 * Run: npx vite-node scripts/verify-branch-efficiency-b2-uat.mjs
 */
import assert from 'node:assert/strict'
import './_polyfill-storage.mjs'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'
import { FIXED_EXPENSE_TYPE_ID } from '../src/constants/expenseTypes.js'
import { SALARY_ADVANCE_EXPENSE_TYPE } from '../src/constants/salaryAdvanceTypes.js'
import {
  getPayPeriodRange,
  PAY_CYCLES,
} from '../src/utils/salaryReport.js'
import {
  resolveEfficiencyRange,
} from '../src/hooks/useBranchEfficiencyPnlData.js'
import {
  UNKNOWN_BRANCH_ID,
  UNKNOWN_BRANCH_LABEL,
  buildBranchEfficiencyPnl,
  computeBranchEfficiencyProfit,
} from '../src/utils/managementReports/branchEfficiencyPnl.js'

console.log('\n=== UAT B2 — Branch efficiency summary tab ===\n')

const names = (id) => ({
  'tram-spa': 'Trạm Spa',
  'soc-trang': 'Sóc Trăng',
  'song-khoe-spa': 'Sống Khoẻ',
}[id] || id)

function fixturePayload() {
  return {
    invoices: [
      {
        id: 'inv-a',
        date: '2026-07-10',
        branchId: 'tram-spa',
        employeeId: 'e1',
        tips: 80_000,
        serviceTotal: 1_000_000,
        services: [{ id: 's1', price: 1_000_000, commissionPercent: 20, commissionAmount: 200_000 }],
      },
      {
        id: 'inv-b',
        date: '2026-07-20',
        branchId: 'soc-trang',
        employeeId: 'e2',
        supportEmployeeId: 'e3',
        tips: 30_000,
        serviceTotal: 400_000,
        services: [{ id: 's2', price: 400_000, commissionPercent: 10, commissionAmount: 40_000 }],
      },
      {
        id: 'inv-u',
        date: '2026-07-22',
        branchId: '',
        employeeId: 'e4',
        tips: 5_000,
        serviceTotal: 100_000,
        services: [{ id: 's3', price: 100_000, commissionPercent: 10, commissionAmount: 10_000 }],
      },
      // Ngoài kỳ FULL tháng 7 → không vào
      {
        id: 'inv-out',
        date: '2026-06-30',
        branchId: 'tram-spa',
        employeeId: 'e1',
        tips: 0,
        serviceTotal: 999_000,
        services: [{ id: 's9', price: 999_000, commissionPercent: 10, commissionAmount: 99_900 }],
      },
    ],
    expenses: [
      {
        id: 'exp-op',
        date: '2026-07-12',
        branchId: 'tram-spa',
        expenseType: 'vat-tu',
        amount: 50_000,
      },
      // Ứng lương — không vào CP
      {
        id: 'exp-adv',
        date: '2026-07-13',
        branchId: 'tram-spa',
        expenseType: SALARY_ADVANCE_EXPENSE_TYPE,
        amount: 200_000,
      },
      // Lương — không vào CP
      {
        id: 'exp-salary',
        date: '2026-07-14',
        branchId: 'tram-spa',
        expenseType: 'luong',
        amount: 5_000_000,
      },
      // Mặt bằng tay — không vào (đã có fixed)
      {
        id: 'exp-rent-manual',
        date: '2026-07-15',
        branchId: 'tram-spa',
        expenseType: FIXED_EXPENSE_TYPE_ID,
        amount: 1_000_000,
      },
      {
        id: 'exp-st',
        date: '2026-07-18',
        branchId: 'soc-trang',
        expenseType: 'dien-nuoc',
        amount: 20_000,
      },
    ],
    fixedCosts: [
      { id: 'fc1', branchId: 'tram-spa', amount: 300_000, startMonth: '2026-01', endMonth: '' },
      { id: 'fc2', branchId: 'soc-trang', amount: 100_000, startMonth: '2026-01', endMonth: '' },
    ],
    adjustments: [
      {
        id: 'adj-b',
        type: PAYROLL_ADJUSTMENT_TYPES.BONUS,
        date: '2026-07-11',
        branchId: 'tram-spa',
        employeeId: 'e1',
        amount: 25_000,
      },
      {
        id: 'adj-p',
        type: PAYROLL_ADJUSTMENT_TYPES.PENALTY,
        date: '2026-07-21',
        branchId: 'soc-trang',
        employeeId: 'e2',
        amount: 10_000,
      },
    ],
    attendanceRecords: [
      {
        id: 'att-1',
        date: '2026-07-21',
        branchId: 'soc-trang',
        employeeId: 'e2',
        penaltyAmount: 10_000, // trùng adj-p → giữ attendance
      },
    ],
  }
}

let passed = 0
function pass(label) {
  passed += 1
  console.log(`  [PASS] ${passed}. ${label}`)
}

// 1. Filter tháng / kỳ FULL
{
  const range = getPayPeriodRange('2026-07', PAY_CYCLES.FULL)
  assert.equal(range.fromDate, '2026-07-01')
  assert.equal(range.toDate, '2026-07-31')
  const resolved = resolveEfficiencyRange({ month: '2026-07', cycle: PAY_CYCLES.FULL, mode: 'cycle' })
  assert.deepEqual(resolved, range)
  pass('Filter tháng + kỳ lương (FULL) → đúng khoảng ngày')
}

// 2. Filter kỳ 1 / kỳ 2
{
  const p1 = resolveEfficiencyRange({ month: '2026-07', cycle: PAY_CYCLES.PERIOD_1, mode: 'cycle' })
  const p2 = resolveEfficiencyRange({ month: '2026-07', cycle: PAY_CYCLES.PERIOD_2, mode: 'cycle' })
  assert.deepEqual(p1, { fromDate: '2026-07-01', toDate: '2026-07-15' })
  assert.deepEqual(p2, { fromDate: '2026-07-16', toDate: '2026-07-31' })
  pass('Filter kỳ 1 / kỳ 2 đúng')
}

// 3. Khoảng ngày tùy chọn
{
  const custom = resolveEfficiencyRange({
    month: '2026-07',
    cycle: PAY_CYCLES.FULL,
    fromDate: '2026-07-10',
    toDate: '2026-07-20',
    mode: 'custom',
  })
  assert.deepEqual(custom, { fromDate: '2026-07-10', toDate: '2026-07-20' })
  pass('Filter khoảng ngày tùy chọn đúng')
}

const payload = fixturePayload()
const full = buildBranchEfficiencyPnl({
  fromDate: '2026-07-01',
  toDate: '2026-07-31',
  ...payload,
  getBranchName: names,
})

// 4. Không tips trong doanh thu
{
  assert.equal(full.systemTotal.revenue, 1_000_000 + 400_000 + 100_000)
  for (const row of full.rows) {
    for (const line of row.details.revenueLines) {
      assert.ok(line.tipsExcluded >= 0)
      // revenue line = service only
      if (line.invoiceId === 'inv-a') {
        assert.equal(line.revenue, 1_000_000)
        assert.equal(line.tipsExcluded, 80_000)
      }
      if (line.invoiceId === 'inv-b') assert.equal(line.revenue, 400_000)
      if (line.invoiceId === 'inv-u') assert.equal(line.revenue, 100_000)
    }
  }
  pass('Không tips trong doanh thu')
}

// 5. Không lương CB / ứng / mặt bằng tay trong CP; fixed vẫn 1 lần
{
  const tram = full.rows.find((r) => r.branchId === 'tram-spa')
  // variable 50k + fixed 300k; NOT advance/salary/manual rent
  assert.equal(tram.operatingCostVariable, 50_000)
  assert.equal(tram.operatingCostFixed, 300_000)
  assert.equal(tram.operatingCost, 350_000)
  const types = tram.details.expenseLines.map((l) => l.expenseType)
  assert.ok(!types.includes(SALARY_ADVANCE_EXPENSE_TYPE))
  assert.ok(!types.includes('luong'))
  assert.equal(types.filter((t) => t === FIXED_EXPENSE_TYPE_ID).length, 1)
  pass('Không lương CB / không trùng mặt bằng / không ứng lương trong CP')
}

// 6. Unknown vào Tổng hệ thống
{
  const unknown = full.rows.find((r) => r.branchId === UNKNOWN_BRANCH_ID)
  assert.ok(unknown)
  assert.equal(unknown.branchName, UNKNOWN_BRANCH_LABEL)
  assert.equal(unknown.revenue, 100_000)
  assert.equal(
    full.systemTotal.revenue,
    full.rows.reduce((s, r) => s + r.revenue, 0),
  )
  pass('Unknown branch vẫn vào Tổng hệ thống')
}

// 7. Tổng từng CN = Tổng hệ thống (mọi cột tiền)
{
  const sum = (key) => full.rows.reduce((s, r) => s + r[key], 0)
  assert.equal(sum('revenue'), full.systemTotal.revenue)
  assert.equal(sum('operatingCost'), full.systemTotal.operatingCost)
  assert.equal(sum('invoiceCommission'), full.systemTotal.invoiceCommission)
  assert.equal(sum('bonus'), full.systemTotal.bonus)
  assert.equal(sum('penalty'), full.systemTotal.penalty)
  assert.equal(sum('profit'), full.systemTotal.profit)
  pass('Tổng từng chi nhánh cộng lại khớp Tổng hệ thống')
}

// 8. Biên lợi nhuận đúng
{
  for (const row of [...full.rows, full.systemTotal]) {
    const expectedProfit = computeBranchEfficiencyProfit(row)
    assert.equal(row.profit, expectedProfit)
    const expectedMargin = row.revenue > 0
      ? Math.round((row.profit / row.revenue) * 10000) / 100
      : 0
    assert.equal(row.marginPercent, expectedMargin)
  }
  pass('Biên lợi nhuận đúng trên từng dòng + tổng')
}

// 9. Filter kỳ 1 chỉ lấy HĐ/CP trong 1–15
{
  const p1 = buildBranchEfficiencyPnl({
    fromDate: '2026-07-01',
    toDate: '2026-07-15',
    ...payload,
    getBranchName: names,
  })
  assert.equal(p1.systemTotal.revenue, 1_000_000) // chỉ inv-a
  const st = p1.rows.find((r) => r.branchId === 'soc-trang')
  // Có thể còn dòng CN do mặt bằng cố định, nhưng không có DT kỳ 2
  if (st) assert.equal(st.revenue, 0)
  assert.ok(!p1.rows.find((r) => r.branchId === UNKNOWN_BRANCH_ID))
  const tram = p1.rows.find((r) => r.branchId === 'tram-spa')
  assert.equal(tram.revenue, 1_000_000)
  assert.equal(tram.bonus, 25_000)
  pass('Filter kỳ 1 chỉ gồm dữ liệu 01–15')
}

// 10. Filter khoảng ngày 16–31
{
  const p2 = buildBranchEfficiencyPnl({
    fromDate: '2026-07-16',
    toDate: '2026-07-31',
    ...payload,
    getBranchName: names,
  })
  assert.equal(p2.systemTotal.revenue, 400_000 + 100_000)
  const tram = p2.rows.find((r) => r.branchId === 'tram-spa')
  // kỳ 2: tram có thể chỉ còn fixed rent (không HĐ)
  if (tram) {
    assert.equal(tram.revenue, 0)
  }
  pass('Filter kỳ 2 / khoảng ngày 16–31 đúng')
}

// 11. Phạt không trùng (dedupe)
{
  const st = full.rows.find((r) => r.branchId === 'soc-trang')
  assert.equal(st.penalty, 10_000)
  pass('Phạt không tính trùng attendance + adjustment')
}

// 12. Lợi nhuận âm vẫn cộng đúng vào tổng (highlight là UI)
{
  const lossy = buildBranchEfficiencyPnl({
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    invoices: [],
    expenses: [{ id: 'x', date: '2026-07-01', branchId: 'tram-spa', expenseType: 'vat-tu', amount: 500_000 }],
    fixedCosts: [],
    adjustments: [],
    attendanceRecords: [],
    getBranchName: names,
  })
  assert.ok(lossy.systemTotal.profit < 0)
  assert.equal(lossy.systemTotal.profit, -500_000)
  pass('Lợi nhuận âm tính đúng (UI sẽ highlight)')
}

console.log(`\n=== UAT B2: ${passed}/12 PASS ===\n`)
