/**
 * DRY-RUN ONLY — Attendance Penalty V2 vs stored Production.
 * Dùng cùng engine `src/utils/attendancePenalties.js`. Không ghi DB.
 *
 *   npx vite-node --env-file=.env.local scripts/dry-run-attendance-penalty-v2.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ATTENDANCE_STATUS, isVoidAttendanceStatus } from '../src/constants/attendanceTypes.js'
import { WEEKDAY_FULL_PENALTY, WEEKDAY_PERMITTED_QUOTA_DAYS } from '../src/utils/attendancePenalties.js'
import { isAttendanceSpecialDay } from '../src/utils/attendanceSpecialDays.js'
import { computeAttendancePenaltyV2Diffs, mapDbAttendanceRow, money } from './lib/attendancePenaltyV2Production.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence/attendance-penalty-v2')
mkdirSync(OUT_DIR, { recursive: true })

async function resolveSupabase() {
  const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
  const html = await fetch(BASE).then((r) => r.text())
  const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
  if (!jsMatch) throw new Error('Không tìm thấy bundle JS')
  const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
  const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if (!url || !key) throw new Error('Không lấy được Supabase')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function fetchAll(sb, table, select) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
    from += 1000
  }
  return rows
}

const sb = await resolveSupabase()
const attendanceRows = await fetchAll(sb, 'attendance', '*')
const employees = await fetchAll(sb, 'employees', 'id,name,branch_id,status')
const settingsRows = await fetchAll(sb, 'app_settings', 'id,payload')
const payload = settingsRows[0]?.payload || {}
const holidays = Array.isArray(payload.autoAbsentHolidays)
  ? payload.autoAbsentHolidays.map((d) => String(d).slice(0, 10)).filter(Boolean)
  : []
const empName = Object.fromEntries(employees.map((e) => [e.id, e.name || e.id]))

const records = attendanceRows.map((row) => mapDbAttendanceRow(row, empName[row.employee_id]))
const computed = computeAttendancePenaltyV2Diffs(records, holidays)

const specialPermittedMisclass = records.filter((r) =>
  isAttendanceSpecialDay(r.date, holidays)
  && [
    ATTENDANCE_STATUS.FULL_DAY_PERMITTED,
    ATTENDANCE_STATUS.HALF_MORNING_PERMITTED,
    ATTENDANCE_STATUS.HALF_EVENING_PERMITTED,
  ].includes(r.status)
  && !isVoidAttendanceStatus(r.status),
)

function summarizeEmployeeMonth(list) {
  const weekdayPermitted = list.filter((r) => r.kind === 'weekday_permitted')
  const weekdayUnperm = list.filter((r) => r.kind === 'weekday_unpermitted')
  const special = list.filter((r) => r.kind === 'special_leave')
  const permittedDays = weekdayPermitted.reduce((s, r) => s + (r.days || 0), 0)
  const stored = list.reduce((s, r) => s + money(r.stored), 0)
  const expected = list.reduce((s, r) => s + money(r.expected), 0)
  return {
    employeeId: list[0].employeeId,
    employeeName: list[0].employeeName,
    month: String(list[0].date).slice(0, 7),
    weekdayPermittedDays: permittedDays,
    quotaUsed: Math.min(WEEKDAY_PERMITTED_QUOTA_DAYS, permittedDays),
    excessDays: Math.max(0, permittedDays - WEEKDAY_PERMITTED_QUOTA_DAYS),
    weekdayUnpermittedDays: weekdayUnperm.reduce((s, r) => s + (r.days || 0), 0),
    specialDays: special.reduce((s, r) => s + (r.days || 0), 0),
    stored,
    expected,
    delta: expected - stored,
  }
}

const empMonths = [...computed.groups.values()].map(summarizeEmployeeMonth)
const empMonthsTouched = empMonths.filter((r) => r.delta !== 0)

const v2Examples = (() => {
  const sim = (daysList) => {
    let used = 0
    let penalty = 0
    for (const days of daysList) {
      const freeRemaining = Math.max(0, WEEKDAY_PERMITTED_QUOTA_DAYS - used)
      const billed = Math.max(0, days - Math.min(days, freeRemaining))
      penalty += billed * WEEKDAY_FULL_PENALTY
      used += days
    }
    return { days: daysList.reduce((a, b) => a + b, 0), penalty }
  }
  return {
    d3: sim([1, 1, 1]),
    d35: sim([1, 1, 1, 0.5]),
    d4: sim([1, 1, 1, 1]),
    d45: sim([1, 1, 1, 1, 0.5]),
  }
})()

const report = {
  generatedAt: new Date().toISOString(),
  mode: 'DRY-RUN-ONLY',
  engine: 'src/utils/attendancePenalties.js',
  rule: {
    weekdayQuotaDays: WEEKDAY_PERMITTED_QUOTA_DAYS,
    holidaysFromSettings: holidays,
    holidayCount: holidays.length,
    lateEarlyUnchanged: true,
  },
  selfCheckExamples: v2Examples,
  totals: {
    attendance: records.length,
    mismatchedRecords: computed.diffs.length,
    employeesAffected: computed.employeesAffected,
    employeeMonthsAffected: computed.employeeMonthsAffected,
    storedTotal: computed.storedTotal,
    expectedV2Total: computed.expectedTotal,
    delta: computed.delta,
  },
  specialDayAudit: {
    permittedLeaveOnSpecialDay: specialPermittedMisclass.length,
    items: specialPermittedMisclass.map((r) => ({
      id: r.id,
      date: r.date,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      status: r.status,
      days: r.days,
      stored: r.stored,
      expected: r.expected,
      delta: money(r.expected) - money(r.stored),
    })),
  },
  mismatchedRecords: computed.diffs.map((r) => ({
    id: r.id,
    date: r.date,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    status: r.status,
    kind: r.kind,
    days: r.days,
    stored: r.stored,
    expected: r.expected,
    delta: money(r.expected) - money(r.stored),
  })),
  employeeMonths: empMonthsTouched.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
}

writeFileSync(path.join(OUT_DIR, 'DRY_RUN_V2.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({
  selfCheck: v2Examples,
  holidays,
  totals: report.totals,
  specialPermitted: report.specialDayAudit.permittedLeaveOnSpecialDay,
  topEmpMonths: empMonthsTouched.slice(0, 20),
}, null, 2))
console.log('Wrote', path.join(OUT_DIR, 'DRY_RUN_V2.json'))
