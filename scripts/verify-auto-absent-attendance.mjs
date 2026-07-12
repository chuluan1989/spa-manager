/**
 * Test A–I + applyFrom runtime (không hardcode ngày áp dụng).
 * npx vite-node scripts/verify-auto-absent-attendance.mjs
 */
import {
  AUTO_ABSENT_MODULE_STATUS,
  AUTO_ABSENT_MISSING_APPLY_FROM_MESSAGE,
  canAutoAbsentOnDate,
  getPreviousIctDate,
  isInsideAttendanceBackfillGrace,
  isConfiguredWorkDay,
  shouldAutoAbsentForEmployee,
  resolveAutoAbsentSettings,
  getAutoAbsentConfigGate,
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

/** applyFrom chỉ từ cấu hình — không default 2026-07-16 */
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
          throw new Error('duplicate key value violates unique constraint')
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

console.log('\n=== Auto-absent tests (applyFrom runtime) ===\n')

ok('Module status Production Stable', AUTO_ABSENT_MODULE_STATUS === 'Production Stable')
ok(
  'Default applyFrom = null (không hardcode)',
  resolveAutoAbsentSettings({}).autoAbsentApplyFrom === null,
)
ok('ICT previous date format', /^\d{4}-\d{2}-\d{2}$/.test(getPreviousIctDate()))
{
  const atCronUtc = new Date('2026-07-16T17:05:00.000Z')
  ok('Cron 17:05 UTC → ICT hôm qua', getPreviousIctDate(atCronUtc) === '2026-07-16')
}
ok('Reason text chuẩn', AUTO_ABSENT_REASON.includes('không chấm công'))

// Config gate
{
  const missing = getAutoAbsentConfigGate({ autoAbsentEnabled: true, autoAbsentApplyFrom: null })
  ok(
    'enabled + applyFrom null → không chạy + cảnh báo',
    !missing.ok
      && missing.reason === 'missing_apply_from'
      && missing.message === AUTO_ABSENT_MISSING_APPLY_FROM_MESSAGE,
  )
  const disabled = getAutoAbsentConfigGate({ autoAbsentEnabled: false, autoAbsentApplyFrom: '2026-07-16' })
  ok('enabled=false → không chạy', !disabled.ok && disabled.reason === 'disabled')
  const future = getAutoAbsentConfigGate(
    { autoAbsentEnabled: true, autoAbsentApplyFrom: '2026-08-01' },
    new Date('2026-07-12T10:00:00+07:00'),
  )
  ok('applyFrom > hôm nay → không chạy', !future.ok && future.reason === 'apply_from_future')
  const ready = getAutoAbsentConfigGate(
    { autoAbsentEnabled: true, autoAbsentApplyFrom: '2026-07-16' },
    new Date('2026-07-17T00:10:00+07:00'),
  )
  ok('enabled + applyFrom <= hôm nay → được phép', ready.ok)
}

// 1–2: chỉ ngày >= applyFrom
ok(
  '1. Ngày >= applyFrom được xét',
  canAutoAbsentOnDate('2026-07-16', base, new Date('2026-07-17T00:10:00+07:00')).ok,
)
ok(
  '2. Ngày trước applyFrom tuyệt đối không tạo',
  canAutoAbsentOnDate('2026-07-15', base, new Date('2026-07-17T00:10:00+07:00')).reason === 'before_apply_from',
)

// 3. Đổi applyFrom 16/07 → 01/08 (không sửa code logic — chỉ đổi settings)
{
  const august = resolveAutoAbsentSettings({ ...base, autoAbsentApplyFrom: '2026-08-01' })
  const { adapters: a1, getInsertCalls: c1 } = makeAdapters()
  const before = await createAutoAbsentRecordsForDate({
    targetDate: '2026-07-17',
    settings: august,
    employees: [emp],
    activeBranchIds: ['b1'],
    now: new Date('2026-08-02T00:10:00+07:00'),
    adapters: a1,
  })
  ok('3a. applyFrom=01/08 → ngày 17/07 không tạo', before.gateReason === 'before_apply_from' && c1() === 0)

  const { adapters: a2, getInsertCalls: c2 } = makeAdapters()
  // 2026-08-03 is Monday
  const after = await createAutoAbsentRecordsForDate({
    targetDate: '2026-08-03',
    settings: august,
    employees: [emp],
    activeBranchIds: ['b1'],
    now: new Date('2026-08-04T00:10:00+07:00'),
    adapters: a2,
  })
  ok('3b. applyFrom=01/08 → ngày 03/08 tạo được', after.created === 1 && c2() === 1)
}

// 4. Tắt enabled
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
  ok('4. enabled=false → cron không tạo dữ liệu', result.gateReason === 'disabled' && getInsertCalls() === 0)
}

// 5. Nút Admin dùng cùng createAutoAbsentRecordsForDate + applyFrom
{
  const { adapters, getInsertCalls } = makeAdapters()
  const noFrom = resolveAutoAbsentSettings({ autoAbsentEnabled: true, autoAbsentApplyFrom: '' })
  const result = await createAutoAbsentRecordsForDate({
    targetDate: '2026-07-16',
    settings: noFrom,
    employees: [emp],
    activeBranchIds: ['b1'],
    now: new Date('2026-07-17T00:10:00+07:00'),
    adapters,
  })
  ok('5. Admin/cron chung: thiếu applyFrom → không tạo', result.gateReason === 'missing_apply_from' && getInsertCalls() === 0)
}

// A–I regression
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
  ok('B. status/source đúng', row?.createdBy === 'system' && row?.status === ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED)
}
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
  ok('F. Chạy 2 lần → chỉ 1', first.created === 1 && second.created === 0 && getInsertCalls() === 1)
}
ok('G. Bản ghi hệ thống', isSystemAutoAbsentRecord({ createdBy: 'system', reason: AUTO_ABSENT_REASON }))
{
  const stats = computeAttendanceStats([{
    employeeId: 'e1',
    status: ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED,
    penaltyAmount: 100000,
  }], 'e1')
  ok('G. Lương phạt 1 lần', stats.unpermittedLeave === 1 && stats.penaltyAmount === 100000)
}
ok('H covered by test 4', true)
{
  const missing = resolveAutoAbsentCredentials({}, { requireServiceRole: true })
  ok('I. Thiếu secret → fail', !missing.ok)
}

ok('Backfill grace', isInsideAttendanceBackfillGrace('2026-07-12', base, new Date('2026-07-12T10:00:00+07:00')))
ok('CN không lịch', !isConfiguredWorkDay('2026-07-12', base.autoAbsentWorkDays))
ok('already_has_record', shouldAutoAbsentForEmployee(emp, '2026-07-16', base, { id: 'x' }).reason === 'already_has_record')

console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
console.log(`AUTO_ABSENT_MODULE_STATUS = ${AUTO_ABSENT_MODULE_STATUS}\n`)
process.exit(failed > 0 ? 1 : 0)
