/**
 * Test A–I cho auto-absent attendance (logic thuần).
 * npx vite-node scripts/verify-auto-absent-attendance.mjs
 */
import {
  canAutoAbsentOnDate,
  getPreviousIctDate,
  isInsideAttendanceBackfillGrace,
  isConfiguredWorkDay,
  shouldAutoAbsentForEmployee,
  resolveAutoAbsentSettings,
  isSystemAutoAbsentRecord,
  AUTO_ABSENT_REASON,
} from '../src/utils/autoAbsentAttendance.js'
import { resolveAutoAbsentCredentials } from '../src/utils/autoAbsentCredentials.js'
import { createAutoAbsentRecordsForDate } from '../src/utils/autoAbsentAttendanceService.js'
import { ATTENDANCE_STATUS } from '../src/constants/attendanceTypes.js'
import { computeAttendanceStats } from '../src/utils/payrollLiveHelpers.js'

let passed = 0
let failed = 0

function ok(name, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const base = resolveAutoAbsentSettings({
  autoAbsentEnabled: true,
  autoAbsentApplyFrom: '2026-07-16',
  autoAbsentWorkDays: [1, 2, 3, 4, 5, 6],
  autoAbsentHolidays: ['2026-07-20'],
  autoAbsentExemptEmployeeIds: ['emp-exempt'],
  autoAbsentPenaltyAmount: 100000,
  payroll1PeriodStart: '2026-07-01',
  payroll1LockDate: '2026-07-15',
})

const emp = {
  id: 'e1',
  branchId: 'b1',
  status: 'active',
  startDate: '2026-01-01',
  name: 'A',
}

function makeAdapters({ existing = null, failInsertOnce = false } = {}) {
  const store = new Map()
  if (existing) store.set(`${existing.employeeId}|${existing.date}`, existing)
  let insertCalls = 0
  return {
    adapters: {
      async fetchByEmployeeAndDate(employeeId, date) {
        return store.get(`${employeeId}|${date}`) ?? null
      },
      async fetchMonthRecords() {
        return []
      },
      async insertRecord(record) {
        insertCalls += 1
        if (failInsertOnce && insertCalls === 1) {
          throw new Error('simulated insert failure')
        }
        const key = `${record.employeeId}|${record.date}`
        if (store.has(key)) {
          const err = new Error('duplicate key value violates unique constraint')
          throw err
        }
        store.set(key, record)
        return record
      },
      async insertLogs() {},
      createId: () => `att-${insertCalls + 1}`,
      createLogId: () => `log-${insertCalls + 1}`,
      afterSuccess: () => {},
    },
    store,
    getInsertCalls: () => insertCalls,
  }
}

console.log('\n=== Auto-absent tests A–I ===\n')

// Shared calendar guards + ICT (không lấy ngày UTC làm attendance_date)
ok('ICT previous date format', /^\d{4}-\d{2}-\d{2}$/.test(getPreviousIctDate()))
{
  // 17:05 UTC = 00:05 ICT ngày kế → previous ICT = ngày vừa kết thúc theo VN
  const atCronUtc = new Date('2026-07-16T17:05:00.000Z') // 00:05 ICT 17/07
  ok(
    'Cron 17:05 UTC → target = ICT hôm qua (16/07)',
    getPreviousIctDate(atCronUtc) === '2026-07-16',
    `got ${getPreviousIctDate(atCronUtc)}`,
  )
  const utcMidnight = new Date('2026-07-16T00:30:00.000Z') // 07:30 ICT 16/07
  ok(
    'Giữa ngày UTC không dùng calendar UTC làm target',
    getPreviousIctDate(utcMidnight) === '2026-07-15',
    `got ${getPreviousIctDate(utcMidnight)}`,
  )
}
ok('Reason text chuẩn', AUTO_ABSENT_REASON.includes('không chấm công'))

// A
{
  const { adapters, getInsertCalls } = makeAdapters({
    existing: { id: 'x', employeeId: 'e1', date: '2026-07-16', status: 'on_time' },
  })
  const result = await createAutoAbsentRecordsForDate({
    targetDate: '2026-07-16',
    settings: base,
    employees: [emp],
    activeBranchIds: ['b1'],
    now: new Date('2026-07-17T00:10:00+07:00'),
    adapters,
  })
  ok('A. Có chấm công → không tạo', result.created === 0 && getInsertCalls() === 0)
}

// B
{
  const { adapters, store } = makeAdapters()
  const result = await createAutoAbsentRecordsForDate({
    targetDate: '2026-07-16',
    settings: base,
    employees: [emp],
    activeBranchIds: ['b1'],
    now: new Date('2026-07-17T00:10:00+07:00'),
    adapters,
  })
  const row = store.get('e1|2026-07-16')
  ok('B. Không chấm công → tạo đúng 1', result.created === 1 && Boolean(row))
  ok('B. status/penalty/source đúng',
    row?.status === ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED
    && row?.penaltyAmount === 100000
    && row?.createdBy === 'system')
}

// C
{
  const { adapters, getInsertCalls } = makeAdapters()
  const result = await createAutoAbsentRecordsForDate({
    targetDate: '2026-07-16',
    settings: base,
    employees: [{ ...emp, status: 'resigned' }],
    activeBranchIds: ['b1'],
    now: new Date('2026-07-17T00:10:00+07:00'),
    adapters,
  })
  ok('C. Inactive → không tạo', result.created === 0 && getInsertCalls() === 0)
}

// D
{
  const { adapters, getInsertCalls } = makeAdapters()
  const result = await createAutoAbsentRecordsForDate({
    targetDate: '2026-07-20',
    settings: base,
    employees: [emp],
    activeBranchIds: ['b1'],
    now: new Date('2026-07-21T00:10:00+07:00'),
    adapters,
  })
  ok('D. Ngày nghỉ chung → không tạo', result.gateReason === 'holiday' && getInsertCalls() === 0)
}

// E
{
  const { adapters, getInsertCalls } = makeAdapters()
  const result = await createAutoAbsentRecordsForDate({
    targetDate: '2026-07-16',
    settings: base,
    employees: [{ ...emp, id: 'emp-exempt' }],
    activeBranchIds: ['b1'],
    now: new Date('2026-07-17T00:10:00+07:00'),
    adapters,
  })
  ok('E. Miễn chấm công → không tạo', result.created === 0 && getInsertCalls() === 0)
}

// F
{
  const { adapters, getInsertCalls } = makeAdapters()
  const args = {
    targetDate: '2026-07-16',
    settings: base,
    employees: [emp],
    activeBranchIds: ['b1'],
    now: new Date('2026-07-17T00:10:00+07:00'),
    adapters,
  }
  const first = await createAutoAbsentRecordsForDate(args)
  const second = await createAutoAbsentRecordsForDate(args)
  ok('F. Chạy 2 lần → chỉ 1 bản ghi', first.created === 1 && second.created === 0 && getInsertCalls() === 1)
}

// G (nhận diện system + lương cập nhật khi đổi trạng thái / không trùng khi chạy lại)
ok('G. Bản ghi hệ thống nhận diện được', isSystemAutoAbsentRecord({
  createdBy: 'system',
  reason: AUTO_ABSENT_REASON,
}))
{
  const records = [{
    employeeId: 'e1',
    status: ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED,
    penaltyAmount: 100000,
  }]
  const before = computeAttendanceStats(records, 'e1')
  ok('G. Lương: nghỉ không phép +1 và phạt', before.unpermittedLeave === 1 && before.penaltyAmount === 100000)
  const afterEdit = computeAttendanceStats([{
    employeeId: 'e1',
    status: ATTENDANCE_STATUS.FULL_DAY_PERMITTED,
    penaltyAmount: 0,
  }], 'e1')
  ok('G. Admin sửa trạng thái → lương tính lại', afterEdit.unpermittedLeave === 0 && afterEdit.penaltyAmount === 0)
  const dupSafe = computeAttendanceStats(records, 'e1')
  ok('G. Không trừ trùng khi chỉ có 1 bản ghi', dupSafe.penaltyAmount === 100000)
}

// H
{
  const disabled = resolveAutoAbsentSettings({ ...base, autoAbsentEnabled: false })
  const { adapters, getInsertCalls } = makeAdapters()
  const result = await createAutoAbsentRecordsForDate({
    targetDate: '2026-07-16',
    settings: disabled,
    employees: [emp],
    activeBranchIds: ['b1'],
    now: new Date('2026-07-17T00:10:00+07:00'),
    adapters,
  })
  ok('H. Tắt tính năng → không tạo', result.gateReason === 'disabled' && getInsertCalls() === 0)
}

// I — sai/thiếu secret → fail rõ ràng
{
  const missing = resolveAutoAbsentCredentials({}, { requireServiceRole: true })
  ok('I. Thiếu secret → fail rõ', !missing.ok && /SUPABASE_URL|SERVICE_ROLE/i.test(missing.error))
  const missingKey = resolveAutoAbsentCredentials(
    { SUPABASE_URL: 'https://example.supabase.co' },
    { requireServiceRole: true },
  )
  ok('I. Có URL thiếu SERVICE_ROLE → fail', !missingKey.ok && /SERVICE_ROLE/i.test(missingKey.error))
  const anonIgnored = resolveAutoAbsentCredentials(
    {
      SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-should-not-pass-ci',
    },
    { requireServiceRole: true, dryRun: true },
  )
  ok('I. CI không chấp nhận anon thay service role', !anonIgnored.ok)
  const okCreds = resolveAutoAbsentCredentials(
    {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    },
    { requireServiceRole: true },
  )
  ok('I. Đủ secret → ok (không log key)', okCreds.ok && okCreds.source === 'service_role')
}

// Extra: backfill grace + applyFrom
ok('Backfill grace 01–15 trước hạn', isInsideAttendanceBackfillGrace('2026-07-12', base, new Date('2026-07-12T10:00:00+07:00')))
ok('Trước applyFrom bị chặn', canAutoAbsentOnDate('2026-07-10', base, new Date('2026-07-20')).reason === 'before_apply_from')
ok('CN không thuộc lịch mặc định', !isConfiguredWorkDay('2026-07-12', base.autoAbsentWorkDays))
ok('shouldAutoAbsent: đã có record', shouldAutoAbsentForEmployee(emp, '2026-07-16', base, { id: 'x' }).reason === 'already_has_record')

// Partial failure continues
{
  const { adapters } = makeAdapters({ failInsertOnce: true })
  const result = await createAutoAbsentRecordsForDate({
    targetDate: '2026-07-16',
    settings: base,
    employees: [emp, { ...emp, id: 'e2', name: 'B' }],
    activeBranchIds: ['b1'],
    now: new Date('2026-07-17T00:10:00+07:00'),
    adapters,
  })
  ok('Lỗi 1 NV vẫn tạo NV khác', result.created === 1 && result.errors === 1)
}

console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
