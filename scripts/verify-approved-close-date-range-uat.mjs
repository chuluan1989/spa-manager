/**
 * UAT — khóa đúng khoảng fromDate–toDate của phiếu approved.
 * Run: npx vite-node scripts/verify-approved-close-date-range-uat.mjs
 */
import assert from 'node:assert/strict'
import './_polyfill-storage.mjs'
import {
  getApprovedCloseDateRange,
  isEmployeeDateLockedByApprovedCloseSync,
  isRecordDateInApprovedCloseRange,
  seedApprovedCloseCache,
} from '../src/utils/payrollCycleClose/approvedCloseLock.js'
import { isPayCycleClosedForRecordDate } from '../src/utils/payrollPeriodLock.js'
import { getCloseCycleRange, CLOSE_CYCLES } from '../src/utils/payrollCycleClose/payCycleCalendar.js'

console.log('\n=== UAT — Approved close date range lock ===\n')

{
  const range = getCloseCycleRange('2026-07', CLOSE_CYCLES.PERIOD_2)
  assert.equal(range.fromDate, '2026-07-16')
  assert.equal(range.toDate, '2026-07-31')
  console.log('  [PASS] Kỳ 2/7 = 16/07 → 31/07')
}

{
  const close = {
    employeeId: 'cherry',
    billingMonth: '2026-07',
    cycle: CLOSE_CYCLES.PERIOD_2,
    fromDate: '2026-07-16',
    toDate: '2026-07-31',
    status: 'approved',
  }
  assert.equal(isRecordDateInApprovedCloseRange('2026-07-25', close), true)
  assert.equal(isRecordDateInApprovedCloseRange('2026-07-28', close), true)
  assert.equal(isRecordDateInApprovedCloseRange('2026-07-16', close), true)
  assert.equal(isRecordDateInApprovedCloseRange('2026-07-31', close), true)
  assert.equal(isRecordDateInApprovedCloseRange('2026-08-01', close), false)
  assert.equal(isRecordDateInApprovedCloseRange('2026-08-02', close), false)
  assert.equal(isRecordDateInApprovedCloseRange('2026-08-03', close), false)
  assert.equal(isRecordDateInApprovedCloseRange('2026-07-15', close), false)
  // submitted không khóa qua helper này nếu status khác approved
  assert.equal(isRecordDateInApprovedCloseRange('2026-07-25', { ...close, status: 'submitted' }), false)
  console.log('  [PASS] Chỉ khóa 16–31/07; tháng 8 không khóa; submitted không khóa')
}

{
  seedApprovedCloseCache([
    {
      employeeId: 'cherry',
      billingMonth: '2026-07',
      cycle: 'period2',
      fromDate: '2026-07-16',
      toDate: '2026-07-31',
      status: 'approved',
    },
  ])
  assert.equal(isEmployeeDateLockedByApprovedCloseSync('cherry', '2026-07-25'), true)
  assert.equal(isEmployeeDateLockedByApprovedCloseSync('cherry', '2026-08-03'), false)
  assert.equal(isEmployeeDateLockedByApprovedCloseSync('truc-ly', '2026-07-25'), false)
  console.log('  [PASS] Sync cache: Cherry khóa 25/07; 03/08 mở; Trúc Ly không khóa')
}

{
  // Thiếu from/to → suy từ billingMonth+cycle của phiếu, không từ recordDate
  const derived = getApprovedCloseDateRange({
    billingMonth: '2026-07',
    cycle: 'period2',
    status: 'approved',
  })
  assert.equal(derived.fromDate, '2026-07-16')
  assert.equal(derived.toDate, '2026-07-31')
  assert.equal(
    isRecordDateInApprovedCloseRange('2026-08-03', {
      employeeId: 'cherry',
      billingMonth: '2026-07',
      cycle: 'period2',
      status: 'approved',
    }),
    false,
  )
  console.log('  [PASS] Fallback range từ phiếu (không suy từ ngày HĐ tháng 8)')
}

{
  assert.equal(isPayCycleClosedForRecordDate('2026-07-25', '2026-08-03'), false)
  assert.equal(isPayCycleClosedForRecordDate('2026-08-03', '2026-08-03'), false)
  console.log('  [PASS] payrollPeriodLock lịch luôn false (không khóa tạo HĐ kỳ mới)')
}

console.log('\n=== DONE ===\n')
