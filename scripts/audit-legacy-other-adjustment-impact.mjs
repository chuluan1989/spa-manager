/**
 * READ-ONLY — thống kê legacy “Điều chỉnh khác” và ảnh hưởng nếu bỏ khỏi công thức net.
 *   npx vite-node --env-file=.env.development.local scripts/audit-legacy-other-adjustment-impact.mjs
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

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/admin-payroll-board-local/set-totals/remove-other-adjustment')
mkdirSync(OUT, { recursive: true })

const { fetchEmployeesFiltered } = await import('../src/repositories/employeesRepository.js')
const { fetchAttendanceFiltered } = await import('../src/repositories/attendanceRepository.js')
const { fetchInvoicesFiltered } = await import('../src/repositories/invoicesRepository.js')
const { fetchPayrollAdjustments } = await import('../src/repositories/payrollRepository.js')
const { normalizeEmployee } = await import('../src/utils/employeeStorage.js')
const { computePayrollReport } = await import('../src/utils/payrollEngine.js')
const { getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { getBranchName } = await import('../src/utils/branchStorage.js')
const { PAYROLL_ADJUSTMENT_TYPES } = await import('../src/constants/payrollTypes.js')

const PERIODS = [
  { month: '2026-07', cycle: PAY_CYCLES.PERIOD_1, label: '2026-07 Kỳ 1' },
  { month: '2026-07', cycle: PAY_CYCLES.PERIOD_2, label: '2026-07 Kỳ 2' },
  { month: '2026-08', cycle: PAY_CYCLES.PERIOD_1, label: '2026-08 Kỳ 1' },
]

const employees = (await fetchEmployeesFiltered({}) ?? []).map((r) => normalizeEmployee(r))
const legacyRows = []
const thuHuong = []

for (const period of PERIODS) {
  const { fromDate, toDate } = getPayPeriodRange(period.month, period.cycle)
  const attendanceCycle = period.cycle === PAY_CYCLES.PERIOD_2 ? PAY_CYCLES.FULL : PAY_CYCLES.PERIOD_1
  const ar = getPayPeriodRange(period.month, attendanceCycle)
  const [invoices, attendance, adjustments] = await Promise.all([
    fetchInvoicesFiltered({ fromDate, toDate, branchId: '', employeeId: '' }),
    fetchAttendanceFiltered({ fromDate: ar.fromDate, toDate: ar.toDate, branchId: '', employeeId: '' }),
    fetchPayrollAdjustments({ month: period.month }),
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

  for (const row of report.rows) {
    const oa = Number(row.otherAdjustment ?? 0)
    if (oa === 0) continue
    // Sau khi bỏ ĐC khỏi công thức: row.netSalary = net KHÔNG gồm ĐC.
    // Net cũ (khi còn cộng ĐC) = net hiện tại + oa.
    const netWithout = Number(row.netSalary ?? 0)
    const netWith = netWithout + oa
    const entry = {
      employee: row.employeeName,
      employeeId: row.employeeId,
      branch: getBranchName(row.branchId) || row.branchId,
      period: period.label,
      month: period.month,
      cycle: period.cycle,
      otherAdjustment: oa,
      bonus: Number(row.bonus ?? 0),
      kpi: Number(row.kpi ?? 0),
      penalty: Number(row.penalty ?? 0),
      advance: Number(row.advance ?? 0),
      netWithOtherAdjustment: netWith,
      netWithoutOtherAdjustment: netWithout,
      netDeltaIfRemoved: netWithout - netWith,
      stillInFormulaToday: false,
      note: 'ĐC vẫn lưu trên payrollRow/DB để audit; không còn cộng vào net vận hành.',
    }
    legacyRows.push(entry)
    if (/Thu Hương/i.test(row.employeeName)) thuHuong.push(entry)
  }
}

const rawLines = []
for (const month of ['2026-07', '2026-08']) {
  const adjustments = await fetchPayrollAdjustments({ month }) ?? []
  for (const row of adjustments) {
    if (row.type !== PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT) continue
    if (Number(row.amount ?? 0) === 0) continue
    rawLines.push({
      id: row.id,
      employee: row.employeeName,
      employeeId: row.employeeId,
      branchId: row.branchId,
      month: row.month,
      date: row.date,
      amount: Number(row.amount ?? 0),
      note: row.note || '',
      reason: row.reason || '',
    })
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  meaning:
    'Trước khi khóa phạm vi: otherAdjustment được cộng vào net. '
    + 'Sau khóa: otherAdjustment vẫn tính trên payrollRow (audit/legacy) nhưng KHÔNG cộng vào net. '
    + 'netWith = netWithout + otherAdjustment; netWithout = lương thực nhận vận hành mới. Dòng DB không bị xóa.',
  employeePeriodsWithOtherAdjustment: legacyRows.length,
  totalOtherAdjustmentAmount: legacyRows.reduce((s, r) => s + r.otherAdjustment, 0),
  totalNetImpactIfRemovedFromFormula: legacyRows.reduce((s, r) => s + r.netDeltaIfRemoved, 0),
  thuHuong,
  byPeriod: PERIODS.map((p) => {
    const rows = legacyRows.filter((r) => r.period === p.label)
    return {
      period: p.label,
      count: rows.length,
      sumOtherAdjustment: rows.reduce((s, r) => s + r.otherAdjustment, 0),
      employees: rows.map((r) => ({
        employee: r.employee,
        branch: r.branch,
        otherAdjustment: r.otherAdjustment,
        netWith: r.netWithOtherAdjustment,
        netWithout: r.netWithoutOtherAdjustment,
      })),
    }
  }),
  rawNonZeroAdjustmentLines: rawLines,
}

function csvEscape(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = [
  ['Nhân viên', 'Chi nhánh', 'Kỳ', 'Điều chỉnh khác', 'Net hiện tại (có ĐC)', 'Net nếu bỏ ĐC', 'Chênh lệch net'].join(','),
  ...legacyRows.map((r) => [
    r.employee, r.branch, r.period, r.otherAdjustment,
    r.netWithOtherAdjustment, r.netWithoutOtherAdjustment, r.netDeltaIfRemoved,
  ].map(csvEscape).join(',')),
].join('\n')

writeFileSync(path.join(OUT, 'LEGACY_OTHER_ADJUSTMENT_IMPACT.csv'), `${csv}\n`)
writeFileSync(path.join(OUT, 'LEGACY_OTHER_ADJUSTMENT_IMPACT.json'), JSON.stringify(summary, null, 2))
writeFileSync(path.join(OUT, 'LEGACY_OTHER_ADJUSTMENT_RAW_LINES.json'), JSON.stringify(rawLines, null, 2))
console.log(JSON.stringify({
  count: legacyRows.length,
  totalOA: summary.totalOtherAdjustmentAmount,
  totalNetDelta: summary.totalNetImpactIfRemovedFromFormula,
  thuHuong,
  byPeriod: summary.byPeriod,
}, null, 2))
