/**
 * Unit tests cho cơ chế tự ghi nhận nghỉ không phép.
 * node scripts/verify-auto-absent-attendance.mjs
 */
import {
  canAutoAbsentOnDate,
  getPreviousIctDate,
  isInsideAttendanceBackfillGrace,
  isConfiguredWorkDay,
  shouldAutoAbsentForEmployee,
  resolveAutoAbsentSettings,
  isSystemAutoAbsentRecord,
} from '../src/utils/autoAbsentAttendance.js'

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
  payroll1PeriodStart: '2026-07-01',
  payroll1LockDate: '2026-07-15',
})

console.log('\n=== Auto-absent unit tests ===\n')

ok('T2 là ngày làm việc', isConfiguredWorkDay('2026-07-13', base.autoAbsentWorkDays)) // Mon
ok('CN không phải ngày làm (mặc định)', !isConfiguredWorkDay('2026-07-12', base.autoAbsentWorkDays))

ok('Trong hạn bổ sung 01–15/07 chưa tự ghi', isInsideAttendanceBackfillGrace('2026-07-12', base, new Date('2026-07-12T10:00:00+07:00')))
ok('Sau hạn bổ sung cho phép xét ngày trong kỳ', !isInsideAttendanceBackfillGrace('2026-07-12', base, new Date('2026-07-16T00:30:00+07:00')))

ok('Trước applyFrom bị chặn', canAutoAbsentOnDate('2026-07-10', base, new Date('2026-07-20')).reason === 'before_apply_from')
ok('Ngày lễ bị chặn', canAutoAbsentOnDate('2026-07-20', base, new Date('2026-07-21')).reason === 'holiday')
ok('Ngày làm sau applyFrom được phép', canAutoAbsentOnDate('2026-07-16', base, new Date('2026-07-17T00:10:00+07:00')).ok)

const emp = { id: 'e1', branchId: 'b1', status: 'active', startDate: '2026-01-01', name: 'A' }
ok('NV active thiếu bản ghi → đủ điều kiện', shouldAutoAbsentForEmployee(emp, '2026-07-16', base, null).ok)
ok('Đã có bản ghi → không tạo trùng', shouldAutoAbsentForEmployee(emp, '2026-07-16', base, { id: 'x' }).reason === 'already_has_record')
ok('Inactive → không tạo', shouldAutoAbsentForEmployee({ ...emp, status: 'resigned' }, '2026-07-16', base, null).reason === 'inactive')
ok('Exempt → không tạo', shouldAutoAbsentForEmployee({ ...emp, id: 'emp-exempt' }, '2026-07-16', base, null).reason === 'exempt')
ok('Trước startDate → không tạo', shouldAutoAbsentForEmployee({ ...emp, startDate: '2026-08-01' }, '2026-07-16', base, null).reason === 'before_start_date')

ok('Nhận diện bản ghi hệ thống', isSystemAutoAbsentRecord({ createdBy: 'system', reason: 'Hệ thống tự ghi nhận do nhân viên không chấm công trong ngày' }))
ok('getPreviousIctDate trả YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(getPreviousIctDate()))

console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
