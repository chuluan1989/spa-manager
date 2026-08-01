/**
 * UAT Batch 2 — close cycle preview/submit helpers (no live Supabase write).
 * Run: vite-node scripts/verify-payroll-cycle-close-b2.mjs
 */
import assert from 'node:assert/strict'
import './_polyfill-storage.mjs'
import {
  CLOSE_CYCLES,
  getCloseCycleRange,
  getDefaultCloseCycleSelection,
} from '../src/utils/payrollCycleClose/payCycleCalendar.js'
import {
  canSubmitCloseCycle,
  resolveNextSubmitStatus,
  isCloseCycleLockedForEmployee,
  CLOSE_CYCLE_STATUS,
  buildCloseCycleId,
} from '../src/utils/payrollCycleClose/closeCycleStatus.js'
import { buildCloseCycleSnapshot } from '../src/utils/payrollCycleClose/buildCloseCyclePreview.js'
import { computeEmployeePayrollRow } from '../src/utils/payrollEngine.js'
import { ATTENDANCE_STATUS } from '../src/constants/attendanceTypes.js'
import { buildEmployeeAttendancePeriodDays } from '../src/utils/payrollCycleClose/attendancePeriodReview.js'

console.log('\n=== UAT Batch 2 — payroll cycle close ===\n')

{
  const range = getCloseCycleRange('2026-08', CLOSE_CYCLES.PERIOD_1)
  assert.equal(range.fromDate, '2026-08-01')
  assert.equal(range.toDate, '2026-08-15')
  assert.equal(range.submitDate, '2026-08-17')
}

assert.equal(canSubmitCloseCycle(null), true)
assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.DRAFT), true)
assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.RETURNED), true)
assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.SUBMITTED), false)
assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.RESUBMITTED), false)
assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.APPROVED), false)
assert.equal(resolveNextSubmitStatus(CLOSE_CYCLE_STATUS.RETURNED), CLOSE_CYCLE_STATUS.RESUBMITTED)
assert.equal(resolveNextSubmitStatus(CLOSE_CYCLE_STATUS.DRAFT), CLOSE_CYCLE_STATUS.SUBMITTED)
assert.equal(isCloseCycleLockedForEmployee(CLOSE_CYCLE_STATUS.APPROVED), true)
assert.equal(buildCloseCycleId('e1', '2026-08', 'period1'), 'pcc_e1_2026-08_period1')
console.log('  [PASS] status gates + id')

{
  const sel = getDefaultCloseCycleSelection('2026-08-02')
  assert.equal(sel.billingMonth, '2026-08')
  assert.equal(sel.cycle, CLOSE_CYCLES.PERIOD_1)
  const sel2 = getDefaultCloseCycleSelection('2026-08-17')
  assert.equal(sel2.cycle, CLOSE_CYCLES.PERIOD_2)
  console.log('  [PASS] default cycle by date')
}

{
  const employee = { id: 'e1', name: 'A', branchId: 'soc-trang', salaryRate: '0' }
  const invoices = [{
    id: 'inv1',
    date: '2026-08-01',
    employeeId: 'e1',
    branchId: 'soc-trang',
    tips: 20000,
    serviceTotal: 200000,
    total: 220000,
    services: [{ id: 's1', name: 'Body', price: 200000, commissionPercent: 10, commissionAmount: 20000 }],
  }]
  const attendance = [
    { employeeId: 'e1', date: '2026-08-01', status: ATTENDANCE_STATUS.ON_TIME, penaltyAmount: 0 },
    { employeeId: 'e1', date: '2026-08-02', status: ATTENDANCE_STATUS.FULL_DAY_PERMITTED, penaltyAmount: 0 },
  ]
  const adjustments = [
    { id: 'a1', employeeId: 'e1', type: 'bonus', amount: 50000, date: '2026-08-01' },
    { id: 'a2', employeeId: 'e1', type: 'advance', amount: 10000, date: '2026-08-01' },
  ]
  const row = computeEmployeePayrollRow(employee, invoices, attendance, adjustments)
  assert.ok(row.commission >= 0)
  assert.equal(row.tips, 20000)
  assert.equal(row.bonus, 50000)
  assert.equal(row.advance, 10000)

  const review = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: attendance,
    fromDate: '2026-08-01',
    toDate: '2026-08-02',
    todayDate: '2026-08-02',
  })
  assert.equal(review.summary.isComplete, true)

  const preview = {
    billingMonth: '2026-08',
    cycle: CLOSE_CYCLES.PERIOD_2,
    fromDate: '2026-08-01',
    toDate: '2026-08-15',
    salary: {
      baseSalary: row.baseSalary,
      ticketRevenue: row.ticketRevenue,
      commission: row.commission,
      tips: row.tips,
      bonus: row.bonus,
      penalty: row.penalty,
      advance: row.advance,
      reduction: row.reduction,
      otherAdjustment: row.otherAdjustment,
      netSalary: row.netSalary,
      invoiceCount: row.invoiceCount,
    },
    attendanceReview: review,
  }
  const snap = buildCloseCycleSnapshot(preview)
  assert.equal(snap.salary.tips, 20000)
  assert.equal(snap.attendance.days.length, 2)
  assert.ok(snap.capturedAt)
  console.log('  [PASS] payrollEngine reuse + snapshot shape')
}

console.log('\n=== ALL BATCH 2 UAT PASSED ===\n')
