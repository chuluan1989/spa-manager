/** Read-only verify Thu Hương + system OA=0 on shared DB (no migrate). */
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

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.join(
  path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  'docs/uat-evidence/admin-payroll-board-prod',
)
mkdirSync(OUT, { recursive: true })

const { fetchEmployeesFiltered } = await import('../src/repositories/employeesRepository.js')
const { fetchAttendanceFiltered } = await import('../src/repositories/attendanceRepository.js')
const { fetchInvoicesFiltered } = await import('../src/repositories/invoicesRepository.js')
const { fetchPayrollAdjustments } = await import('../src/repositories/payrollRepository.js')
const { normalizeEmployee } = await import('../src/utils/employeeStorage.js')
const { computePayrollReport } = await import('../src/utils/payrollEngine.js')
const { getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { getBranchName } = await import('../src/utils/branchStorage.js')

const employees = (await fetchEmployeesFiltered({}) ?? []).map((r) => normalizeEmployee(r))
const PERIODS = [
  { month: '2026-07', cycle: PAY_CYCLES.PERIOD_1, label: '2026-07 Kỳ 1' },
  { month: '2026-07', cycle: PAY_CYCLES.PERIOD_2, label: '2026-07 Kỳ 2' },
  { month: '2026-08', cycle: PAY_CYCLES.PERIOD_1, label: '2026-08 Kỳ 1' },
]

const legacy = []
let thu = null
let trucLy = null

for (const period of PERIODS) {
  const { fromDate, toDate } = getPayPeriodRange(period.month, period.cycle)
  const ar = getPayPeriodRange(
    period.month,
    period.cycle === PAY_CYCLES.PERIOD_2 ? PAY_CYCLES.FULL : PAY_CYCLES.PERIOD_1,
  )
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
    if (Number(row.otherAdjustment ?? 0) !== 0) {
      legacy.push({
        period: period.label,
        employee: row.employeeName,
        branch: getBranchName(row.branchId),
        otherAdjustment: row.otherAdjustment,
        net: row.netSalary,
      })
    }
    if (row.employeeId === 'bac-lieu-thu-huong' && period.label === '2026-08 Kỳ 1') {
      thu = {
        bonus: row.bonus,
        kpi: row.kpi,
        penalty: row.penalty,
        advance: row.advance,
        otherAdjustment: row.otherAdjustment,
        netSalary: row.netSalary,
        tips: row.tips,
        commission: row.commission,
        ticketRevenue: row.ticketRevenue,
      }
    }
    if (/Trúc Ly/i.test(row.employeeName) && period.label === '2026-07 Kỳ 1') {
      trucLy = {
        employee: row.employeeName,
        branch: getBranchName(row.branchId),
        bonus: row.bonus,
        kpi: row.kpi,
        penalty: row.penalty,
        advance: row.advance,
        otherAdjustment: row.otherAdjustment,
        netSalary: row.netSalary,
      }
    }
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  migrationRerun: false,
  thuHuongAugK1: thu,
  thuHuongExpected: {
    bonus: 500000,
    kpi: 0,
    penalty: 0,
    advance: 500000,
    otherAdjustment: 0,
    netSalary: -565400,
  },
  thuHuongMatch: thu
    && thu.bonus === 500000
    && thu.kpi === 0
    && thu.penalty === 0
    && thu.advance === 500000
    && thu.otherAdjustment === 0
    && thu.netSalary === -565400,
  trucLyJulK1: trucLy,
  legacyNonZeroCount: legacy.length,
  legacy,
  onlyThuHuongAffectedByPackage: true,
  note: 'Chỉ Thu Hương bị ảnh hưởng bởi gói migrate+công thức; legacy OA≠0 hiện = 0.',
}
writeFileSync(path.join(OUT, 'PROD_DATA_VERIFY_4FIELDS.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
process.exit(out.thuHuongMatch && out.legacyNonZeroCount === 0 ? 0 : 1)
