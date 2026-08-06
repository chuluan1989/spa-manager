/**
 * One-shot governance snapshot (stdout JSON + optional --out=).
 *   npx vite-node --env-file=.env.development.local scripts/snapshot-governance-once.mjs \
 *     --employee=soc-trang-ly-ly --month=2026-08 --cycle=period1 --branch=soc-trang --label=before
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

import { writeFileSync } from 'node:fs'
import { buildGovernanceSnapshot } from './lib/payrollGovernanceSnapshot.mjs'

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const employeeId = arg('employee', 'soc-trang-ly-ly')
const month = arg('month', '2026-08')
const cycle = arg('cycle', 'period1')
const branchId = arg('branch', 'soc-trang')
const label = arg('label', 'snap')
const out = arg('out', '')

const { fetchEmployeesFiltered } = await import('../src/repositories/employeesRepository.js')
const { fetchAttendanceFiltered } = await import('../src/repositories/attendanceRepository.js')
const { fetchInvoicesFiltered } = await import('../src/repositories/invoicesRepository.js')
const { fetchPayrollAdjustments, fetchPayrollAuditLogs } = await import('../src/repositories/payrollRepository.js')
const { fetchExpensesFiltered } = await import('../src/repositories/expensesRepository.js')
const { normalizeEmployee } = await import('../src/utils/employeeStorage.js')
const { computePayrollReport } = await import('../src/utils/payrollEngine.js')
const { computePayrollCostByBranch } = await import('../src/utils/profitReport.js')
const { getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { mapPayrollRowForExport } = await import('../src/utils/payrollExportModel.js')

const cycleKey = cycle === 'period2' ? PAY_CYCLES.PERIOD_2 : PAY_CYCLES.PERIOD_1
const { fromDate, toDate } = getPayPeriodRange(month, cycleKey)
const ar = getPayPeriodRange(month, cycleKey === PAY_CYCLES.PERIOD_2 ? PAY_CYCLES.FULL : PAY_CYCLES.PERIOD_1)

const employees = (await fetchEmployeesFiltered({}) ?? []).map((r) => normalizeEmployee(r))
const [invoices, attendance, adjustments, expenses] = await Promise.all([
  fetchInvoicesFiltered({ fromDate, toDate, branchId: '', employeeId: '' }),
  fetchAttendanceFiltered({ fromDate: ar.fromDate, toDate: ar.toDate, branchId: '', employeeId: '' }),
  fetchPayrollAdjustments({ month }),
  fetchExpensesFiltered({ fromDate, toDate }).catch(() => []),
])

const expensesTotal = (expenses ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0)

const report = computePayrollReport({
  month,
  cycle: cycleKey,
  branchId: '',
  employeeId: '',
  employees,
  invoices: invoices ?? [],
  attendanceRecords: attendance ?? [],
  adjustments: adjustments ?? [],
})

const payrollCost = computePayrollCostByBranch({
  fromDate,
  toDate,
  branchId: '',
  employees,
  invoices: invoices ?? [],
  attendanceRecords: attendance ?? [],
  adjustments: adjustments ?? [],
  month,
  cycle: cycleKey,
})

const row = report.rows.find((r) => r.employeeId === employeeId)
const exportRow = row ? mapPayrollRowForExport(row) : null

const audits = await fetchPayrollAuditLogs({ entityId: employeeId }).catch(() => [])
const auditLatest = (audits ?? [])
  .filter((a) => a.action === 'admin_edit_board' || a.action === 'set_field_total')
  .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] ?? null

const snap = buildGovernanceSnapshot({
  label,
  employeeId,
  branchId,
  report,
  payrollCost,
  expensesTotal,
  exportRow,
  auditLatest: auditLatest
    ? {
        action: auditLatest.action,
        reason: auditLatest.reason,
        createdAt: auditLatest.createdAt,
        netDelta: auditLatest.newValue?.netDelta ?? auditLatest.newValue?.difference,
        laborCostDelta: auditLatest.newValue?.laborCostDelta,
        profitDelta: auditLatest.newValue?.profitDelta,
      }
    : null,
})

const text = JSON.stringify(snap, null, 2)
if (out) writeFileSync(out, text)
console.log(text)
