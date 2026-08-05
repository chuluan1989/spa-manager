/**
 * Hướng 2 — chuyển legacy ĐC Thu Hương → Ứng lương (giữ bản ghi cũ, audit đầy đủ).
 *   npx vite-node --env-file=.env.development.local scripts/migrate-thu-huong-other-to-advance.mjs
 *
 * Ghi shared DB. Không deploy.
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
const OUT = path.join(
  ROOT,
  'docs/uat-evidence/admin-payroll-board-local/set-totals/remove-other-adjustment/migrate-thu-huong',
)
mkdirSync(OUT, { recursive: true })

const REASON = 'Chuyển khoản nhập nhầm từ Điều chỉnh khác sang Ứng lương theo ghi chú ngày 04/08.'
const NOTE = 'Ứng 500 ngày 4/8 — chuyển từ Điều chỉnh khác'
const EMPLOYEE_ID = 'bac-lieu-thu-huong'
const MONTH = '2026-08'
const CYCLE = 'period1'
const TRANSFER_AMOUNT = 500000

sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'admin',
  branch: 'all',
  username: 'admin',
}))

const { PAYROLL_ADJUSTMENT_TYPES } = await import('../src/constants/payrollTypes.js')
const { fetchEmployeesFiltered } = await import('../src/repositories/employeesRepository.js')
const { fetchAttendanceFiltered } = await import('../src/repositories/attendanceRepository.js')
const { fetchInvoicesFiltered } = await import('../src/repositories/invoicesRepository.js')
const { fetchPayrollAdjustments, fetchPayrollAuditLogs } = await import('../src/repositories/payrollRepository.js')
const { normalizeEmployee } = await import('../src/utils/employeeStorage.js')
const { computePayrollReport } = await import('../src/utils/payrollEngine.js')
const { getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { getBranchName } = await import('../src/utils/branchStorage.js')
const {
  editPayrollAdjustment,
  saveAdminPayrollBoardEdits,
  buildPayrollFieldAuditValues,
} = await import('../src/utils/payrollService.js')
const { insertPayrollAuditLog, createPayrollAuditId } = await import('../src/repositories/payrollRepository.js')
const { netSalaryImpactForFieldSet } = await import('../src/utils/payrollFieldAudit.js')

const { fromDate, toDate } = getPayPeriodRange(MONTH, PAY_CYCLES.PERIOD_1)
const attendanceRange = getPayPeriodRange(MONTH, PAY_CYCLES.PERIOD_1)

async function snapshot(label) {
  const employees = (await fetchEmployeesFiltered({}) ?? []).map((r) => normalizeEmployee(r))
  const [invoices, attendance, adjustments] = await Promise.all([
    fetchInvoicesFiltered({ fromDate, toDate, branchId: '', employeeId: '' }),
    fetchAttendanceFiltered({
      fromDate: attendanceRange.fromDate,
      toDate: attendanceRange.toDate,
      branchId: '',
      employeeId: '',
    }),
    fetchPayrollAdjustments({ month: MONTH }),
  ])
  const report = computePayrollReport({
    month: MONTH,
    cycle: CYCLE,
    branchId: '',
    employeeId: '',
    employees,
    invoices: invoices ?? [],
    attendanceRecords: attendance ?? [],
    adjustments: adjustments ?? [],
  })
  const row = report.rows.find((r) => r.employeeId === EMPLOYEE_ID)
  if (!row) throw new Error(`[${label}] Không tìm thấy Thu Hương trong báo cáo`)

  const empAdj = (adjustments ?? []).filter((a) => {
    if (a.employeeId !== EMPLOYEE_ID) return false
    if (a.date && (a.date < fromDate || a.date > toDate)) return false
    return true
  })

  const legacyNonZero = []
  for (const period of [
    { month: '2026-07', cycle: PAY_CYCLES.PERIOD_1, label: '2026-07 Kỳ 1' },
    { month: '2026-07', cycle: PAY_CYCLES.PERIOD_2, label: '2026-07 Kỳ 2' },
    { month: '2026-08', cycle: PAY_CYCLES.PERIOD_1, label: '2026-08 Kỳ 1' },
  ]) {
    const range = getPayPeriodRange(period.month, period.cycle)
    const ar = getPayPeriodRange(
      period.month,
      period.cycle === PAY_CYCLES.PERIOD_2 ? PAY_CYCLES.FULL : PAY_CYCLES.PERIOD_1,
    )
    const [inv, att, adj] = await Promise.all([
      fetchInvoicesFiltered({ fromDate: range.fromDate, toDate: range.toDate, branchId: '', employeeId: '' }),
      fetchAttendanceFiltered({ fromDate: ar.fromDate, toDate: ar.toDate, branchId: '', employeeId: '' }),
      fetchPayrollAdjustments({ month: period.month }),
    ])
    const rep = computePayrollReport({
      month: period.month,
      cycle: period.cycle,
      branchId: '',
      employeeId: '',
      employees,
      invoices: inv ?? [],
      attendanceRecords: att ?? [],
      adjustments: adj ?? [],
    })
    for (const r of rep.rows) {
      const oa = Number(r.otherAdjustment ?? 0)
      if (oa !== 0) {
        legacyNonZero.push({
          period: period.label,
          employee: r.employeeName,
          employeeId: r.employeeId,
          branch: getBranchName(r.branchId) || r.branchId,
          otherAdjustment: oa,
          net: Number(r.netSalary ?? 0),
        })
      }
    }
  }

  return {
    label,
    at: new Date().toISOString(),
    thuHuong: {
      employee: row.employeeName,
      employeeId: row.employeeId,
      branch: getBranchName(row.branchId) || row.branchId,
      period: '2026-08 Kỳ 1',
      bonus: Number(row.bonus ?? 0),
      kpi: Number(row.kpi ?? 0),
      penalty: Number(row.penalty ?? 0),
      advance: Number(row.advance ?? 0),
      otherAdjustment: Number(row.otherAdjustment ?? 0),
      revenue: Number(row.revenue ?? row.ticketRevenue ?? 0),
      tips: Number(row.tips ?? 0),
      commission: Number(row.commission ?? 0),
      netSalary: Number(row.netSalary ?? 0),
      workDays: Number(row.workDays ?? 0),
    },
    adjustmentLines: empAdj.map((a) => ({
      id: a.id,
      type: a.type,
      amount: Number(a.amount ?? 0),
      date: a.date,
      note: a.note || '',
      reason: a.reason || '',
    })),
    legacyNonZeroSystemWide: legacyNonZero,
    legacyCount: legacyNonZero.length,
    legacySum: legacyNonZero.reduce((s, r) => s + r.otherAdjustment, 0),
  }
}

const before = await snapshot('before')
writeFileSync(path.join(OUT, 'BEFORE.json'), JSON.stringify(before, null, 2))

if (before.thuHuong.otherAdjustment !== TRANSFER_AMOUNT) {
  throw new Error(
    `Trước chuyển: ĐC kỳ vọng ${TRANSFER_AMOUNT}, thực tế ${before.thuHuong.otherAdjustment}. Dừng để tránh ghi sai.`,
  )
}

const allAdj = await fetchPayrollAdjustments({ month: MONTH, employeeId: EMPLOYEE_ID }) ?? []
const dcRows = allAdj.filter((row) => {
  if (row.employeeId !== EMPLOYEE_ID) return false
  if (row.type !== PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT) return false
  if (Number(row.amount ?? 0) === 0) return false
  if (row.date && (row.date < fromDate || row.date > toDate)) return false
  return true
})

if (!dcRows.length) {
  throw new Error('Không tìm thấy dòng Điều chỉnh khác ≠ 0 để chuyển.')
}

const dcSum = dcRows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
if (dcSum !== TRANSFER_AMOUNT) {
  throw new Error(`Tổng ĐC dòng = ${dcSum}, kỳ vọng ${TRANSFER_AMOUNT}`)
}

const advanceBefore = before.thuHuong.advance
const advanceAfter = advanceBefore + TRANSFER_AMOUNT

// 1) Đưa từng dòng ĐC về 0 — không xóa
const zeroed = []
for (const record of dcRows) {
  const saved = await editPayrollAdjustment(record, {
    amount: 0,
    note: record.note,
    reason: REASON,
  })
  zeroed.push({ id: saved.id, oldAmount: Number(record.amount ?? 0), newAmount: Number(saved.amount ?? 0) })
}

// Audit field-level cho ĐC (SET 500 → 0), dù ĐC không còn trên board vận hành
const dcField = buildPayrollFieldAuditValues({
  employeeId: EMPLOYEE_ID,
  employeeName: before.thuHuong.employee,
  branchId: 'bac-lieu',
  month: MONTH,
  cycle: CYCLE,
  fieldChanged: PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT,
  oldValue: TRANSFER_AMOUNT,
  newValue: 0,
  difference: netSalaryImpactForFieldSet(PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT, TRANSFER_AMOUNT, 0),
  extra: {
    migration: 'other_to_advance',
    note: NOTE,
    zeroedIds: zeroed.map((z) => z.id),
    legacyOnly: true,
  },
})
await insertPayrollAuditLog({
  id: createPayrollAuditId(),
  entityType: 'payroll_field',
  entityId: EMPLOYEE_ID,
  action: 'set_field_total',
  editorId: 'admin',
  editorName: 'Admin',
  oldValue: dcField.oldValue,
  newValue: dcField.newValue,
  reason: REASON,
})

// 2) Tăng Ứng lương thêm đúng 500.000 (SET tổng)
const boardResults = await saveAdminPayrollBoardEdits({
  reason: REASON,
  note: NOTE,
  totals: {
    [PAYROLL_ADJUSTMENT_TYPES.ADVANCE]: advanceAfter,
  },
  displayedTotals: {
    [PAYROLL_ADJUSTMENT_TYPES.ADVANCE]: advanceBefore,
  },
  employeeId: EMPLOYEE_ID,
  employeeName: before.thuHuong.employee,
  branchId: 'bac-lieu',
  month: MONTH,
  cycle: CYCLE,
  fromDate,
  toDate,
  existingAdjustments: await fetchPayrollAdjustments({ month: MONTH }),
})

await insertPayrollAuditLog({
  id: createPayrollAuditId(),
  entityType: 'payroll_board',
  entityId: EMPLOYEE_ID,
  action: 'migrate_other_to_advance',
  editorId: 'admin',
  editorName: 'Admin',
  oldValue: {
    otherAdjustment: TRANSFER_AMOUNT,
    advance: advanceBefore,
    netSalary: before.thuHuong.netSalary,
  },
  newValue: {
    otherAdjustment: 0,
    advance: advanceAfter,
    transferAmount: TRANSFER_AMOUNT,
    boardResults,
  },
  reason: REASON,
})

const after = await snapshot('after')
writeFileSync(path.join(OUT, 'AFTER.json'), JSON.stringify(after, null, 2))

const audits = await fetchPayrollAuditLogs({ entityId: EMPLOYEE_ID }) ?? []
const recentAudits = audits
  .filter((a) => String(a.reason || '').includes('Chuyển khoản nhập nhầm')
    || a.action === 'migrate_other_to_advance')
  .slice(0, 20)
  .map((a) => ({
    id: a.id,
    action: a.action,
    entityType: a.entityType,
    reason: a.reason,
    createdAt: a.createdAt || a.created_at,
  }))

const checks = {
  otherAdjustmentZero: after.thuHuong.otherAdjustment === 0,
  advanceIncreasedBy500k: after.thuHuong.advance === advanceBefore + TRANSFER_AMOUNT,
  bonusUnchanged: after.thuHuong.bonus === before.thuHuong.bonus,
  kpiUnchanged: after.thuHuong.kpi === before.thuHuong.kpi,
  penaltyUnchanged: after.thuHuong.penalty === before.thuHuong.penalty,
  revenueUnchanged: after.thuHuong.revenue === before.thuHuong.revenue,
  tipsUnchanged: after.thuHuong.tips === before.thuHuong.tips,
  commissionUnchanged: after.thuHuong.commission === before.thuHuong.commission,
  netDecreasedBy500k: after.thuHuong.netSalary === before.thuHuong.netSalary - TRANSFER_AMOUNT,
  legacySystemWideZero: after.legacyCount === 0,
  oldDcRowsKeptAtZero: zeroed.every((z) => z.newAmount === 0) && zeroed.length === dcRows.length,
  auditPresent: recentAudits.length > 0,
}

const pass = Object.values(checks).every(Boolean)

const report = {
  generatedAt: new Date().toISOString(),
  status: pass ? 'PASS' : 'FAIL',
  deployed: false,
  reason: REASON,
  transferAmount: TRANSFER_AMOUNT,
  before: before.thuHuong,
  after: after.thuHuong,
  deltas: {
    otherAdjustment: after.thuHuong.otherAdjustment - before.thuHuong.otherAdjustment,
    advance: after.thuHuong.advance - before.thuHuong.advance,
    netSalary: after.thuHuong.netSalary - before.thuHuong.netSalary,
  },
  zeroedAdjustmentIds: zeroed,
  boardResults,
  checks,
  recentAudits,
  legacyAfter: after.legacyNonZeroSystemWide,
  noteAboutNet:
    'Công thức local đã bỏ ĐC khỏi net. Chuyển ĐC→Ứng: zero ĐC (không đổi net) + tăng Ứng (−500k net) → net giảm đúng 500k so với trước chuyển. '
    + 'So với Production cũ (còn cộng ĐC vào net): tổng Δ ≈ −1.000.000 (mất +ĐC và thêm −Ứng).',
}

writeFileSync(path.join(OUT, 'MIGRATE_UAT_REPORT.json'), JSON.stringify(report, null, 2))

const csv = [
  'metric,before,after,delta',
  `bonus,${before.thuHuong.bonus},${after.thuHuong.bonus},${after.thuHuong.bonus - before.thuHuong.bonus}`,
  `kpi,${before.thuHuong.kpi},${after.thuHuong.kpi},${after.thuHuong.kpi - before.thuHuong.kpi}`,
  `penalty,${before.thuHuong.penalty},${after.thuHuong.penalty},${after.thuHuong.penalty - before.thuHuong.penalty}`,
  `advance,${before.thuHuong.advance},${after.thuHuong.advance},${after.thuHuong.advance - before.thuHuong.advance}`,
  `otherAdjustment,${before.thuHuong.otherAdjustment},${after.thuHuong.otherAdjustment},${after.thuHuong.otherAdjustment - before.thuHuong.otherAdjustment}`,
  `netSalary,${before.thuHuong.netSalary},${after.thuHuong.netSalary},${after.thuHuong.netSalary - before.thuHuong.netSalary}`,
  `revenue,${before.thuHuong.revenue},${after.thuHuong.revenue},${after.thuHuong.revenue - before.thuHuong.revenue}`,
  `tips,${before.thuHuong.tips},${after.thuHuong.tips},${after.thuHuong.tips - before.thuHuong.tips}`,
  `commission,${before.thuHuong.commission},${after.thuHuong.commission},${after.thuHuong.commission - before.thuHuong.commission}`,
  `legacySystemWideCount,${before.legacyCount},${after.legacyCount},${after.legacyCount - before.legacyCount}`,
].join('\n')
writeFileSync(path.join(OUT, 'THU_HUONG_BEFORE_AFTER.csv'), csv)

console.log(JSON.stringify({
  status: report.status,
  checks,
  before: before.thuHuong,
  after: after.thuHuong,
  deltas: report.deltas,
  out: OUT,
}, null, 2))

if (!pass) process.exit(1)
