/**
 * Attendance Penalty V2 — backfill Production `attendance.penalty_amount` only.
 * Không sửa payroll_adjustment, không sửa payroll_cycle_closes.
 *
 *   npx vite-node --env-file=.env.local scripts/apply-attendance-penalty-v2.mjs
 *   APPLY=1 CONFIRM=ATTENDANCE_PENALTY_V2 npx vite-node --env-file=.env.local scripts/apply-attendance-penalty-v2.mjs
 */
import postgres from 'postgres'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isVoidAttendanceStatus } from '../src/constants/attendanceTypes.js'
import { computeAttendancePenaltyV2Diffs, mapDbAttendanceRow, money } from './lib/attendancePenaltyV2Production.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence/attendance-penalty-v2')
mkdirSync(OUT_DIR, { recursive: true })

const APPLY = process.env.APPLY === '1'
const CONFIRM = process.env.CONFIRM || ''
const REQUIRED = 'ATTENDANCE_PENALTY_V2'
const STAMP = new Date().toISOString().replace(/[:.]/g, '-')

if (!process.env.DATABASE_URL) {
  console.error('Thiếu DATABASE_URL')
  process.exit(1)
}

if (APPLY && CONFIRM !== REQUIRED) {
  console.error(`APPLY=1 cần CONFIRM=${REQUIRED}`)
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
})

function toIsoDate(value) {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

try {
  const settingsRows = await sql`select id, payload from public.app_settings limit 1`
  const payload = settingsRows[0]?.payload || {}
  const holidays = Array.isArray(payload.autoAbsentHolidays)
    ? payload.autoAbsentHolidays.map((d) => String(d).slice(0, 10)).filter(Boolean)
    : []

  const employees = await sql`select id, name from public.employees`
  const empName = Object.fromEntries(employees.map((e) => [e.id, e.name || e.id]))

  const attendanceRows = await sql`
    select id, employee_id, branch_id, attendance_date, status, penalty_amount, created_at, updated_at
    from public.attendance
  `

  const records = attendanceRows.map((row) => mapDbAttendanceRow({
    ...row,
    attendance_date: toIsoDate(row.attendance_date),
  }, empName[row.employee_id]))

  const computed = computeAttendancePenaltyV2Diffs(records, holidays)
  const backupPath = path.join(OUT_DIR, `BACKUP_${STAMP}.json`)
  const reportPath = path.join(OUT_DIR, APPLY ? `APPLY_${STAMP}.json` : `APPLY_PLAN_${STAMP}.json`)

  const backup = computed.diffs.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    date: r.date,
    status: r.status,
    kind: r.kind,
    stored: r.stored,
    expected: r.expected,
    submittedAt: r.submittedAt,
    updatedAt: r.updatedAt,
  }))
  writeFileSync(backupPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    holidays,
    count: backup.length,
    rows: backup,
  }, null, 2))

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'APPLY' : 'DRY-RUN',
    engine: 'src/utils/attendancePenalties.js',
    holidays,
    totals: {
      attendance: records.length,
      mismatchedRecords: computed.diffs.length,
      employeesAffected: computed.employeesAffected,
      employeeMonthsAffected: computed.employeeMonthsAffected,
      storedTotal: computed.storedTotal,
      expectedV2Total: computed.expectedTotal,
      delta: computed.delta,
    },
    backupPath,
    applied: false,
    updated: 0,
    skippedUnchanged: 0,
    errors: [],
    remainingMismatches: null,
  }

  if (!APPLY) {
    writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(JSON.stringify({
      mode: report.mode,
      totals: report.totals,
      backupPath,
      reportPath,
    }, null, 2))
    process.exit(0)
  }

  for (const row of computed.diffs) {
    if (isVoidAttendanceStatus(row.status)) continue
    try {
      const updated = await sql`
        update public.attendance
        set penalty_amount = ${money(row.expected)},
            updated_at = now()
        where id = ${row.id}
          and penalty_amount = ${money(row.stored)}
        returning id, penalty_amount
      `
      if (updated.length === 0) {
        report.skippedUnchanged += 1
        report.errors.push({ id: row.id, error: 'optimistic_lock_or_already_changed' })
        continue
      }
      report.updated += 1
    } catch (err) {
      report.errors.push({ id: row.id, error: err.message })
    }
  }

  const afterRows = await sql`
    select id, employee_id, branch_id, attendance_date, status, penalty_amount, created_at, updated_at
    from public.attendance
  `
  const afterRecords = afterRows.map((row) => mapDbAttendanceRow({
    ...row,
    attendance_date: toIsoDate(row.attendance_date),
  }, empName[row.employee_id]))
  const after = computeAttendancePenaltyV2Diffs(afterRecords, holidays)
  report.applied = after.diffs.length === 0 && report.errors.length === 0
  report.remainingMismatches = after.diffs.length
  report.afterTotals = {
    storedTotal: after.storedTotal,
    expectedV2Total: after.expectedTotal,
    delta: after.delta,
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    mode: report.mode,
    updated: report.updated,
    remainingMismatches: report.remainingMismatches,
    applied: report.applied,
    afterTotals: report.afterTotals,
    errors: report.errors.length,
    backupPath,
    reportPath,
  }, null, 2))
  process.exit(report.applied ? 0 : 1)
} catch (err) {
  console.error(err)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
