/**
 * Regression suite OFFLINE — PAYROLL GOVERNANCE V1
 * Không ghi DB. Dùng src thật qua vite-node.
 *
 *   npx vite-node scripts/regression-payroll-governance-offline.mjs
 */
function createStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
globalThis.localStorage = createStorage()
globalThis.sessionStorage = createStorage()

import assert from 'node:assert/strict'
import { computeNetSalary, computePayrollReport } from '../src/utils/payrollEngine.js'
import { getPayPeriodRange, PAY_CYCLES } from '../src/utils/salaryReport.js'
import { mapPayrollRowForExport, reconcilePayrollExport } from '../src/utils/payrollExportModel.js'
import {
  aggregatePayrollCostFromReport,
  computePayrollCostByBranch,
  computeProfitAmount,
  resolveTotalSalary,
} from '../src/utils/profitReport.js'
import { assertOneSource, diffGovernance, buildGovernanceSnapshot } from './lib/payrollGovernanceSnapshot.mjs'
import { currentTotalsFromPayrollRow } from '../src/components/salary/PayrollEditBoardModal.jsx'
import {
  ADMIN_EDITABLE_ADJUSTMENT_TYPES,
  PAYROLL_ADJUSTMENT_LABELS,
  PAYROLL_ADJUSTMENT_TYPES,
  PAYROLL_DETAIL_CATEGORIES,
  PAYROLL_DETAIL_LABELS,
} from '../src/constants/payrollTypes.js'
import { aggregateBranchSummaries, mergeEmployeePayrollRows } from '../src/utils/payrollViewHelpers.js'

const results = []
function check(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
    console.log(`✓ ${name}`)
  } catch (err) {
    results.push({ name, ok: false, error: String(err?.message || err) })
    console.error(`✗ ${name}: ${err?.message || err}`)
  }
}

// ─── KPI + net formula (ops) ───────────────────────────────────────────────
check('KPI: net includes signed KPI; excludes otherAdjustment', () => {
  const net = computeNetSalary({
    baseSalary: 0,
    commission: 1000,
    tips: 2000,
    bonus: 500,
    kpi: -300,
    reduction: 0,
    penalty: 100,
    advance: 200,
    otherAdjustment: 999999, // legacy — must NOT affect ops net
  })
  assert.equal(net, 1000 + 2000 + 500 - 300 - 100 - 200)
})

check('Giam luong: label is Giam lương, never Giảm lương', () => {
  assert.equal(PAYROLL_DETAIL_LABELS[PAYROLL_DETAIL_CATEGORIES.REDUCTION], 'Giam lương')
  assert.equal(PAYROLL_ADJUSTMENT_LABELS[PAYROLL_ADJUSTMENT_TYPES.REDUCTION], 'Giam lương')
})

check('Giam luong: net = trước giữ/trừ − Phạt − Ứng lương − Giam lương', () => {
  const base = {
    baseSalary: 1_000_000,
    commission: 2_000_000,
    tips: 100_000,
    bonus: 200_000,
    kpi: 50_000,
    penalty: 100_000,
    advance: 150_000,
    reduction: 0,
  }
  const net0 = computeNetSalary(base)
  assert.equal(computeNetSalary({ ...base, reduction: 500_000 }), net0 - 500_000)
  assert.equal(computeNetSalary({ ...base, reduction: 300_000 }), net0 - 300_000)
  assert.equal(computeNetSalary({ ...base, reduction: 0 }), net0)
  assert.equal(
    computeNetSalary({ ...base, reduction: 500_000 }),
    base.baseSalary + base.commission + base.tips + base.bonus + base.kpi
      - base.penalty - base.advance - 500_000,
  )
})

check('KPI: positive KPI increases net', () => {
  const base = computeNetSalary({
    baseSalary: 0, commission: 0, tips: 0, bonus: 0, kpi: 0, reduction: 0, penalty: 0, advance: 0,
  })
  const withKpi = computeNetSalary({
    baseSalary: 0, commission: 0, tips: 0, bonus: 0, kpi: 500000, reduction: 0, penalty: 0, advance: 0,
  })
  assert.equal(withKpi - base, 500000)
})

// ─── Pay cycles ────────────────────────────────────────────────────────────
check('Cycle Kỳ 1 = 01–15', () => {
  const r = getPayPeriodRange('2026-08', PAY_CYCLES.PERIOD_1)
  assert.equal(r.fromDate, '2026-08-01')
  assert.equal(r.toDate, '2026-08-15')
})

check('Cycle Kỳ 2 = 16–end', () => {
  const r = getPayPeriodRange('2026-07', PAY_CYCLES.PERIOD_2)
  assert.equal(r.fromDate, '2026-07-16')
  assert.equal(r.toDate, '2026-07-31')
})

check('Cycle FULL = whole month', () => {
  const r = getPayPeriodRange('2026-02', PAY_CYCLES.FULL)
  assert.equal(r.fromDate, '2026-02-01')
  assert.equal(r.toDate, '2026-02-28')
})

// ─── Popup Sửa bảng lương binds payrollRow only ────────────────────────────
check('Popup: currentTotalsFromPayrollRow binds board fields from payrollRow', () => {
  // Phạt trên board = manualPenalty (phạt chấm công tách RO).
  const totals = currentTotalsFromPayrollRow({
    bonus: 100, kpi: -50, penalty: 120, manualPenalty: 20, attendancePenalty: 100, advance: 30, reduction: 40, otherAdjustment: 999,
  })
  assert.deepEqual(totals, {
    [PAYROLL_ADJUSTMENT_TYPES.BONUS]: 100,
    [PAYROLL_ADJUSTMENT_TYPES.KPI]: -50,
    [PAYROLL_ADJUSTMENT_TYPES.PENALTY]: 20,
    [PAYROLL_ADJUSTMENT_TYPES.ADVANCE]: 30,
    [PAYROLL_ADJUSTMENT_TYPES.REDUCTION]: 40,
  })
  assert.equal(ADMIN_EDITABLE_ADJUSTMENT_TYPES.length, 5)
  assert.ok(!ADMIN_EDITABLE_ADJUSTMENT_TYPES.includes(PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT))
  assert.ok(ADMIN_EDITABLE_ADJUSTMENT_TYPES.includes(PAYROLL_ADJUSTMENT_TYPES.REDUCTION))
})

check('Popup: null payrollRow → null totals', () => {
  assert.equal(currentTotalsFromPayrollRow(null), null)
})

// ─── Excel / PDF / Dashboard share payrollRow ──────────────────────────────
check('Excel: mapPayrollRowForExport preserves bonus/kpi/penalty/advance/net', () => {
  const row = {
    employeeId: 'e1',
    employeeName: 'Test',
    branchId: 'soc-trang',
    baseSalary: 0,
    commission: 10,
    tips: 20,
    bonus: 30,
    kpi: 40,
    penalty: 5,
    advance: 6,
    reduction: 0,
    otherAdjustment: 0,
    netSalary: computeNetSalary({
      baseSalary: 0, commission: 10, tips: 20, bonus: 30, kpi: 40, reduction: 0, penalty: 5, advance: 6,
    }),
  }
  const excel = mapPayrollRowForExport(row)
  assert.equal(excel.bonus, 30)
  assert.equal(excel.kpi, 40)
  assert.equal(excel.penalty, 5)
  assert.equal(excel.advance, 6)
  assert.equal(excel.netSalary, row.netSalary)
  const recon = reconcilePayrollExport({
    payrollRow: row,
    invoiceLines: [
      { commissionAmount: 10, tips: 20 },
    ],
  })
  assert.equal(recon.ok, true, recon.errors?.join('; '))
})

check('PDF/Dashboard: net + KPI fields come from same payrollRow (no recompute)', () => {
  const row = {
    bonus: 1, kpi: 2, penalty: 3, advance: 4,
    netSalary: 1000,
    commission: 0, tips: 0, baseSalary: 0, reduction: 0,
  }
  // Live dashboard / payslip contract: read fields, do not invent net
  assert.equal(row.netSalary, 1000)
  assert.equal(row.kpi, 2)
  const excel = mapPayrollRowForExport({ ...row, employeeId: 'x', employeeName: 'x', branchId: 'soc-trang' })
  assert.equal(excel.netSalary, 1000)
})

// ─── Payroll Summary / branch list SoT ─────────────────────────────────────
check('Summary: home-branch list sum === branch card net (same report.rows)', () => {
  const employees = [
    { id: 'a', branchId: 'soc-trang', name: 'A', status: 'active' },
    { id: 'b', branchId: 'tram-spa', name: 'B', status: 'active' },
  ]
  const rows = [
    { employeeId: 'a', employeeName: 'A', branchId: 'soc-trang', netSalary: 7000000, tips: 1, commission: 1, bonus: 0, penalty: 0, advance: 0, reduction: 0, baseSalary: 0, ticketRevenue: 1, provisionalNet: 7000000 },
    { employeeId: 'b', employeeName: 'B', branchId: 'tram-spa', netSalary: 100, tips: 0, commission: 0, bonus: 0, penalty: 0, advance: 0, reduction: 0, baseSalary: 0, ticketRevenue: 0, provisionalNet: 100 },
  ]
  const branches = [{ id: 'soc-trang', name: 'Sóc Trăng' }, { id: 'tram-spa', name: 'Tràm' }]
  const summaries = aggregateBranchSummaries(branches, employees, rows)
  const soc = summaries.find((s) => s.branchId === 'soc-trang')
  const list = mergeEmployeePayrollRows(employees, rows, { branchId: 'soc-trang', homeBranchOnly: true })
  const listNet = list.reduce((s, r) => s + r.netSalary, 0)
  assert.equal(soc.netSalary, listNet)
  assert.equal(soc.netSalary, 7000000)
})

// ─── ONE SOURCE OF TRUTH: labor from report; no commission+tips fallback ───
check('SoT: resolveTotalSalary never falls back to commission+tips', () => {
  assert.equal(resolveTotalSalary({ payrollByBranch: null }), 0)
  assert.equal(resolveTotalSalary({
    payrollByBranch: { total: 123, byBranch: new Map([['soc-trang', 50]]) },
    branchId: 'soc-trang',
  }), 50)
})

check('SoT: aggregatePayrollCostFromReport === dashboard net', () => {
  const employees = [
    { id: 'e1', branchId: 'soc-trang', name: 'E1', status: 'active', role: 'technician' },
  ]
  const report = computePayrollReport({
    month: '2026-08',
    cycle: PAY_CYCLES.PERIOD_1,
    branchId: '',
    employeeId: '',
    employees,
    invoices: [{
      id: 'inv1',
      date: '2026-08-02',
      branchId: 'soc-trang',
      employeeId: 'e1',
      supportEmployeeId: '',
      status: 'completed',
      services: [{ serviceId: 'goi-sach', name: 'Gội', price: 100000, quantity: 1, commissionPercent: 20 }],
      tips: 10000,
      discountAmount: 0,
    }],
    attendanceRecords: [],
    adjustments: [
      { id: 'a1', employeeId: 'e1', branchId: 'soc-trang', type: 'bonus', amount: 50000, month: '2026-08', date: '2026-08-02' },
      { id: 'a2', employeeId: 'e1', branchId: 'soc-trang', type: 'kpi', amount: -10000, month: '2026-08', date: '2026-08-02' },
    ],
  })
  const labor = aggregatePayrollCostFromReport(report)
  assert.equal(labor.total, report.dashboard.netSalary)
  const viaMonth = computePayrollCostByBranch({
    fromDate: '2026-08-01',
    toDate: '2026-08-15',
    employees,
    invoices: report.rows.length ? [{
      id: 'inv1', date: '2026-08-02', branchId: 'soc-trang', employeeId: 'e1',
      supportEmployeeId: '', status: 'completed',
      services: [{ serviceId: 'goi-sach', name: 'Gội', price: 100000, quantity: 1, commissionPercent: 20 }],
      tips: 10000, discountAmount: 0,
    }] : [],
    attendanceRecords: [],
    adjustments: [
      { id: 'a1', employeeId: 'e1', branchId: 'soc-trang', type: 'bonus', amount: 50000, month: '2026-08', date: '2026-08-02' },
      { id: 'a2', employeeId: 'e1', branchId: 'soc-trang', type: 'kpi', amount: -10000, month: '2026-08', date: '2026-08-02' },
    ],
    month: '2026-08',
    cycle: PAY_CYCLES.PERIOD_1,
  })
  assert.equal(viaMonth.total, report.dashboard.netSalary)

  const row = report.rows[0]
  assert.ok(row)
  const exportRow = mapPayrollRowForExport(row)
  const before = buildGovernanceSnapshot({
    label: 'b',
    employeeId: row.employeeId,
    branchId: 'soc-trang',
    report,
    payrollCost: labor,
    expensesTotal: 0,
    exportRow,
  })
  // Simulate SET kpi 0 → 100000 delta on same snapshot structure
  const afterReport = {
    ...report,
    rows: report.rows.map((r) => (r.employeeId === row.employeeId
      ? { ...r, kpi: (r.kpi ?? 0) + 100000, netSalary: r.netSalary + 100000 }
      : r)),
    dashboard: {
      ...report.dashboard,
      kpi: (report.dashboard.kpi ?? 0) + 100000,
      netSalary: report.dashboard.netSalary + 100000,
    },
  }
  const afterLabor = aggregatePayrollCostFromReport(afterReport)
  const after = buildGovernanceSnapshot({
    label: 'a',
    employeeId: row.employeeId,
    branchId: 'soc-trang',
    report: afterReport,
    payrollCost: afterLabor,
    expensesTotal: 0,
    exportRow: mapPayrollRowForExport(afterReport.rows[0]),
  })
  const diff = diffGovernance(before, after)
  const source = assertOneSource(diff, 100000)
  assert.equal(source.ok, true, JSON.stringify(source.checks.filter((c) => !c.ok)))
})

check('SoT: profit = actualRevenue − labor − expenses', () => {
  assert.equal(computeProfitAmount(1_000_000, 400_000, 100_000), 500_000)
})

// ─── Audit contract (impact helpers exist; log is event source) ────────────
check('Audit: board fields include giam luong SET (bonus/kpi/reduction) plus line items', () => {
  assert.deepEqual(
    [...ADMIN_EDITABLE_ADJUSTMENT_TYPES].sort(),
    ['advance', 'bonus', 'kpi', 'penalty', 'reduction'].sort(),
  )
})

const failed = results.filter((r) => !r.ok)
console.log(`\nOffline regression: ${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.error(failed)
  process.exit(1)
}
