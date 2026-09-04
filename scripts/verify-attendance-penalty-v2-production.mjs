/**
 * READ-ONLY — recompute V2 vs stored Production.
 * Dừng deploy nếu mismatch !== 0 hoặc total !== 11740000.
 *
 *   npx vite-node --env-file=.env.local scripts/verify-attendance-penalty-v2-production.mjs
 */
import postgres from 'postgres'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeAttendancePenaltyV2Diffs, mapDbAttendanceRow, money } from './lib/attendancePenaltyV2Production.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence/attendance-penalty-v2')
mkdirSync(OUT_DIR, { recursive: true })

const EXPECTED_TOTAL = 11740000
const EXPECTED_MISMATCH = 0

if (!process.env.DATABASE_URL) {
  console.error('Thiếu DATABASE_URL')
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
  const settingsRows = await sql`select payload from public.app_settings limit 1`
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

  const adjCounts = await sql`
    select count(*)::int as total,
           count(*) filter (where updated_at >= '2026-09-04')::int as updated_since_sep4
    from public.payroll_adjustments
  `
  const closes = await sql`
    select id, status, updated_at, snapshot
    from public.payroll_cycle_closes
    where status = 'approved'
    order by id
  `
  const snapshotHash = createHash('sha256')
    .update(JSON.stringify(closes.map((c) => ({
      id: c.id,
      status: c.status,
      updated_at: c.updated_at,
      snapshot: c.snapshot,
    }))))
    .digest('hex')

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'READ-ONLY',
    holidays,
    attendance: records.length,
    storedTotal: computed.storedTotal,
    expectedV2Total: computed.expectedTotal,
    mismatch: computed.diffs.length,
    delta: computed.delta,
    payrollAdjustments: adjCounts[0],
    approvedCloses: closes.length,
    approvedCloseSnapshotHash: snapshotHash,
    pass:
      computed.diffs.length === EXPECTED_MISMATCH
      && money(computed.storedTotal) === EXPECTED_TOTAL
      && money(computed.expectedTotal) === EXPECTED_TOTAL,
  }

  const out = path.join(OUT_DIR, 'VERIFY_PRODUCTION.json')
  writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, out }, null, 2))
  if (!report.pass) {
    console.error('STOP: recompute khác Production hiện tại — không deploy')
    process.exit(2)
  }
} finally {
  await sql.end({ timeout: 5 })
}
