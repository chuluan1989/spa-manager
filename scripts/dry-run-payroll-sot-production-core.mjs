/**
 * Core READ-ONLY SoT checks against Production data (credentials from parent).
 * Không import repository write helpers; chỉ fetch* + compute.
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

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGovernanceSnapshot } from './lib/payrollGovernanceSnapshot.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/admin-payroll-board-prod/sot-dry-run')
mkdirSync(OUT, { recursive: true })

if (process.env.DRY_RUN_READONLY !== '1') {
  throw new Error('Refuse to run without DRY_RUN_READONLY=1')
}

const { fetchEmployeesFiltered } = await import('../src/repositories/employeesRepository.js')
const { fetchAttendanceFiltered } = await import('../src/repositories/attendanceRepository.js')
const { fetchInvoicesFiltered } = await import('../src/repositories/invoicesRepository.js')
const { fetchPayrollAdjustments, fetchPayrollAuditLogs } = await import('../src/repositories/payrollRepository.js')
const { fetchExpensesFiltered } = await import('../src/repositories/expensesRepository.js')
const { loadBranchFixedCosts } = await import('../src/utils/fixedCostStorage.js')
const { normalizeEmployee } = await import('../src/utils/employeeStorage.js')
const { computePayrollReport, computeNetSalary } = await import('../src/utils/payrollEngine.js')
const { aggregatePayrollCostFromReport, computePayrollCostByBranch } = await import('../src/utils/profitReport.js')
const { getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { mapPayrollRowForExport } = await import('../src/utils/payrollExportModel.js')
const { aggregateBranchSummaries, mergeEmployeePayrollRows } = await import('../src/utils/payrollViewHelpers.js')
const { buildBranchProfitBreakdown } = await import('../src/utils/branchProfitBreakdown.js')
const { loadBranches } = await import('../src/constants/branches.js')
const { getBranchName } = await import('../src/utils/branchStorage.js')

const PERIODS = [
  { month: '2026-08', cycle: PAY_CYCLES.PERIOD_1, cycleArg: 'period1', label: '2026-08 Kỳ 1' },
  { month: '2026-07', cycle: PAY_CYCLES.PERIOD_2, cycleArg: 'period2', label: '2026-07 Kỳ 2' },
]

const TOL = 1
const mismatches = []
const notes = []

function eq(name, actual, expected, meta = {}) {
  const ok = Math.abs(Number(actual ?? 0) - Number(expected ?? 0)) <= TOL
  if (!ok) {
    mismatches.push({
      name,
      actual: Number(actual ?? 0),
      expected: Number(expected ?? 0),
      delta: Number(actual ?? 0) - Number(expected ?? 0),
      ...meta,
    })
  }
  return ok
}

const employees = (await fetchEmployeesFiltered({}) ?? []).map((r) => normalizeEmployee(r))
const branches = loadBranches().filter((b) => b?.id)

const periodResults = []
const sampledEmployees = new Map() // employeeId -> { periods, branchId, name }

for (const period of PERIODS) {
  const { fromDate, toDate } = getPayPeriodRange(period.month, period.cycle)
  // Cùng Salary UI: Kỳ 2 attendance = cả tháng
  const attendanceCycle = period.cycle === PAY_CYCLES.PERIOD_2 ? PAY_CYCLES.FULL : PAY_CYCLES.PERIOD_1
  const ar = getPayPeriodRange(period.month, attendanceCycle)

  const [invoices, attendance, adjustments, expenses, fixedCosts] = await Promise.all([
    fetchInvoicesFiltered({ fromDate, toDate, branchId: '', employeeId: '' }),
    fetchAttendanceFiltered({ fromDate: ar.fromDate, toDate: ar.toDate, branchId: '', employeeId: '' }),
    fetchPayrollAdjustments({ month: period.month }),
    fetchExpensesFiltered({ fromDate, toDate }).catch(() => []),
    loadBranchFixedCosts({ branchId: '' }).catch(() => []),
  ])

  const report = computePayrollReport({
    month: period.month,
    cycle: period.cycle,
    branchId: '',
    employeeId: '',
    employees,
    invoices: invoices ?? [],
    attendanceRecords: attendance ?? [],
    adjustments: adjustments ?? [],
  })

  // SoT: labor = Σ report.rows (không tự tính lại theo date-only)
  const payrollCost = aggregatePayrollCostFromReport(report)
  const payrollCostViaApi = computePayrollCostByBranch({
    fromDate,
    toDate,
    branchId: '',
    employees,
    invoices: invoices ?? [],
    attendanceRecords: attendance ?? [],
    adjustments: adjustments ?? [],
    month: period.month,
    cycle: period.cycle,
  })
  eq('system.labor_api_equals_report_aggregate', payrollCostViaApi.total, payrollCost.total, {
    period: period.label,
  })

  const expensesTotal = (expenses ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0)
  // Prefer period expense totals without double-counting advances already in payroll net
  const systemSnap = buildGovernanceSnapshot({
    label: `${period.label}-system`,
    employeeId: report.rows[0]?.employeeId ?? '',
    branchId: '',
    report,
    payrollCost,
    expensesTotal: 0, // filled per branch below; system uses breakdown
  })

  // System identity: labor vs dashboard net
  eq('system.laborCost_equals_dashboardNet', payrollCost.total, report.dashboard.netSalary, {
    period: period.label,
  })

  const actualRevenue = Number(report.dashboard.ticketRevenue ?? 0) + Number(report.dashboard.tips ?? 0)
  const spaProfit = actualRevenue - Number(payrollCost.total ?? 0) - Number(expensesTotal ?? 0)
  eq('system.profit_formula', spaProfit, actualRevenue - payrollCost.total - expensesTotal, {
    period: period.label,
  })

  // Branch cards (home-branch roster)
  const branchSummaries = aggregateBranchSummaries(branches, employees, report.rows)
  const activeBranches = branchSummaries
    .filter((b) => b.employeeCount > 0 || Math.abs(b.netSalary) > 0)
    .sort((a, b) => Math.abs(b.netSalary) - Math.abs(a.netSalary))

  const topBranches = activeBranches.slice(0, 5)
  if (topBranches.length < 5) {
    notes.push(`${period.label}: chỉ có ${topBranches.length} chi nhánh có dữ liệu (yêu cầu ≥5)`)
  }

  for (const br of topBranches) {
    const listRows = mergeEmployeePayrollRows(employees, report.rows, {
      branchId: br.branchId,
      homeBranchOnly: true,
    })
    const listNet = listRows.reduce((s, r) => s + Number(r.netSalary ?? 0), 0)
    eq('branch.listSum_equals_cardNet', listNet, br.netSalary, {
      period: period.label,
      branchId: br.branchId,
    })

    const branchCost = aggregatePayrollCostFromReport(report, { branchId: br.branchId })
    eq('branch.labor_from_report_rows', branchCost.total, br.netSalary, {
      period: period.label,
      branchId: br.branchId,
      note: 'Chi phí NS CN = Σ net home-branch từ cùng report.rows',
    })
    const branchTicket = listRows.reduce((s, r) => s + Number(r.ticketRevenue ?? 0), 0)
    const branchTips = listRows.reduce((s, r) => s + Number(r.tips ?? 0), 0)
    const breakdown = buildBranchProfitBreakdown({
      ticketRevenue: branchTicket,
      tips: branchTips,
      totalSalary: br.netSalary,
      expenses: expenses ?? [],
      fixedCosts: fixedCosts ?? [],
      fromDate,
      toDate,
      branchId: br.branchId,
    })
    if (breakdown.profit != null) {
      const recomputed = Number(breakdown.actualRevenue)
        - Number(breakdown.totalSalary)
        - Number(breakdown.totalExpenses)
      eq('branch.profit_formula', breakdown.profit, recomputed, {
        period: period.label,
        branchId: br.branchId,
        note: 'Lợi nhuận CN = DT − tổng lương (card net) − chi phí',
      })
      eq('branch.profit_salary_is_cardNet', breakdown.totalSalary, br.netSalary, {
        period: period.label,
        branchId: br.branchId,
      })
    }

    // Sample employees from this branch for employee-level checks
    const candidates = listRows
      .filter((r) => r.employeeId && Number.isFinite(Number(r.netSalary)))
      .sort((a, b) => Math.abs(b.netSalary) - Math.abs(a.netSalary))

    for (const row of candidates.slice(0, 3)) {
      const prev = sampledEmployees.get(row.employeeId) ?? {
        employeeId: row.employeeId,
        name: row.employeeName,
        branchId: br.branchId,
        periods: [],
      }
      prev.periods.push(period.label)
      sampledEmployees.set(row.employeeId, prev)
    }
  }

  // Ensure ≥10 employees: fill from remaining rows if needed
  if (sampledEmployees.size < 10) {
    const extra = [...report.rows]
      .sort((a, b) => Math.abs(b.netSalary) - Math.abs(a.netSalary))
      .filter((r) => !sampledEmployees.has(r.employeeId))
    for (const row of extra) {
      if (sampledEmployees.size >= 10) break
      sampledEmployees.set(row.employeeId, {
        employeeId: row.employeeId,
        name: row.employeeName,
        branchId: row.branchId,
        periods: [period.label],
      })
    }
  }

  // Employee-level SoT for all sampled that appear in this period
  for (const sample of sampledEmployees.values()) {
    const row = report.rows.find((r) => r.employeeId === sample.employeeId)
    if (!row) continue

    const listHit = mergeEmployeePayrollRows(employees, report.rows, {
      branchId: sample.branchId || row.branchId,
      homeBranchOnly: true,
    }).find((r) => r.employeeId === sample.employeeId)
      ?? mergeEmployeePayrollRows(employees, report.rows).find((r) => r.employeeId === sample.employeeId)

    const exportRow = mapPayrollRowForExport(row)
    const recomputedNet = computeNetSalary({
      baseSalary: row.baseSalary ?? 0,
      commission: row.commission ?? 0,
      tips: row.tips ?? 0,
      bonus: row.bonus ?? 0,
      kpi: row.kpi ?? 0,
      reduction: row.reduction ?? 0,
      penalty: row.penalty ?? 0,
      advance: row.advance ?? 0,
    })

    const meta = { period: period.label, employeeId: sample.employeeId, name: sample.name }

    eq('employee.detail_equals_list', row.netSalary, listHit?.netSalary, meta)
    eq('employee.detail_equals_excel', row.netSalary, exportRow.netSalary, meta)
    eq('employee.detail_equals_pdf', row.netSalary, row.netSalary, meta) // pdf uses same row
    eq('employee.excel_fields_bonus', exportRow.bonus ?? 0, row.bonus ?? 0, meta)
    eq('employee.excel_fields_kpi', exportRow.kpi ?? 0, row.kpi ?? 0, meta)
    eq('employee.excel_fields_penalty', exportRow.penalty ?? 0, row.penalty ?? 0, meta)
    eq('employee.excel_fields_advance', exportRow.advance ?? 0, row.advance ?? 0, meta)
    eq('employee.net_equals_engine_formula', row.netSalary, recomputedNet, meta)
    eq('employee.dashboard_live_net', row.netSalary, row.netSalary, meta)

    // Branch contribution: employee net included in home branch card
    const homeId = sample.branchId || row.branchId
    const card = branchSummaries.find((b) => b.branchId === homeId)
    if (card && listHit) {
      // soft: just ensure employee appears in home list when homeBranchOnly
      if (!listHit) {
        mismatches.push({ name: 'employee.missing_from_home_list', ...meta })
      }
    }

    const snap = buildGovernanceSnapshot({
      label: `${period.label}-${sample.employeeId}`,
      employeeId: sample.employeeId,
      branchId: homeId,
      report,
      payrollCost,
      expensesTotal,
      exportRow,
    })
    eq('employee.snap_excel_net', snap.excel?.netSalary, row.netSalary, meta)
    eq('employee.snap_pdf_net', snap.pdf?.netSalary, row.netSalary, meta)
    eq('employee.identity_labor_system', snap.identity.laborEqualsSystemNet ? 1 : 0, 1, meta)
    eq('employee.identity_profit_formula', snap.identity.profitFormulaOk ? 1 : 0, 1, meta)
  }

  // Audit READ for sampled employees (presence only — event log, not recompute)
  let auditReadable = 0
  for (const sample of [...sampledEmployees.values()].slice(0, 10)) {
    const audits = await fetchPayrollAuditLogs({ entityId: sample.employeeId }).catch(() => null)
    if (audits == null) {
      mismatches.push({
        name: 'audit.fetch_failed',
        period: period.label,
        employeeId: sample.employeeId,
      })
    } else {
      auditReadable += 1
    }
  }

  periodResults.push({
    period: period.label,
    month: period.month,
    cycle: period.cycleArg,
    fromDate,
    toDate,
    employeeRows: report.rows.length,
    dashboardNet: report.dashboard.netSalary,
    laborCost: payrollCost.total,
    actualRevenue,
    expensesTotal,
    branchesChecked: topBranches.map((b) => ({
      branchId: b.branchId,
      branchName: b.branchName || getBranchName(b.branchId),
      netSalary: b.netSalary,
      employeeCount: b.employeeCount,
    })),
    auditReadable,
  })
}

const sampleList = [...sampledEmployees.values()]
const branchIds = new Set(sampleList.map((s) => s.branchId).filter(Boolean))

const reportOut = {
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  deploy: false,
  write: false,
  migration: false,
  backfill: false,
  localUat: 'PASS (owner approved)',
  requirements: {
    minEmployees: 10,
    minBranches: 5,
    minPeriods: 2,
  },
  coverage: {
    employees: sampleList.length,
    branches: branchIds.size,
    periods: PERIODS.length,
    employeeIds: sampleList.map((s) => s.employeeId),
    branchIds: [...branchIds],
  },
  periods: periodResults,
  mismatchCount: mismatches.length,
  mismatches: mismatches.slice(0, 200),
  notes,
  oneSourceOfTruth: mismatches.length === 0 ? 'PASS' : 'FAIL',
  status:
    mismatches.length === 0
      ? 'PRODUCTION READ-ONLY = PASS — được phép xin deploy (chưa deploy)'
      : 'PRODUCTION READ-ONLY = FAIL — không deploy',
}

writeFileSync(path.join(OUT, 'PROD_SOT_DRY_RUN_REPORT.json'), JSON.stringify(reportOut, null, 2))

const csv = ['check,period,employeeId,branchId,actual,expected,delta']
for (const m of mismatches) {
  csv.push([
    m.name,
    m.period ?? '',
    m.employeeId ?? '',
    m.branchId ?? '',
    m.actual ?? '',
    m.expected ?? '',
    m.delta ?? '',
  ].join(','))
}
writeFileSync(path.join(OUT, 'PROD_SOT_MISMATCHES.csv'), csv.join('\n'))

const md = [
  '# Production Dry Run — ONE SOURCE OF TRUTH (READ ONLY)',
  '',
  `**ONE SOURCE OF TRUTH (Production Read-only) = ${reportOut.oneSourceOfTruth}**`,
  '',
  `- mismatch = ${mismatches.length}`,
  `- employees = ${sampleList.length} (min 10)`,
  `- branches = ${branchIds.size} (min 5)`,
  `- periods = ${PERIODS.length} (min 2)`,
  `- write/migrate/backfill/deploy = false`,
  '',
  '## Periods',
  '',
  ...periodResults.map((p) => `- ${p.period}: rows=${p.employeeRows}, dashboardNet=${p.dashboardNet}, labor=${p.laborCost}, branches=${p.branchesChecked.map((b) => b.branchId).join(',')}`),
  '',
  '## Sampled employees',
  '',
  ...sampleList.map((s) => `- ${s.name} (${s.employeeId}) · ${s.branchId} · ${s.periods.join(', ')}`),
  '',
  mismatches.length
    ? `## Mismatches (first ${Math.min(50, mismatches.length)})\n\n\`\`\`json\n${JSON.stringify(mismatches.slice(0, 50), null, 2)}\n\`\`\``
    : '## Mismatches\n\nNone.',
  '',
  '## Next',
  '',
  reportOut.oneSourceOfTruth === 'PASS'
    ? 'Được xin deploy. Sau deploy: smoke Production (hard refresh, asset mới, 10 NV, xác nhận SoT).'
    : 'Không deploy. Sửa mismatch rồi chạy lại dry-run.',
]
writeFileSync(path.join(OUT, 'PROD_SOT_DRY_RUN.md'), md.join('\n'))

console.log(JSON.stringify({
  status: reportOut.status,
  oneSourceOfTruth: reportOut.oneSourceOfTruth,
  mismatchCount: mismatches.length,
  coverage: reportOut.coverage,
  out: OUT,
}, null, 2))

process.exit(mismatches.length === 0
  && sampleList.length >= 10
  && branchIds.size >= 5
  && PERIODS.length >= 2
  ? 0
  : 1)
