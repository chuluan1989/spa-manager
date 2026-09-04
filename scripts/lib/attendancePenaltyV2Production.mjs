import { isVoidAttendanceStatus } from '../../src/constants/attendanceTypes.js'
import {
  classifyAttendanceRecord,
  recomputeMonthlyPenalties,
} from '../../src/utils/attendancePenalties.js'
import { isWeekendIsoDate } from '../../src/utils/attendanceSpecialDays.js'

export function money(n) {
  return Math.round(Number(n) || 0)
}

export function mapDbAttendanceRow(row, empName = '') {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: empName || row.employee_id,
    branchId: row.branch_id,
    date: row.attendance_date,
    status: row.status,
    stored: money(row.penalty_amount),
    penaltyAmount: money(row.penalty_amount),
    submittedAt: row.submitted_at || row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

export function computeAttendancePenaltyV2Diffs(records, holidays = []) {
  const groups = new Map()
  for (const rec of records) {
    if (isVoidAttendanceStatus(rec.status)) {
      rec.expected = 0
      rec.kind = 'void'
      rec.days = 0
      continue
    }
    const month = String(rec.date).slice(0, 7)
    const key = `${rec.employeeId}|${month}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(rec)
  }

  for (const [key, list] of groups) {
    const monthPrefix = key.split('|')[1]
    const recomputed = recomputeMonthlyPenalties(list, monthPrefix, { holidays })
    const byId = new Map(recomputed.map((row) => [row.id, row]))
    for (const rec of list) {
      const classified = classifyAttendanceRecord(rec.status, rec.date, holidays)
      rec.kind = classified.kind
      rec.days = classified.days
      rec.weekendCalendar = isWeekendIsoDate(rec.date)
      rec.expected = money(byId.get(rec.id)?.penaltyAmount ?? 0)
    }
  }

  const diffs = records.filter((r) => !isVoidAttendanceStatus(r.status) && money(r.stored) !== money(r.expected))
  const storedTotal = records.reduce((s, r) => s + money(r.stored), 0)
  const expectedTotal = records.reduce((s, r) => s + money(r.expected ?? 0), 0)
  const employeeMonths = new Set(diffs.map((r) => `${r.employeeId}|${String(r.date).slice(0, 7)}`))
  const employees = new Set(diffs.map((r) => r.employeeId))

  return {
    groups,
    diffs,
    storedTotal,
    expectedTotal,
    delta: expectedTotal - storedTotal,
    employeesAffected: employees.size,
    employeeMonthsAffected: employeeMonths.size,
  }
}
