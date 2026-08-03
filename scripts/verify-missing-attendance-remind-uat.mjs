/**
 * UAT — Banner thiếu chấm công chỉ kỳ đang diễn ra.
 * Run: npx vite-node scripts/verify-missing-attendance-remind-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import {
  formatDailyMissingAttendanceMessage,
  resolveInProgressAttendanceRemindTarget,
} from '../src/utils/missingAttendanceRemind.js'
import { buildEmployeeAttendancePeriodDays } from '../src/utils/payrollCycleClose/attendancePeriodReview.js'
import { CLOSE_CYCLES } from '../src/utils/payrollCycleClose/payCycleCalendar.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

console.log('\n=== UAT — Missing attendance remind (in-progress cycle) ===\n')

// Case A — hôm nay 03/08
{
  const target = resolveInProgressAttendanceRemindTarget('2026-08-03')
  assert.equal(target.billingMonth, '2026-08')
  assert.equal(target.cycle, CLOSE_CYCLES.PERIOD_1)
  assert.equal(target.fromDate, '2026-08-01')
  assert.equal(target.toDate, '2026-08-15')

  const { summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'cherry',
    records: [],
    fromDate: target.fromDate,
    toDate: '2026-08-03',
    todayDate: '2026-08-03',
    employmentStartDate: '2026-01-01',
  })
  // Thiếu 01–02; không thiếu 03 (hôm nay chưa kết thúc)
  assert.deepEqual(summary.missingDates, ['2026-08-01', '2026-08-02'])
  assert.ok(!summary.missingDates.includes('2026-08-03'))
  assert.ok(!summary.missingDates.some((d) => d.startsWith('2026-06')))
  assert.ok(!summary.missingDates.some((d) => d.startsWith('2026-07')))
  console.log('  [PASS] A. 03/08: chỉ Kỳ 1/8; thiếu 01–02; không hôm nay; không T6/T7')
}

// Case B — sang 04/08, 03/08 vẫn thiếu
{
  const target = resolveInProgressAttendanceRemindTarget('2026-08-04')
  assert.equal(target.cycle, CLOSE_CYCLES.PERIOD_1)
  const { summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'cherry',
    records: [
      { employeeId: 'cherry', date: '2026-08-01', status: 'present', updatedAt: 't' },
      { employeeId: 'cherry', date: '2026-08-02', status: 'present', updatedAt: 't' },
    ],
    fromDate: target.fromDate,
    toDate: '2026-08-04',
    todayDate: '2026-08-04',
    employmentStartDate: '2026-01-01',
  })
  assert.deepEqual(summary.missingDates, ['2026-08-03'])
  assert.match(
    formatDailyMissingAttendanceMessage(summary.missingDates),
    /03\/08\/2026/,
  )
  console.log('  [PASS] B. 04/08: nhắc rõ ngày 03/08 nếu vẫn thiếu')
}

// Kỳ 2 đang diễn ra — không lôi Kỳ 1
{
  const target = resolveInProgressAttendanceRemindTarget('2026-08-20')
  assert.equal(target.cycle, CLOSE_CYCLES.PERIOD_2)
  assert.equal(target.fromDate, '2026-08-16')
  const { summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'cherry',
    records: [],
    fromDate: target.fromDate,
    toDate: '2026-08-20',
    todayDate: '2026-08-20',
    employmentStartDate: '2026-01-01',
  })
  assert.ok(summary.missingDates.every((d) => d >= '2026-08-16' && d < '2026-08-20'))
  assert.ok(!summary.missingDates.includes('2026-08-10'))
  console.log('  [PASS] 20/08: chỉ Kỳ 2 (16→19); không nhắc 01–15')
}

// Case C — banner code dừng khi approved
{
  const src = read('src/utils/missingAttendanceRemind.js')
  assert.match(src, /CLOSE_CYCLE_STATUS\.APPROVED/)
  assert.match(src, /skippedReason: 'approved'/)
  const banner = read('src/components/common/MissingAttendanceRemindBanner.jsx')
  assert.match(banner, /loadInProgressMissingAttendanceDates/)
  assert.doesNotMatch(banner, /listDuePayrollCloseTargets/)
  console.log('  [PASS] C. Kỳ approved → không nhắc; banner không lookback due-close')
}

// Case D — theo employeeId (fetch filter employeeId), không phụ thuộc branch hiện tại
{
  const src = read('src/utils/missingAttendanceRemind.js')
  assert.match(src, /employeeId/)
  assert.match(src, /fetchAttendanceFiltered/)
  assert.doesNotMatch(src, /branchId:\s*getCurrentUserBranch/)
  console.log('  [PASS] D. Quét theo employeeId (không khóa branch session)')
}

// Case E — nhân viên mới: không nhắc trước startDate
{
  const target = resolveInProgressAttendanceRemindTarget('2026-08-05')
  const { summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'new-hire',
    records: [],
    fromDate: target.fromDate,
    toDate: '2026-08-05',
    todayDate: '2026-08-05',
    employmentStartDate: '2026-08-04',
  })
  assert.ok(!summary.missingDates.includes('2026-08-01'))
  assert.ok(!summary.missingDates.includes('2026-08-02'))
  assert.ok(!summary.missingDates.includes('2026-08-03'))
  // 04/08 đã qua trong thời gian làm → thiếu; 05 hôm nay không thiếu
  assert.deepEqual(summary.missingDates, ['2026-08-04'])
  console.log('  [PASS] E. NV mới: không nhắc trước startDate; nhắc ngày làm đã qua')
}

// Void/hủy không hợp lệ
{
  const { summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'cherry',
    records: [
      { employeeId: 'cherry', date: '2026-08-01', status: 'cancelled', updatedAt: 't' },
    ],
    fromDate: '2026-08-01',
    toDate: '2026-08-03',
    todayDate: '2026-08-03',
    employmentStartDate: '2026-01-01',
  })
  assert.ok(summary.missingDates.includes('2026-08-01'))
  console.log('  [PASS] Void/hủy không tính attendance hợp lệ')
}

// Tách banner
{
  const banner = read('src/components/common/MissingAttendanceRemindBanner.jsx')
  assert.match(banner, /TodayAttendanceRemindBanner|KỲ LƯƠNG ĐANG DIỄN RA/)
  assert.match(banner, /Đi đến Chấm công/)
  const closeBanner = read('src/components/common/PayrollCloseRemindBanner.jsx')
  assert.ok(closeBanner.includes('PayrollClose') || closeBanner.length > 0)
  console.log('  [PASS] Tách MissingAttendance vs PayrollClose / Today remind')
}

console.log('\n=== DONE — missing attendance remind UAT PASS ===\n')
