/**
 * Audit toàn hệ thống — cột "Hiện tại" popup Sửa bảng lương vs bảng lương.
 *
 * READ-ONLY: không ghi DB, không sửa nhân viên vận hành.
 *
 * So sánh:
 * - Ngoài bảng = payrollRow đang render (engine)
 * - Popup SAU sửa = currentTotalsFromPayrollRow(payrollRow)  → phải khớp 100%
 * - Popup TRƯỚC sửa = cộng adjustments theo type (logic cũ) → đếm mismatch lịch sử
 *
 * Chạy:
 *   node --env-file=.env.development.local scripts/audit-payroll-edit-popup-bind.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function createStorage() {
  const store = new Map()
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}
globalThis.localStorage = createStorage()
globalThis.sessionStorage = createStorage()

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/admin-payroll-board-local/set-totals/remove-other-adjustment')
mkdirSync(OUT, { recursive: true })

const { isSupabaseConfigured } = await import('../src/lib/supabaseClient.js')
const { fetchEmployeesFiltered } = await import('../src/repositories/employeesRepository.js')
const { fetchAttendanceFiltered } = await import('../src/repositories/attendanceRepository.js')
const { fetchInvoicesFiltered } = await import('../src/repositories/invoicesRepository.js')
const { fetchPayrollAdjustments } = await import('../src/repositories/payrollRepository.js')
const { normalizeEmployee } = await import('../src/utils/employeeStorage.js')
const { computePayrollReport } = await import('../src/utils/payrollEngine.js')
const { getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { getBranchName } = await import('../src/utils/branchStorage.js')
const { PAYROLL_ADJUSTMENT_TYPES } = await import('../src/constants/payrollTypes.js')

/** Cùng logic popup sau sửa — bind từ payrollRow (không import JSX). */
function currentTotalsFromPayrollRow(payrollRow) {
  if (!payrollRow) return null
  return {
    [PAYROLL_ADJUSTMENT_TYPES.BONUS]: Number(payrollRow.bonus ?? 0),
    [PAYROLL_ADJUSTMENT_TYPES.KPI]: Number(payrollRow.kpi ?? 0),
    [PAYROLL_ADJUSTMENT_TYPES.PENALTY]: Number(payrollRow.penalty ?? 0),
    [PAYROLL_ADJUSTMENT_TYPES.ADVANCE]: Number(payrollRow.advance ?? 0),
  }
}

if (!isSupabaseConfigured) {
  console.error('Supabase chưa cấu hình')
  process.exit(1)
}

const PERIODS = [
  { month: '2026-07', cycle: PAY_CYCLES.PERIOD_1, label: '2026-07 Kỳ 1' },
  { month: '2026-07', cycle: PAY_CYCLES.PERIOD_2, label: '2026-07 Kỳ 2' },
  { month: '2026-08', cycle: PAY_CYCLES.PERIOD_1, label: '2026-08 Kỳ 1' },
]

const FIELD_META = [
  { type: PAYROLL_ADJUSTMENT_TYPES.BONUS, boardKey: 'bonus', label: 'Thưởng' },
  { type: PAYROLL_ADJUSTMENT_TYPES.KPI, boardKey: 'kpi', label: 'KPI' },
  { type: PAYROLL_ADJUSTMENT_TYPES.PENALTY, boardKey: 'penalty', label: 'Phạt' },
  { type: PAYROLL_ADJUSTMENT_TYPES.ADVANCE, boardKey: 'advance', label: 'Ứng lương' },
]

/** Logic CŨ — popup tự cộng adjustments (gây lệch với bảng). */
function oldPopupTotalsFromAdjustments(adjustments, employeeId, fromDate, toDate) {
  const totals = {}
  for (const { type } of FIELD_META) {
    totals[type] = (adjustments ?? []).reduce((sum, row) => {
      if (row.employeeId !== employeeId) return sum
      if (row.type !== type) return sum
      if (fromDate && row.date < fromDate) return sum
      if (toDate && row.date > toDate) return sum
      return sum + Number(row.amount ?? 0)
    }, 0)
  }
  return totals
}

function csvEscape(value) {
  const s = String(value ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const employees = (await fetchEmployeesFiltered({}) ?? []).map((row) => normalizeEmployee(row))
console.log(`Employees loaded: ${employees.length}`)

const allRows = []
const mismatchedFieldsBefore = []
const mismatchedFieldsAfter = []
let mismatchEmployeePeriodsBefore = 0
let mismatchEmployeePeriodsAfter = 0

for (const period of PERIODS) {
  const { fromDate, toDate } = getPayPeriodRange(period.month, period.cycle)
  const attendanceCycle = period.cycle === PAY_CYCLES.PERIOD_2 ? PAY_CYCLES.FULL : PAY_CYCLES.PERIOD_1
  const attendanceRange = getPayPeriodRange(period.month, attendanceCycle)

  console.log(`\n→ ${period.label}  invoices ${fromDate}→${toDate}  attendance ${attendanceRange.fromDate}→${attendanceRange.toDate}`)

  const [invoices, attendance, adjustments] = await Promise.all([
    fetchInvoicesFiltered({ fromDate, toDate, branchId: '', employeeId: '' }),
    fetchAttendanceFiltered({
      fromDate: attendanceRange.fromDate,
      toDate: attendanceRange.toDate,
      branchId: '',
      employeeId: '',
    }),
    fetchPayrollAdjustments({ month: period.month, branchId: '', employeeId: '' }),
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

  console.log(`   report rows: ${report.rows.length}`)

  for (const row of report.rows) {
    const board = {
      bonus: Number(row.bonus ?? 0),
      kpi: Number(row.kpi ?? 0),
      penalty: Number(row.penalty ?? 0),
      advance: Number(row.advance ?? 0),
    }
    const popupAfter = currentTotalsFromPayrollRow(row)
    const popupBefore = oldPopupTotalsFromAdjustments(
      adjustments ?? [],
      row.employeeId,
      fromDate,
      toDate,
    )

    const fieldResults = {}
    let rowMismatchBefore = false
    let rowMismatchAfter = false

    for (const meta of FIELD_META) {
      const outside = board[meta.boardKey]
      const after = Number(popupAfter?.[meta.type] ?? 0)
      const before = Number(popupBefore[meta.type] ?? 0)
      const matchAfter = outside === after
      const matchBefore = outside === before
      fieldResults[meta.label] = {
        outside,
        popupBefore: before,
        popupAfter: after,
        matchBefore,
        matchAfter,
      }
      if (!matchBefore) {
        rowMismatchBefore = true
        mismatchedFieldsBefore.push({
          employee: row.employeeName,
          branch: getBranchName(row.branchId) || row.branchId,
          period: period.label,
          field: meta.label,
          outside,
          popup: before,
          delta: before - outside,
        })
      }
      if (!matchAfter) {
        rowMismatchAfter = true
        mismatchedFieldsAfter.push({
          employee: row.employeeName,
          branch: getBranchName(row.branchId) || row.branchId,
          period: period.label,
          field: meta.label,
          outside,
          popup: after,
          delta: after - outside,
        })
      }
    }

    if (rowMismatchBefore) mismatchEmployeePeriodsBefore += 1
    if (rowMismatchAfter) mismatchEmployeePeriodsAfter += 1

    allRows.push({
      employee: row.employeeName,
      employeeId: row.employeeId,
      branch: getBranchName(row.branchId) || row.branchId || '',
      branchId: row.branchId || '',
      period: period.label,
      month: period.month,
      cycle: period.cycle,
      thưởng_ngoài: fieldResults.Thưởng.outside,
      thưởng_popup_trước: fieldResults.Thưởng.popupBefore,
      thưởng_popup_sau: fieldResults.Thưởng.popupAfter,
      kpi_ngoài: fieldResults.KPI.outside,
      kpi_popup_trước: fieldResults.KPI.popupBefore,
      kpi_popup_sau: fieldResults.KPI.popupAfter,
      phạt_ngoài: fieldResults.Phạt.outside,
      phạt_popup_trước: fieldResults.Phạt.popupBefore,
      phạt_popup_sau: fieldResults.Phạt.popupAfter,
      ứng_ngoài: fieldResults['Ứng lương'].outside,
      ứng_popup_trước: fieldResults['Ứng lương'].popupBefore,
      ứng_popup_sau: fieldResults['Ứng lương'].popupAfter,
      khớp_trước_sửa: rowMismatchBefore ? 'LỆCH' : 'KHỚP',
      khớp_sau_sửa: rowMismatchAfter ? 'LỆCH' : 'KHỚP',
      hasBonus: board.bonus !== 0,
      hasKpiPlus: board.kpi > 0,
      hasKpiMinus: board.kpi < 0,
      hasPenalty: board.penalty !== 0,
      hasAdvance: board.advance !== 0,
      hasCrossBranch: Array.isArray(row.branchSections) && row.branchSections.length > 1,
      hasNoAdjFields: (
        board.bonus === 0 && board.kpi === 0 && board.penalty === 0 && board.advance === 0
      ),
      legacyOtherAdjustment: Number(row.otherAdjustment ?? 0),
      attendancePenalty: Number(row.attendancePenalty ?? 0),
      netSalary: Number(row.netSalary ?? 0),
      ticketRevenue: Number(row.ticketRevenue ?? 0),
      tips: Number(row.tips ?? 0),
      commission: Number(row.commission ?? 0),
      workDays: Number(row.workDays ?? 0),
    })
  }
}

const csvHeader = [
  'Nhân viên', 'Chi nhánh', 'Kỳ lương',
  'Thưởng ngoài bảng', 'Thưởng popup (trước)', 'Thưởng popup (sau)',
  'KPI ngoài bảng', 'KPI popup (trước)', 'KPI popup (sau)',
  'Phạt ngoài bảng', 'Phạt popup (trước)', 'Phạt popup (sau)',
  'Ứng ngoài bảng', 'Ứng popup (trước)', 'Ứng popup (sau)',
  'Kết quả trước sửa', 'Kết quả sau sửa',
]

const csvLines = [csvHeader.join(',')]
for (const r of allRows) {
  csvLines.push([
    r.employee, r.branch, r.period,
    r.thưởng_ngoài, r.thưởng_popup_trước, r.thưởng_popup_sau,
    r.kpi_ngoài, r.kpi_popup_trước, r.kpi_popup_sau,
    r.phạt_ngoài, r.phạt_popup_trước, r.phạt_popup_sau,
    r.ứng_ngoài, r.ứng_popup_trước, r.ứng_popup_sau,
    r.khớp_trước_sửa, r.khớp_sau_sửa,
  ].map(csvEscape).join(','))
}

writeFileSync(path.join(OUT, 'POPUP_BIND_AUDIT_4FIELDS.csv'), `${csvLines.join('\n')}\n`, 'utf8')

const pick = (pred) => allRows.find(pred) || null
const samples = {
  withPenalty: pick((r) => r.hasPenalty),
  withBonus: pick((r) => r.hasBonus),
  withAdvance: pick((r) => r.hasAdvance),
  withKpiPlus: pick((r) => r.hasKpiPlus),
  withKpiMinus: pick((r) => r.hasKpiMinus),
  crossBranch: pick((r) => r.hasCrossBranch),
  noAdj: pick((r) => r.hasNoAdjFields),
}

const summary = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  periods: PERIODS.map((p) => p.label),
  employeePeriodsChecked: allRows.length,
  uniqueEmployees: new Set(allRows.map((r) => r.employeeId)).size,
  mismatchEmployeePeriodsBefore,
  mismatchEmployeePeriodsAfter,
  mismatchedFieldCountBefore: mismatchedFieldsBefore.length,
  mismatchedFieldCountAfter: mismatchedFieldsAfter.length,
  passLocalBind: mismatchEmployeePeriodsAfter === 0 && mismatchedFieldsAfter.length === 0,
  mismatchedFieldsBefore: mismatchedFieldsBefore.slice(0, 200),
  mismatchedFieldsAfter,
  sampleCoverage: Object.fromEntries(
    Object.entries(samples).map(([k, v]) => [k, v ? {
      employee: v.employee,
      branch: v.branch,
      period: v.period,
      khớp_sau_sửa: v.khớp_sau_sửa,
    } : null]),
  ),
  csv: 'docs/uat-evidence/admin-payroll-board-local/set-totals/remove-other-adjustment/POPUP_BIND_AUDIT_4FIELDS.csv',
}

writeFileSync(path.join(OUT, 'POPUP_BIND_AUDIT_SUMMARY.json'), JSON.stringify(summary, null, 2))
writeFileSync(
  path.join(OUT, 'MISMATCH_FIELDS_BEFORE.json'),
  JSON.stringify(mismatchedFieldsBefore, null, 2),
)

console.log('\n========== SUMMARY ==========')
console.log(`Employee-periods checked: ${allRows.length}`)
console.log(`Mismatch TRƯỚC sửa: ${mismatchEmployeePeriodsBefore} rows / ${mismatchedFieldsBefore.length} field diffs`)
console.log(`Mismatch SAU sửa:   ${mismatchEmployeePeriodsAfter} rows / ${mismatchedFieldsAfter.length} field diffs`)
console.log(`PASS bind (mismatch after = 0): ${summary.passLocalBind}`)
console.log(`CSV: ${summary.csv}`)
process.exit(summary.passLocalBind ? 0 : 1)
