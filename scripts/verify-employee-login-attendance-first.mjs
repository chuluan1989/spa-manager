/**
 * Verify employee login reuses old AttendanceCheckInForm (no clock V2).
 * Run: npx vite-node scripts/verify-employee-login-attendance-first.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appSrc = readFileSync(join(root, 'src/App.jsx'), 'utf8')
const viewSrc = readFileSync(join(root, 'src/components/attendance/AttendanceEmployeeView.jsx'), 'utf8')
const formSrc = readFileSync(join(root, 'src/components/attendance/AttendanceCheckInForm.jsx'), 'utf8')

assert.match(appSrc, /if \(user\?\.role === ROLES\.EMPLOYEE\) return 'attendance'/)
assert.match(viewSrc, /AttendanceCheckInForm/)
assert.match(viewSrc, /Tiếp tục làm việc/)
assert.match(viewSrc, /onNavigate\?\.\('invoices'\)/)
assert.match(formSrc, /Điểm danh hôm nay/)
assert.match(formSrc, /submitEmployeeAttendance/)
assert.match(formSrc, /ATTENDANCE_STATUS_OPTIONS/)

assert.equal(existsSync(join(root, 'src/utils/attendanceClockStorage.js')), false, 'clock storage must be removed')
assert.doesNotMatch(viewSrc, /attendanceClock|Chấm công vào|Chấm công ra/)
assert.doesNotMatch(readFileSync(join(root, 'src/utils/systemSettingsStorage.js'), 'utf8'), /attendanceClockTimes/)

console.log('PASS — employee login reuses old AttendanceCheckInForm only')
