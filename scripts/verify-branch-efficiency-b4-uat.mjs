/**
 * UAT B4 — Hoàn thiện báo cáo Hiệu quả chi nhánh.
 * Run: npx vite-node scripts/verify-branch-efficiency-b4-uat.mjs
 */
import assert from 'node:assert/strict'
import './_polyfill-storage.mjs'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'
import { FIXED_EXPENSE_TYPE_ID } from '../src/constants/expenseTypes.js'
import {
  buildBranchEfficiencyPnl,
  UNKNOWN_BRANCH_ID,
} from '../src/utils/managementReports/branchEfficiencyPnl.js'
import {
  createBranchEfficiencyReportCache,
} from '../src/utils/managementReports/branchEfficiencyCache.js'
import {
  DEFAULT_BRANCH_EFFICIENCY_SORT,
  rankBranchEfficiencyRows,
  resolveMarginTone,
  resolveProfitTone,
} from '../src/utils/managementReports/branchEfficiencyRanking.js'
import {
  buildBranchEfficiencyWarnings,
} from '../src/utils/managementReports/branchEfficiencyWarnings.js'
import {
  buildBranchEfficiencyExportBundle,
} from '../src/utils/managementReports/branchEfficiencyExport.js'
import {
  assertDrillMatchesSummary,
  BRANCH_EFFICIENCY_DRILL_TYPES,
} from '../src/utils/managementReports/branchEfficiencyDrillDown.js'

console.log('\n=== UAT B4 — Branch efficiency polish ===\n')

const names = (id) => ({ 'tram-spa': 'Trạm Spa', 'soc-trang': 'Sóc Trăng', 'gia-lai-1': 'Gia Lai 1' }[id] || id)

const payload = {
  invoices: [
    {
      id: 'inv-a', date: '2026-07-10', branchId: 'tram-spa', employeeId: 'e1',
      tips: 80_000, paymentMethod: 'cash', serviceTotal: 1_000_000,
      services: [{ id: 's1', name: 'Massage', price: 1_000_000, commissionAmount: 200_000 }],
    },
    {
      id: 'inv-b', date: '2026-07-20', branchId: 'soc-trang', employeeId: 'e2', supportEmployeeId: 'e3',
      tips: 0, paymentMethod: 'bank_transfer', serviceTotal: 400_000,
      services: [{ id: 's2', name: 'Gội', price: 400_000, commissionAmount: 40_000 }],
    },
    {
      id: 'inv-c', date: '2026-07-21', branchId: 'gia-lai-1', employeeId: 'e5',
      tips: 0, serviceTotal: 50_000,
      services: [{ id: 's4', name: 'Xông', price: 50_000, commissionAmount: 5_000 }],
    },
    {
      id: 'inv-u', date: '2026-07-22', branchId: '', employeeId: 'e4',
      tips: 5_000, serviceTotal: 100_000,
      services: [{ id: 's3', name: 'Chăm da', price: 100_000, commissionAmount: 10_000 }],
    },
  ],
  expenses: [
    { id: 'exp-1', date: '2026-07-12', branchId: 'tram-spa', expenseType: 'vat-tu', amount: 50_000, enteredBy: 'A' },
    { id: 'exp-dup-1', date: '2026-07-12', branchId: 'tram-spa', expenseType: 'vat-tu', amount: 50_000, enteredBy: 'B' },
    { id: 'exp-rent', date: '2026-07-15', branchId: 'tram-spa', expenseType: FIXED_EXPENSE_TYPE_ID, amount: 1_000_000 },
    { id: 'exp-st', date: '2026-07-18', branchId: 'soc-trang', expenseType: 'dien-nuoc', amount: 20_000 },
  ],
  fixedCosts: [
    { id: 'fc1', branchId: 'tram-spa', amount: 300_000 },
    { id: 'fc2', branchId: 'soc-trang', amount: 100_000 },
    { id: 'fc3', branchId: 'gia-lai-1', amount: 200_000 },
  ],
  adjustments: [
    { id: 'adj-b', type: PAYROLL_ADJUSTMENT_TYPES.BONUS, date: '2026-07-11', branchId: 'tram-spa', employeeId: 'e1', amount: 25_000, reason: 'KPI', createdByName: 'Admin' },
    { id: 'adj-p', type: PAYROLL_ADJUSTMENT_TYPES.PENALTY, date: '2026-07-21', branchId: 'soc-trang', employeeId: 'e2', amount: 10_000 },
    { id: 'adj-miss', type: PAYROLL_ADJUSTMENT_TYPES.BONUS, date: '2026-07-12', branchId: '', employeeId: 'e9', amount: 5_000 },
  ],
  attendanceRecords: [
    { id: 'att-1', date: '2026-07-21', branchId: 'soc-trang', employeeId: 'e2', penaltyAmount: 10_000, status: 'late' },
  ],
}

const report = buildBranchEfficiencyPnl({
  fromDate: '2026-07-01',
  toDate: '2026-07-31',
  ...payload,
  getBranchName: names,
})

let passed = 0
function pass(label) {
  passed += 1
  console.log(`  [PASS] ${passed}. ${label}`)
}

// 1. Ranking mặc định theo LN giảm dần; unknown cuối
{
  const ranked = rankBranchEfficiencyRows(report.rows, DEFAULT_BRANCH_EFFICIENCY_SORT, 'desc')
  assert.equal(ranked[ranked.length - 1].branchId, UNKNOWN_BRANCH_ID)
  const known = ranked.filter((r) => !r.isUnknown)
  for (let i = 1; i < known.length; i += 1) {
    assert.ok(known[i - 1].profit >= known[i].profit)
  }
  assert.equal(known[0].rank, 1)
  assert.equal(ranked.find((r) => r.isUnknown).rank, null)
  pass('Ranking mặc định: LN giảm dần; unknown cuối')
}

// 2. Ranking theo doanh thu / biên / % HĐ / CP
{
  const byRev = rankBranchEfficiencyRows(report.rows, 'revenue', 'desc')
  const known = byRev.filter((r) => !r.isUnknown)
  for (let i = 1; i < known.length; i += 1) {
    assert.ok(known[i - 1].revenue >= known[i].revenue)
  }
  const byMargin = rankBranchEfficiencyRows(report.rows, 'marginPercent', 'desc')
  assert.ok(byMargin.filter((r) => !r.isUnknown).length >= 1)
  const byComm = rankBranchEfficiencyRows(report.rows, 'invoiceCommission', 'desc')
  assert.ok(byComm[0].invoiceCommission >= byComm.filter((r) => !r.isUnknown).at(-1).invoiceCommission)
  const byOpex = rankBranchEfficiencyRows(report.rows, 'operatingCost', 'desc')
  assert.ok(byOpex.filter((r) => !r.isUnknown)[0].operatingCost
    >= byOpex.filter((r) => !r.isUnknown).at(-1).operatingCost)
  pass('Ranking theo DT / biên / % HĐ / CP vận hành')
}

// 3. KPI màu
{
  assert.equal(resolveMarginTone(30), 'good')
  assert.equal(resolveMarginTone(45), 'good')
  assert.equal(resolveMarginTone(20), 'warn')
  assert.equal(resolveMarginTone(29.9), 'warn')
  assert.equal(resolveMarginTone(19.99), 'bad')
  assert.equal(resolveMarginTone(0), 'bad')
  assert.equal(resolveProfitTone(-1), 'loss-strong')
  assert.equal(resolveProfitTone(0), 'neutral')
  assert.equal(resolveProfitTone(100), 'neutral')
  pass('KPI màu biên LN + LN âm đỏ đậm')
}

// 4. Warnings
{
  const warnings = buildBranchEfficiencyWarnings({
    report,
    invoices: payload.invoices,
    expenses: payload.expenses,
    adjustments: payload.adjustments,
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
  })
  assert.equal(warnings.hasWarnings, true)
  const ids = warnings.items.map((i) => i.id)
  assert.ok(ids.includes('unknown-branch'))
  assert.ok(ids.includes('invoice-missing-branch'))
  assert.ok(ids.includes('adjustment-missing-branch'))
  assert.ok(ids.includes('duplicate-penalty'))
  assert.ok(ids.includes('expense-suspect-duplicate'))
  pass('Banner cảnh báo: unknown / phạt trùng / expense / invoice / adjustment thiếu CN')
}

// 5. Tổng hệ thống vẫn khớp
{
  const sumProfit = report.rows.reduce((s, r) => s + r.profit, 0)
  assert.equal(sumProfit, report.systemTotal.profit)
  const sumRev = report.rows.reduce((s, r) => s + r.revenue, 0)
  assert.equal(sumRev, report.systemTotal.revenue)
  pass('Tổng hệ thống khớp tổng từng CN')
}

// 6. Export bundle gồm tổng + CN + drill
{
  const ranked = rankBranchEfficiencyRows(report.rows, 'profit', 'desc')
  const bundle = buildBranchEfficiencyExportBundle({
    rows: ranked,
    systemTotal: report.systemTotal,
    filters: { fromDate: '2026-07-01', toDate: '2026-07-31' },
    invoices: payload.invoices,
    adjustments: payload.adjustments,
    sortKey: 'profit',
    warnings: buildBranchEfficiencyWarnings({
      report,
      invoices: payload.invoices,
      expenses: payload.expenses,
      adjustments: payload.adjustments,
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
    }).items,
  })
  assert.ok(bundle.totalSummary)
  assert.equal(bundle.totalSummary.revenue, report.systemTotal.revenue)
  assert.equal(bundle.summaryRows.length, ranked.length)
  assert.ok(assertDrillMatchesSummary(bundle.drills.revenue))
  assert.ok(assertDrillMatchesSummary(bundle.drills.opex))
  assert.ok(assertDrillMatchesSummary(bundle.drills.commission))
  assert.ok(assertDrillMatchesSummary(bundle.drills.bonus))
  assert.ok(assertDrillMatchesSummary(bundle.drills.penalty))
  assert.equal(bundle.perBranch.length, ranked.length)
  assert.ok(bundle.warnings.length >= 1)
  pass('Export bundle: tổng hệ thống + từng CN + drill khớp')
}

// 7. Cache theo filter
{
  const cache = createBranchEfficiencyReportCache(4)
  const key1 = cache.makeKey({ fromDate: '2026-07-01', toDate: '2026-07-31', payloadId: 'p1' })
  const key2 = cache.makeKey({ fromDate: '2026-07-01', toDate: '2026-07-15', payloadId: 'p1' })
  const built = { id: 'report-a' }
  cache.set(key1, built)
  assert.equal(cache.get(key1), built)
  assert.equal(cache.has(key2), false)
  // đổi filter → key khác → không hit
  const built2 = buildBranchEfficiencyPnl({
    fromDate: '2026-07-01',
    toDate: '2026-07-15',
    ...payload,
    getBranchName: names,
  })
  cache.set(key2, built2)
  assert.notEqual(cache.get(key1), cache.get(key2))
  // cùng key không tính lại object mới nếu reuse
  const again = cache.get(key1)
  assert.equal(again, built)
  pass('Cache theo filter: hit cùng kỳ; đổi filter tính mới')
}

// 8. Unknown vẫn trong tổng + ranking cuối
{
  assert.ok(report.rows.some((r) => r.branchId === UNKNOWN_BRANCH_ID))
  assert.ok(report.systemTotal.revenue >= 100_000)
  pass('Unknown branch vẫn trong báo cáo / tổng hệ thống')
}

// 9. Performance contract — buildEfficiency không bị gọi lại khi cache hit
{
  let builds = 0
  const cache = createBranchEfficiencyReportCache()
  const key = cache.makeKey({ fromDate: '2026-07-01', toDate: '2026-07-31', payloadId: 'perf' })
  function getReport() {
    const hit = cache.get(key)
    if (hit) return hit
    builds += 1
    return cache.set(key, buildBranchEfficiencyPnl({
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      ...payload,
      getBranchName: names,
    }))
  }
  const a = getReport()
  const b = getReport()
  const c = getReport()
  assert.equal(builds, 1)
  assert.equal(a, b)
  assert.equal(b, c)
  pass('Performance: memoize/cache — không tính lại liên tục')
}

void BRANCH_EFFICIENCY_DRILL_TYPES

console.log(`\n=== UAT B4: ${passed}/9 PASS ===\n`)
