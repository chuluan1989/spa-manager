import assert from 'node:assert/strict'
import { ATTENDANCE_STATUS } from '../src/constants/attendanceTypes.js'
import {
  calculatePenaltyForNewRecord,
  recomputeMonthlyPenalties,
  computeAttendanceLeaveBreakdown,
  buildAttendanceStats,
} from '../src/utils/attendancePenalties.js'
import { computeAttendanceStats } from '../src/utils/payrollLiveHelpers.js'

function sum(rows) {
  return rows.reduce((s, r) => s + Number(r.penaltyAmount ?? 0), 0)
}

const P = ATTENDANCE_STATUS.FULL_DAY_PERMITTED
const HP = ATTENDANCE_STATUS.HALF_MORNING_PERMITTED
const U = ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED
const HU = ATTENDANCE_STATUS.HALF_MORNING_UNPERMITTED

// A. 3 weekday permitted days = 0
{
  const rows = recomputeMonthlyPenalties([
    { id: '1', date: '2026-07-01', status: P },
    { id: '2', date: '2026-07-02', status: P },
    { id: '3', date: '2026-07-03', status: P },
  ], '2026-07')
  assert.equal(sum(rows), 0, '3 ngày thường có phép = 0đ')
}

// A. 3.5 weekday = 50k
{
  const rows = recomputeMonthlyPenalties([
    { id: '1', date: '2026-07-01', status: P },
    { id: '2', date: '2026-07-02', status: P },
    { id: '3', date: '2026-07-03', status: P },
    { id: '4', date: '2026-07-06', status: HP },
  ], '2026-07')
  assert.equal(sum(rows), 50000, '3.5 ngày = 50k')
}

// A. 4 weekday = 100k
{
  const rows = recomputeMonthlyPenalties([
    { id: '1', date: '2026-07-01', status: P },
    { id: '2', date: '2026-07-02', status: P },
    { id: '3', date: '2026-07-03', status: P },
    { id: '4', date: '2026-07-06', status: P },
  ], '2026-07')
  assert.equal(sum(rows), 100000, '4 ngày = 100k')
}

// A. 2 half = 1 quota day (then 2 more full still free)
{
  const rows = recomputeMonthlyPenalties([
    { id: '1', date: '2026-07-01', status: HP },
    { id: '2', date: '2026-07-02', status: HP },
    { id: '3', date: '2026-07-03', status: P },
    { id: '4', date: '2026-07-06', status: P },
  ], '2026-07')
  assert.equal(sum(rows), 0, '2 half + 2 full = 3 ngày quota = 0đ')
}

// C. CN full = 200k (2026-07-05 Sunday)
{
  const rows = recomputeMonthlyPenalties([
    { id: '1', date: '2026-07-05', status: P },
  ], '2026-07')
  assert.equal(sum(rows), 200000, 'CN full = 200k')
}

// C. CN half = 100k
{
  const rows = recomputeMonthlyPenalties([
    { id: '1', date: '2026-07-05', status: HP },
  ], '2026-07')
  assert.equal(sum(rows), 100000, 'CN half = 100k')
}

// C. CN full + 3 weekday permitted = 200k (weekend does not consume quota)
{
  const rows = recomputeMonthlyPenalties([
    { id: 'cn', date: '2026-07-05', status: P },
    { id: '1', date: '2026-07-01', status: P },
    { id: '2', date: '2026-07-02', status: P },
    { id: '3', date: '2026-07-03', status: P },
  ], '2026-07')
  assert.equal(sum(rows), 200000, 'CN full + 3 ngày thường có phép = 200k')
  assert.equal(rows.find((r) => r.id === '1').penaltyAmount, 0)
  assert.equal(rows.find((r) => r.id === 'cn').penaltyAmount, 200000)
}

// C. CN full + 4 weekday permitted = 300k
{
  const rows = recomputeMonthlyPenalties([
    { id: 'cn', date: '2026-07-05', status: P },
    { id: '1', date: '2026-07-01', status: P },
    { id: '2', date: '2026-07-02', status: P },
    { id: '3', date: '2026-07-03', status: P },
    { id: '4', date: '2026-07-06', status: P },
  ], '2026-07')
  assert.equal(sum(rows), 300000, 'CN full + 4 ngày thường có phép = 300k')
}

// B. weekday unpermitted full/half
assert.equal(calculatePenaltyForNewRecord(U, [], '2026-07-08'), 100000, 'ngày thường không phép full = 100k')
assert.equal(calculatePenaltyForNewRecord(HU, [], '2026-07-08'), 50000, 'ngày thường không phép half = 50k')

// D. late/early
assert.equal(calculatePenaltyForNewRecord(ATTENDANCE_STATUS.LATE_2H_UNPERMITTED, [], '2026-07-08'), 20000)
assert.equal(calculatePenaltyForNewRecord(ATTENDANCE_STATUS.EARLY_2H_UNPERMITTED, [], '2026-07-08'), 20000)
assert.equal(calculatePenaltyForNewRecord(ATTENDANCE_STATUS.LATE_2H_PERMITTED, [], '2026-07-08'), 0)
assert.equal(calculatePenaltyForNewRecord(ATTENDANCE_STATUS.EARLY_2H_PERMITTED, [], '2026-07-08'), 0)

const payrollLatePermitted = computeAttendanceStats([
  { id: 'lp', employeeId: 'e1', date: '2026-07-08', status: ATTENDANCE_STATUS.LATE_2H_PERMITTED, penaltyAmount: 0 },
], 'e1', { holidays: [] })
assert.equal(payrollLatePermitted.late, 1)
assert.equal(payrollLatePermitted.permittedLeave, 0, 'trễ có phép không cộng ngày nghỉ')

const uiStats = buildAttendanceStats([
  { date: '2026-07-01', status: P, penaltyAmount: 0 },
  { date: '2026-07-06', status: HP, penaltyAmount: 0 },
  { date: '2026-07-04', status: P, penaltyAmount: 200000 },
  { date: '2026-07-08', status: ATTENDANCE_STATUS.LATE_2H_PERMITTED, penaltyAmount: 0 },
], { holidays: [] })
assert.equal(uiStats.offPermitted, 1.5)
assert.equal(uiStats.weekend, 1)
assert.equal(uiStats.late, 1)

const breakdown = computeAttendanceLeaveBreakdown([
  { date: '2026-07-01', status: P, penaltyAmount: 0 },
  { date: '2026-07-02', status: P, penaltyAmount: 0 },
  { date: '2026-07-03', status: P, penaltyAmount: 0 },
  { date: '2026-07-06', status: HP, penaltyAmount: 50000 },
  { date: '2026-07-04', status: P, penaltyAmount: 200000 },
], { holidays: [] })
assert.equal(breakdown.permittedDays, 3.5)
assert.equal(breakdown.permittedExceedDays, 0.5)
assert.equal(breakdown.weekendHolidayDays, 1)

console.log('V2 regression PASS')
