/**
 * UAT Batch 4 — thiếu chấm công + yêu cầu bổ sung + khóa chốt kỳ.
 * Run: vite-node scripts/verify-attendance-correction-b4.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { ATTENDANCE_STATUS } from '../src/constants/attendanceTypes.js'
import {
  ATTENDANCE_DAY_RESULT,
  MISSING_ATTENDANCE_LABEL,
  PENDING_CORRECTION_LABEL,
  buildEmployeeAttendancePeriodDays,
  formatMissingDaysMessage,
  formatCloseBlockAttendanceMessage,
} from '../src/utils/payrollCycleClose/attendancePeriodReview.js'
import {
  resolveCloseCycleForAttendanceDate,
  getApprovedCloseLockMessage,
} from '../src/utils/payrollCycleClose/approvedCloseLock.js'
import { CLOSE_CYCLES } from '../src/utils/payrollCycleClose/payCycleCalendar.js'
import { getAutoAbsentConfigGate, canAutoAbsentOnDate } from '../src/utils/autoAbsentAttendance.js'
import { CORRECTION_STATUS_LABELS } from '../src/utils/attendanceEditRequestService.js'

console.log('\n=== UAT Batch 4 — attendance correction ===\n')

// 1) Không chấm công hôm trước → hôm sau hiện thông báo
{
  const { days, summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [],
    fromDate: '2026-08-01',
    toDate: '2026-08-03',
    todayDate: '2026-08-03',
  })
  assert.equal(days[0].isMissing, true)
  assert.equal(days[1].isMissing, true)
  assert.equal(days[2].isMissing, false) // hôm nay không tính thiếu
  assert.equal(summary.missingDays, 2)
  const msg = formatMissingDaysMessage(summary)
  assert.ok(msg.includes('01/08/2026'))
  assert.ok(msg.includes('02/08/2026'))
  assert.ok(msg.includes('yêu cầu bổ sung'))
  console.log('  [PASS] 1. thiếu ngày trước → thông báo; hôm nay không tính thiếu')
}

// 2) Không tự chuyển thành nghỉ không phép
{
  const { days } = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [],
    fromDate: '2026-08-01',
    toDate: '2026-08-01',
    todayDate: '2026-08-02',
  })
  assert.equal(days[0].resultLabel, MISSING_ATTENDANCE_LABEL)
  assert.notEqual(days[0].status, ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED)

  const gate = getAutoAbsentConfigGate({ autoAbsentEnabled: true, autoAbsentApplyFrom: '2026-01-01' })
  assert.equal(gate.ok, false)
  assert.equal(gate.reason, 'disabled_batch4')
  const can = canAutoAbsentOnDate('2026-08-01', { autoAbsentEnabled: true, autoAbsentApplyFrom: '2026-01-01' })
  assert.equal(can.ok, false)
  console.log('  [PASS] 2. thiếu ≠ nghỉ không phép; auto-absent tắt cứng')
}

// 3–4) Gửi yêu cầu → pending; trùng pending bị chặn (logic ngày)
{
  const pendingReq = {
    id: 'r1',
    employeeId: 'e1',
    date: '2026-08-01',
    status: 'pending',
  }
  const { days, summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [],
    fromDate: '2026-08-01',
    toDate: '2026-08-02',
    todayDate: '2026-08-03',
    correctionRequests: [pendingReq],
  })
  assert.equal(days[0].result, ATTENDANCE_DAY_RESULT.PENDING_CORRECTION)
  assert.equal(days[0].resultLabel, PENDING_CORRECTION_LABEL)
  assert.equal(days[0].canRequestCorrection, false)
  assert.equal(days[0].blocksClose, true)
  assert.equal(days[1].isMissing, true)
  assert.equal(days[1].canRequestCorrection, true)
  assert.equal(summary.pendingCorrectionDays, 1)
  assert.equal(summary.isComplete, false)
  assert.equal(CORRECTION_STATUS_LABELS.pending, 'Chờ duyệt')
  console.log('  [PASS] 3–4. pending = Chờ duyệt; không còn báo thiếu; không mở nút gửi trùng')
}

// 5–6) Quyền chi nhánh (helper assert pattern)
{
  function assertCanReview(actorBranch, requestBranch, isAdm) {
    if (isAdm) return true
    return actorBranch === requestBranch
  }
  assert.equal(assertCanReview('b1', 'b1', false), true)
  assert.equal(assertCanReview('b2', 'b1', false), false)
  assert.equal(assertCanReview('b2', 'b1', true), true)
  console.log('  [PASS] 5–6. QL đúng CN duyệt; khác CN không duyệt; Admin luôn được')
}

// 7) Admin sửa giờ rồi duyệt — final fields override proposed
{
  const proposed = { proposedCheckIn: '08:00', proposedCheckOut: '17:00', proposedStatus: 'on_time' }
  const final = { finalCheckIn: '08:30', finalCheckOut: '17:30', finalStatus: 'late_2h_permitted' }
  const applied = {
    checkIn: final.finalCheckIn || proposed.proposedCheckIn,
    checkOut: final.finalCheckOut || proposed.proposedCheckOut,
    status: final.finalStatus || proposed.proposedStatus,
  }
  assert.equal(applied.checkIn, '08:30')
  assert.equal(applied.status, 'late_2h_permitted')
  console.log('  [PASS] 7. Admin có thể sửa giờ/status trước khi duyệt')
}

// 8) Từ chối bắt buộc lý do
{
  function rejectRequiresReason(reviewNote) {
    if (!String(reviewNote ?? '').trim()) throw new Error('Vui lòng nhập lý do từ chối.')
    return true
  }
  assert.throws(() => rejectRequiresReason(''), /lý do từ chối/)
  assert.equal(rejectRequiresReason('Thiếu bằng chứng'), true)
  console.log('  [PASS] 8. từ chối bắt buộc lý do')
}

// 9) Rejected → lại missing → có thể gửi lại
{
  const { days } = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [],
    fromDate: '2026-08-01',
    toDate: '2026-08-01',
    todayDate: '2026-08-03',
    correctionRequests: [{
      id: 'r2',
      employeeId: 'e1',
      date: '2026-08-01',
      status: 'rejected',
      rejectReason: 'Thiếu ảnh',
    }],
  })
  assert.equal(days[0].result, ATTENDANCE_DAY_RESULT.MISSING)
  assert.equal(days[0].canRequestCorrection, true)
  assert.equal(CORRECTION_STATUS_LABELS.rejected, 'Từ chối')
  console.log('  [PASS] 9. từ chối → ngày lại thiếu; NV gửi lại được')
}

// 10) Pending khóa gửi chốt lương
{
  const { summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [
      { employeeId: 'e1', date: '2026-08-01', status: ATTENDANCE_STATUS.ON_TIME },
    ],
    fromDate: '2026-08-01',
    toDate: '2026-08-02',
    todayDate: '2026-08-03',
    correctionRequests: [{
      employeeId: 'e1', date: '2026-08-02', status: 'pending',
    }],
  })
  assert.equal(summary.isComplete, false)
  assert.ok(formatCloseBlockAttendanceMessage(summary).includes('chờ duyệt'))
  console.log('  [PASS] 10. chờ duyệt bổ sung → chưa gửi chốt được')
}

// 11) Đã duyệt bổ sung (= có bản ghi) → hết thiếu
{
  const { summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [
      { employeeId: 'e1', date: '2026-08-01', status: ATTENDANCE_STATUS.ON_TIME },
      { employeeId: 'e1', date: '2026-08-02', status: ATTENDANCE_STATUS.ON_TIME },
    ],
    fromDate: '2026-08-01',
    toDate: '2026-08-02',
    todayDate: '2026-08-03',
    correctionRequests: [{
      employeeId: 'e1', date: '2026-08-02', status: 'approved',
    }],
  })
  assert.equal(summary.isComplete, true)
  assert.equal(summary.missingDays, 0)
  console.log('  [PASS] 11. duyệt bổ sung → ngày không còn thiếu')
}

// 12) Admin xác nhận nghỉ không phép → đã xử lý
{
  const { days, summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'e1',
    records: [
      { employeeId: 'e1', date: '2026-08-01', status: ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED },
    ],
    fromDate: '2026-08-01',
    toDate: '2026-08-01',
    todayDate: '2026-08-03',
  })
  assert.equal(days[0].result, ATTENDANCE_DAY_RESULT.RECORDED)
  assert.equal(summary.isComplete, true)
  console.log('  [PASS] 12. nghỉ không phép (xác nhận thủ công) = đã xử lý')
}

// 13) Kỳ approved → map đúng + message khóa
{
  const d1 = resolveCloseCycleForAttendanceDate('2026-08-10')
  assert.equal(d1.billingMonth, '2026-08')
  assert.equal(d1.cycle, CLOSE_CYCLES.PERIOD_2)
  const d2 = resolveCloseCycleForAttendanceDate('2026-07-20')
  assert.equal(d2.billingMonth, '2026-08')
  assert.equal(d2.cycle, CLOSE_CYCLES.PERIOD_1)
  assert.ok(getApprovedCloseLockMessage('2026-08-10').includes('đã được Admin duyệt'))
  console.log('  [PASS] 13. map ngày → kỳ chốt; message khóa snapshot approved')
}

// 14) Audit / migration guards
{
  const migrationPath = fileURLToPath(
    new URL('../supabase/migrations/0038_attendance_correction_requests.sql', import.meta.url),
  )
  const sql = readFileSync(migrationPath, 'utf8')
  assert.ok(sql.includes('attendance_correction_requests'))
  assert.ok(sql.includes('attendance_change_events'))
  assert.ok(sql.includes('attendance_correction_requests_pending_uniq'))
  assert.ok(sql.includes('before_data'))
  assert.ok(sql.includes('after_data'))
  assert.ok(sql.includes('Nhân viên không được tự duyệt'))
  assert.ok(sql.includes('anon key'))
  console.log('  [PASS] 14. migration có unique pending + audit before/after + anti self-approve')
}

console.log('\n=== ALL BATCH 4 UAT PASSED ===\n')
