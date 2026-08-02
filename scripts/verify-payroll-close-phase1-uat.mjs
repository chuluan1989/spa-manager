/**
 * UAT Phase 1 — close attendance scope + confirmations + pending work inbox.
 * Run: vite-node scripts/verify-payroll-close-phase1-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { CLOSE_CYCLES, getCloseCycleRange } from '../src/utils/payrollCycleClose/payCycleCalendar.js'
import {
  buildEmployeeAttendancePeriodDays,
  isAttendanceOptionalForCloseCycle,
} from '../src/utils/payrollCycleClose/attendancePeriodReview.js'
import {
  areCloseConfirmationsComplete,
  emptyCloseConfirmations,
  CLOSE_CONFIRMATION_ITEMS,
} from '../src/utils/payrollCycleClose/closeConfirmations.js'
import { canSubmitCloseCycle, CLOSE_CYCLE_STATUS } from '../src/utils/payrollCycleClose/closeCycleStatus.js'
import { ATTENDANCE_STATUS } from '../src/constants/attendanceTypes.js'

console.log('\n=== UAT Phase 1 — close cycle attendance + confirmations ===\n')

{
  assert.equal(isAttendanceOptionalForCloseCycle('2026-07', CLOSE_CYCLES.PERIOD_1), true)
  assert.equal(isAttendanceOptionalForCloseCycle('2026-07', CLOSE_CYCLES.PERIOD_2), false)
  assert.equal(isAttendanceOptionalForCloseCycle('2026-08', CLOSE_CYCLES.PERIOD_1), false)
  console.log('  [PASS] Kỳ 1 tháng 7/2026 ngoại lệ mọi CN; Kỳ 2/7 và sau không ngoại lệ')
}

{
  const range = getCloseCycleRange('2026-07', CLOSE_CYCLES.PERIOD_2)
  assert.equal(range.fromDate, '2026-07-16')
  assert.equal(range.toDate, '2026-07-31')
  const review = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [],
    fromDate: range.fromDate,
    toDate: range.toDate,
    todayDate: '2026-08-05',
  })
  assert.ok(review.summary.missingDates.every((d) => d >= '2026-07-16' && d <= '2026-07-31'))
  assert.equal(review.summary.missingDates.some((d) => d < '2026-07-16'), false)
  assert.equal(review.summary.missingDates.some((d) => d.startsWith('2026-06')), false)
  console.log('  [PASS] Kỳ 2 tháng 7 chỉ thiếu trong 16–31/07; không tháng 6 / 01–15')
}

{
  const review = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [
      { employeeId: 'e1', date: '2026-08-10', status: ATTENDANCE_STATUS.ON_TIME },
    ],
    fromDate: '2026-08-01',
    toDate: '2026-08-15',
    todayDate: '2026-08-20',
    employmentStartDate: '2026-08-10',
    employmentEndDate: '',
  })
  assert.equal(review.summary.missingDates.some((d) => d < '2026-08-10'), false)
  assert.ok(review.days.filter((d) => d.date < '2026-08-10').every((d) => !d.blocksClose))
  console.log('  [PASS] ngày trước startDate không tính thiếu / không chặn chốt')
}

{
  const empty = emptyCloseConfirmations()
  assert.equal(areCloseConfirmationsComplete(empty), false)
  assert.equal(CLOSE_CONFIRMATION_ITEMS.length, 3)
  assert.equal(
    areCloseConfirmationsComplete({
      attendanceChecked: true,
      invoicesChecked: true,
      adjustmentsChecked: false,
    }),
    false,
  )
  assert.equal(
    areCloseConfirmationsComplete({
      attendanceChecked: true,
      invoicesChecked: true,
      adjustmentsChecked: true,
    }),
    true,
  )
  console.log('  [PASS] thiếu 1/3 xác nhận → không gửi; đủ 3 → được')
}

{
  assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.RETURNED), true)
  assert.equal(canSubmitCloseCycle(CLOSE_CYCLE_STATUS.SUBMITTED), false)
  console.log('  [PASS] returned → gửi lại được; submitted → ẩn khỏi chờ gửi NV')
}

{
  const root = fileURLToPath(new URL('..', import.meta.url))
  const panel = readFileSync(`${root}/src/components/salary/PayrollCycleClosePanel.jsx`, 'utf8')
  assert.match(panel, /Gửi bảng chốt lương/)
  assert.match(panel, /CLOSE_CONFIRMATION_ITEMS/)

  const inbox = readFileSync(`${root}/src/utils/payrollCycleClose/pendingWorkInbox.js`, 'utf8')
  assert.match(inbox, /PAYROLL_CLOSE/)
  assert.match(inbox, /ATTENDANCE_CORRECTION/)
  assert.match(inbox, /loadPendingWorkInbox/)

  const ow = readFileSync(`${root}/src/pages/OperationWorkflow.jsx`, 'utf8')
  assert.match(ow, /Cần xử lý/)
  assert.match(ow, /PendingWorkInboxPanel/)

  const sidebar = readFileSync(`${root}/src/components/layout/Sidebar.jsx`, 'utf8')
  assert.match(sidebar, /ADMIN_HIDDEN_NAV_IDS = new Set\(\['payroll1-admin'\]\)/)

  const banner = readFileSync(`${root}/src/components/common/MissingAttendanceRemindBanner.jsx`, 'utf8')
  assert.match(banner, /listDuePayrollCloseTargets/)
  assert.match(banner, /isAttendanceOptionalForCloseCycle/)

  const submit = readFileSync(`${root}/src/utils/payrollCycleClose/submitCloseCycle.js`, 'utf8')
  assert.match(submit, /areCloseConfirmationsComplete/)
  assert.match(submit, /buildCloseCycleSnapshot\(preview, confirmations\)/)

  console.log('  [PASS] source: checkbox + inbox + unhide Admin Công việc + banner thu hẹp kỳ')
}

console.log('\n=== ALL PASS — Phase 1 UAT ===\n')
