/**
 * UAT — Root rule: không tạo/nhắc kỳ lương & thiếu chấm công trước startDate.
 * Run: npx vite-node scripts/verify-employment-start-period-gate-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { CLOSE_CYCLES, getCloseCycleRange } from '../src/utils/payrollCycleClose/payCycleCalendar.js'
import {
  buildEmployeeAttendancePeriodDays,
} from '../src/utils/payrollCycleClose/attendancePeriodReview.js'
import {
  listDuePayrollCloseTargets,
  filterDueTargetsForEmployee,
  resolvePayrollCloseRemindTarget,
} from '../src/utils/payrollCycleClose/closeRemind.js'
import {
  clampRangeToEmployment,
  formatPayrollCloseSubmitCta,
  isClosePeriodOutsideEmployment,
  MISSING_EMPLOYMENT_START_WARNING,
  resolveEmployeeEmploymentStartDate,
} from '../src/utils/payrollCycleClose/employmentPeriodGate.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

console.log('\n=== UAT — Employment start period gate ===\n')

// Case 1 — NV startDate 01/07 → không thấy kỳ tháng 6
{
  const employee = { id: 'nv-july', startDate: '2026-07-01', branchId: 'soc-trang' }
  const due = listDuePayrollCloseTargets('2026-08-04')
  const { targets } = filterDueTargetsForEmployee(due, employee)

  assert.equal(
    targets.some((t) => t.billingMonth === '2026-06'),
    false,
    'không còn kỳ tháng 6',
  )
  assert.equal(
    targets.some((t) => t.fromDate === '2026-06-01' || t.fromDate === '2026-06-16'),
    false,
  )
  assert.ok(
    isClosePeriodOutsideEmployment(
      getCloseCycleRange('2026-06', CLOSE_CYCLES.PERIOD_1),
      '2026-07-01',
    ),
  )
  assert.ok(
    isClosePeriodOutsideEmployment(
      getCloseCycleRange('2026-06', CLOSE_CYCLES.PERIOD_2),
      '2026-07-01',
    ),
  )
  console.log('  [PASS] 1. startDate 01/07 → loại cả Kỳ 1+2 tháng 6')
}

// Case 2 — startDate 10/07 → Kỳ 1/7 chỉ tính 10–15/07
{
  const range = getCloseCycleRange('2026-07', CLOSE_CYCLES.PERIOD_1)
  const clamped = clampRangeToEmployment(range.fromDate, range.toDate, '2026-07-10')
  assert.equal(clamped.fromDate, '2026-07-10')
  assert.equal(clamped.toDate, '2026-07-15')
  assert.equal(clamped.clamped, true)

  const { summary } = buildEmployeeAttendancePeriodDays({
    employeeId: 'nv-mid',
    records: [],
    fromDate: range.fromDate,
    toDate: range.toDate,
    todayDate: '2026-07-20',
    employmentStartDate: '2026-07-10',
  })
  assert.ok(!summary.missingDates.some((d) => d < '2026-07-10'))
  assert.ok(!summary.missingDates.includes('2026-07-01'))
  assert.ok(!summary.missingDates.includes('2026-07-09'))
  assert.deepEqual(
    summary.missingDates,
    ['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15'],
  )
  console.log('  [PASS] 2. startDate 10/07 → Kỳ 1/7 chỉ 10–15/07')
}

// Case 3 — hôm nay 04/08 → CTA kỳ đang đến hạn theo lịch (Kỳ 2 · 16–31/07)
{
  assert.equal(formatPayrollCloseSubmitCta('Kỳ 2'), 'Gửi chốt lương Kỳ 2')

  const employee = { id: 'nv-july', startDate: '2026-07-01', branchId: 'soc-trang' }
  const due = listDuePayrollCloseTargets('2026-08-04')
  const { targets } = filterDueTargetsForEmployee(due, employee)
  const windowTarget = resolvePayrollCloseRemindTarget('2026-08-04')
  assert.equal(windowTarget.cycle, CLOSE_CYCLES.PERIOD_2)
  assert.equal(windowTarget.billingMonth, '2026-07')
  assert.equal(windowTarget.fromDate, '2026-07-16')
  assert.equal(windowTarget.toDate, '2026-07-31')
  assert.ok(targets.some((t) => t.billingMonth === '2026-07' && t.cycle === CLOSE_CYCLES.PERIOD_2))
  assert.equal(formatPayrollCloseSubmitCta(windowTarget.cycleLabel), 'Gửi chốt lương Kỳ 2')
  console.log('  [PASS] 3. 04/08 → CTA Kỳ 2 theo lịch · 16/07→31/07')
}

// Case 4 — banner không còn 01/06–15/06
{
  const employee = { id: 'nv-july', startDate: '2026-07-01', branchId: 'soc-trang' }
  const { targets } = filterDueTargetsForEmployee(
    listDuePayrollCloseTargets('2026-08-04'),
    employee,
  )
  assert.equal(
    targets.some((t) => t.rangeLabel?.includes('01/06') || t.fromDate === '2026-06-01'),
    false,
  )
  const banner = read('src/components/common/PayrollCloseRemindBanner.jsx')
  assert.match(banner, /formatPayrollCloseSubmitCta/)
  assert.doesNotMatch(banner, /Kiểm tra &amp; Chốt kỳ lương|Kiểm tra & Chốt kỳ lương/)
  console.log('  [PASS] 4. không còn 01/06–15/06 trong due targets / CTA mới')
}

// Missing startDate — không kéo nhiều tháng; có warning Admin
{
  const employee = { id: 'no-start', branchId: 'soc-trang', startDate: '' }
  const resolved = resolveEmployeeEmploymentStartDate(employee)
  assert.equal(resolved.startDate, '')
  assert.equal(resolved.source, 'missing')
  assert.match(resolved.warning, /Admin|startDate|bắt đầu làm việc/)

  const due = listDuePayrollCloseTargets('2026-08-04')
  const { targets, employmentStartWarning } = filterDueTargetsForEmployee(due, employee)
  assert.equal(targets.length, 1)
  assert.equal(targets[0].submitDate, due[due.length - 1].submitDate)
  assert.equal(employmentStartWarning, MISSING_EMPLOYMENT_START_WARNING)
  console.log('  [PASS] thiếu startDate → chỉ kỳ mới nhất + warning Admin')
}

// Fallback branch history
{
  const employee = {
    id: 'hist',
    branchId: 'tram-spa',
    startDate: '',
    branchHistory: [
      {
        effectiveDate: '2026-07-05',
        fromBranchId: 'soc-trang',
        toBranchId: 'tram-spa',
      },
    ],
  }
  const resolved = resolveEmployeeEmploymentStartDate(employee)
  assert.equal(resolved.startDate, '2026-07-05')
  assert.equal(resolved.source, 'branch_history')
  console.log('  [PASS] thiếu startDate hồ sơ → lấy từ branch history')
}

// Source guards
{
  const closeRemind = read('src/utils/payrollCycleClose/closeRemind.js')
  assert.match(closeRemind, /filterDueTargetsForEmployee/)
  assert.match(closeRemind, /isClosePeriodOutsideEmployment|resolveEmployeeEmploymentStartDate/)

  const missing = read('src/utils/missingAttendanceRemind.js')
  assert.match(missing, /before_employment_start/)
  assert.match(missing, /resolveEmployeeEmploymentStartDate/)

  const preview = read('src/utils/payrollCycleClose/buildCloseCyclePreview.js')
  assert.match(preview, /periodBeforeEmployment/)
  assert.match(preview, /employmentStartWarning/)

  const submit = read('src/utils/payrollCycleClose/submitCloseCycle.js')
  assert.match(submit, /periodBeforeEmployment/)

  const panel = read('src/components/salary/PayrollCycleClosePanel.jsx')
  assert.match(panel, /Gửi chốt lương \$\{cycleLabel\}/)

  console.log('  [PASS] source guards: remind/preview/submit/CTA')
}

console.log('\n=== ALL PASS — employment start period gate UAT ===\n')
