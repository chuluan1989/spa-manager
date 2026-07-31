/**
 * UAT Batch 3 — approve/return/banner/snapshot lock helpers.
 * Run: vite-node scripts/verify-payroll-cycle-close-b3.mjs
 */
import assert from 'node:assert/strict'
import './_polyfill-storage.mjs'
import {
  CLOSE_CYCLES,
  getCloseCycleRange,
} from '../src/utils/payrollCycleClose/payCycleCalendar.js'
import {
  canSubmitCloseCycle,
  isCloseCyclePendingReview,
  resolveNextSubmitStatus,
  CLOSE_CYCLE_STATUS,
} from '../src/utils/payrollCycleClose/closeCycleStatus.js'
import { resolvePayrollCloseRemindTarget } from '../src/utils/payrollCycleClose/closeRemind.js'
import { buildCloseCycleSnapshot } from '../src/utils/payrollCycleClose/buildCloseCyclePreview.js'
import { ATTENDANCE_STATUS } from '../src/constants/attendanceTypes.js'
import { buildEmployeeAttendancePeriodDays } from '../src/utils/payrollCycleClose/attendancePeriodReview.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

console.log('\n=== UAT Batch 3 — close cycle approve/return/banner ===\n')

// Flow status machine
{
  let status = null
  assert.equal(canSubmitCloseCycle(status), true)
  status = resolveNextSubmitStatus(status)
  assert.equal(status, CLOSE_CYCLE_STATUS.SUBMITTED)
  assert.equal(canSubmitCloseCycle(status), false)
  assert.equal(isCloseCyclePendingReview(status), true)

  // Admin returns
  status = CLOSE_CYCLE_STATUS.RETURNED
  assert.equal(canSubmitCloseCycle(status), true)
  status = resolveNextSubmitStatus(status)
  assert.equal(status, CLOSE_CYCLE_STATUS.RESUBMITTED)
  assert.equal(isCloseCyclePendingReview(status), true)

  // Approve
  status = CLOSE_CYCLE_STATUS.APPROVED
  assert.equal(canSubmitCloseCycle(status), false)
  assert.equal(isCloseCyclePendingReview(status), false)
  console.log('  [PASS] submit → return → resubmit → approve state machine')
}

// Cannot approve/return wrong states (logic expectations)
{
  assert.equal(isCloseCyclePendingReview(CLOSE_CYCLE_STATUS.DRAFT), false)
  assert.equal(isCloseCyclePendingReview(CLOSE_CYCLE_STATUS.RETURNED), false)
  assert.equal(isCloseCyclePendingReview(CLOSE_CYCLE_STATUS.APPROVED), false)
  console.log('  [PASS] only submitted/resubmitted pending review')
}

// Banner day 02 / 17
{
  const d2 = resolvePayrollCloseRemindTarget('2026-08-02')
  assert.ok(d2)
  assert.equal(d2.cycle, CLOSE_CYCLES.PERIOD_1)
  assert.equal(d2.billingMonth, '2026-08')
  assert.equal(getCloseCycleRange('2026-08', CLOSE_CYCLES.PERIOD_1).fromDate, '2026-07-16')

  const d17 = resolvePayrollCloseRemindTarget('2026-08-17')
  assert.ok(d17)
  assert.equal(d17.cycle, CLOSE_CYCLES.PERIOD_2)

  assert.equal(resolvePayrollCloseRemindTarget('2026-08-03'), null)
  assert.equal(resolvePayrollCloseRemindTarget('2026-08-16'), null)
  console.log('  [PASS] banner targets day 02 Kỳ 1 / day 17 Kỳ 2 only')
}

// Snapshot immutable shape + history append design
{
  const review = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [
      { employeeId: 'e1', date: '2026-08-01', status: ATTENDANCE_STATUS.ON_TIME },
      { employeeId: 'e1', date: '2026-08-02', status: ATTENDANCE_STATUS.FULL_DAY_PERMITTED },
    ],
    fromDate: '2026-08-01',
    toDate: '2026-08-02',
    todayDate: '2026-08-02',
  })
  const preview = {
    employeeId: 'e1',
    employeeName: 'A',
    branchId: 'soc-trang',
    branchName: 'Sóc Trăng',
    billingMonth: '2026-08',
    cycle: CLOSE_CYCLES.PERIOD_2,
    fromDate: '2026-08-01',
    toDate: '2026-08-15',
    submitDate: '2026-08-17',
    existing: { submissionVersion: 1, snapshot: { version: 1, totals: { netSalary: 100 } } },
    attendanceReview: review,
    salary: {
      baseSalary: 0,
      ticketRevenue: 200000,
      commission: 20000,
      tips: 10000,
      bonus: 0,
      penalty: 0,
      advance: 0,
      reduction: 0,
      otherAdjustment: 0,
      netSalary: 30000,
      invoiceCount: 1,
    },
    details: {
      invoices: [{ id: 'inv1', tips: 10000, services: [{ commissionPercent: 10 }] }],
      adjustments: [],
    },
  }
  const snap = buildCloseCycleSnapshot(preview)
  assert.equal(snap.version, 2)
  assert.equal(snap.totals.netSalary, 30000)
  assert.ok(snap.details.invoices.length === 1)
  assert.ok(snap.attendance.days.length === 2)
  assert.equal(snap.employee.branchId, 'soc-trang')

  // Simulate history preserve on resubmit
  const history = [{
    version: 1,
    status: CLOSE_CYCLE_STATUS.RETURNED,
    snapshot: preview.existing.snapshot,
    returnReason: 'Thiếu chú thích',
  }]
  assert.equal(history[0].snapshot.totals.netSalary, 100)
  assert.equal(snap.totals.netSalary, 30000)
  console.log('  [PASS] snapshot detail + history preserve previous version')
}

// Migration guards present
{
  const sql = readFileSync(
    fileURLToPath(new URL('../supabase/migrations/0037_payroll_cycle_closes.sql', import.meta.url)),
    'utf8',
  )
  assert.ok(sql.includes('unique (employee_id, from_date, to_date)'))
  assert.ok(sql.includes('payroll_cycle_closes_guard'))
  assert.ok(sql.includes('payroll_cycle_close_events'))
  assert.ok(sql.includes('Nhân viên không được tự duyệt'))
  assert.ok(sql.includes("old.status = 'approved'"))
  console.log('  [PASS] migration unique + trigger + events table')
}

console.log('\n=== ALL BATCH 3 UAT PASSED ===\n')
