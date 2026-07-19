/**
 * Verify employee login lands on attendance first (source-level).
 * Run: npx vite-node scripts/verify-employee-login-attendance-first.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appSrc = readFileSync(join(root, 'src/App.jsx'), 'utf8')

assert.match(
  appSrc,
  /if \(user\?\.role === ROLES\.EMPLOYEE\) return 'attendance'/,
  'Employee default page must be attendance',
)
assert.doesNotMatch(
  appSrc,
  /if \(user\?\.role === ROLES\.EMPLOYEE\) return 'invoices'/,
  'Employee must not default to invoices',
)
assert.doesNotMatch(
  appSrc,
  /if \(user\?\.role === ROLES\.EMPLOYEE\) return 'dashboard'/,
  'Employee must not default to dashboard',
)

const viewSrc = readFileSync(join(root, 'src/components/attendance/AttendanceEmployeeView.jsx'), 'utf8')
assert.match(viewSrc, /Chấm công vào/, 'Must show check-in CTA')
assert.match(viewSrc, /Chấm công ra/, 'Must show check-out CTA')
assert.match(viewSrc, /Tiếp tục làm việc/, 'Must show continue working CTA')
assert.match(viewSrc, /Giờ vào/, 'Must show check-in time')
assert.match(viewSrc, /Giờ ra/, 'Must show check-out time')
assert.match(viewSrc, /onNavigate\?\.\('invoices'\)/, 'Continue must go to invoices')

console.log('PASS — employee login attendance-first flow markers')
