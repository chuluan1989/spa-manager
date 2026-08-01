/**
 * UAT Batch 1 — kỳ lương mới + danh sách ngày chấm công.
 * Run: vite-node scripts/verify-attendance-period-review-b1.mjs
 */
import assert from 'node:assert/strict'
import {
  CLOSE_CYCLES,
  getCloseCycleRange,
  getCloseCycleLabel,
} from '../src/utils/payrollCycleClose/payCycleCalendar.js'
import {
  ATTENDANCE_DAY_RESULT,
  MISSING_ATTENDANCE_LABEL,
  buildEmployeeAttendancePeriodDays,
  formatMissingDaysMessage,
  isValidAttendanceRecord,
  resolveAttendanceReviewRange,
} from '../src/utils/payrollCycleClose/attendancePeriodReview.js'
import { ATTENDANCE_STATUS } from '../src/constants/attendanceTypes.js'

console.log('\n=== UAT Batch 1 — Attendance period review ===\n')

// Kỳ 1 tháng 8 = 01/08–15/08, submit 17/08
{
  const range = getCloseCycleRange('2026-08', CLOSE_CYCLES.PERIOD_1)
  assert.equal(range.fromDate, '2026-08-01')
  assert.equal(range.toDate, '2026-08-15')
  assert.equal(range.submitDate, '2026-08-17')
  console.log('  [PASS] Kỳ 1 tháng 8 = 01/08–15/08 · gửi 17/08')
}

// Kỳ 2 tháng 8 = 16/08–31/08, submit 02/09
{
  const range = getCloseCycleRange('2026-08', CLOSE_CYCLES.PERIOD_2)
  assert.equal(range.fromDate, '2026-08-16')
  assert.equal(range.toDate, '2026-08-31')
  assert.equal(range.submitDate, '2026-09-02')
  console.log('  [PASS] Kỳ 2 tháng 8 = 16/08–31/08 · gửi 02/09')
}

assert.ok(getCloseCycleLabel(CLOSE_CYCLES.PERIOD_1).includes('Kỳ 1'))
assert.ok(getCloseCycleLabel(CLOSE_CYCLES.PERIOD_1).includes('01–15'))

{
  const resolved = resolveAttendanceReviewRange({
    mode: 'cycle',
    billingMonth: '2026-08',
    cycle: CLOSE_CYCLES.PERIOD_1,
  })
  assert.equal(resolved.fromDate, '2026-08-01')
  assert.equal(resolved.toDate, '2026-08-15')
}

assert.equal(isValidAttendanceRecord({ status: ATTENDANCE_STATUS.ON_TIME }), true)
assert.equal(isValidAttendanceRecord({ status: ATTENDANCE_STATUS.FULL_DAY_PERMITTED }), true)
assert.equal(isValidAttendanceRecord({ status: ATTENDANCE_STATUS.CANCELLED }), false)
assert.equal(isValidAttendanceRecord({ status: ATTENDANCE_STATUS.INVALID }), false)
assert.equal(isValidAttendanceRecord(null), false)
console.log('  [PASS] void/hủy không tính đã chấm')

{
  const records = [
    { id: '1', employeeId: 'e1', date: '2026-08-01', status: ATTENDANCE_STATUS.ON_TIME },
    { id: '2', employeeId: 'e1', date: '2026-08-02', status: ATTENDANCE_STATUS.LATE_2H_PERMITTED },
    { id: '3', employeeId: 'e1', date: '2026-08-03', status: ATTENDANCE_STATUS.CANCELLED },
  ]
  const { days, summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records,
    fromDate: '2026-08-01',
    toDate: '2026-08-04',
    todayDate: '2026-08-04',
  })
  assert.equal(days.length, 4)
  assert.equal(days[0].resultLabel, 'Đi làm đúng giờ')
  assert.equal(days[1].result, ATTENDANCE_DAY_RESULT.RECORDED)
  assert.equal(days[2].resultLabel, MISSING_ATTENDANCE_LABEL) // cancelled = missing
  assert.equal(days[3].resultLabel, MISSING_ATTENDANCE_LABEL) // hôm nay vẫn hiện nhãn
  assert.equal(days[3].isMissing, false) // nhưng không tính thiếu
  assert.equal(summary.missingDays, 1)
  assert.equal(summary.completedDays, 2)
  assert.equal(summary.isComplete, false)
  const msg = formatMissingDaysMessage(summary)
  assert.ok(msg.includes('03/08/2026'))
  assert.ok(msg.includes('yêu cầu bổ sung'))
  console.log('  [PASS] list ngày + Chưa chấm công + message thiếu')
}

{
  const { days, summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [
      { id: '1', employeeId: 'e1', date: '2026-08-01', status: ATTENDANCE_STATUS.ON_TIME },
    ],
    fromDate: '2026-08-01',
    toDate: '2026-08-03',
    todayDate: '2026-08-01',
  })
  assert.equal(days[1].result, ATTENDANCE_DAY_RESULT.FUTURE)
  assert.equal(days[2].result, ATTENDANCE_DAY_RESULT.FUTURE)
  assert.equal(summary.missingDays, 0)
  assert.equal(summary.isComplete, true)
  console.log('  [PASS] ngày tương lai không tính thiếu')
}

{
  const { summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [
      { id: '1', employeeId: 'e1', date: '2026-08-01', status: ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED },
      { id: '2', employeeId: 'e1', date: '2026-08-02', status: ATTENDANCE_STATUS.FULL_DAY_WEEKEND },
    ],
    fromDate: '2026-08-01',
    toDate: '2026-08-02',
    todayDate: '2026-08-02',
  })
  assert.equal(summary.isComplete, true)
  assert.equal(summary.missingDays, 0)
  console.log('  [PASS] nghỉ không phép / nghỉ lễ vẫn = đã chấm')
}

console.log('\n=== ALL BATCH 1 UAT PASSED ===\n')
