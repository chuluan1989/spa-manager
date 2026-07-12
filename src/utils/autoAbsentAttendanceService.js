import { calculatePenaltyForNewRecord, getMonthPrefixFromDate } from './attendancePenalties'
import {
  buildAutoAbsentRecord,
  canAutoAbsentOnDate,
  getPreviousIctDate,
  resolveAutoAbsentSettings,
  shouldAutoAbsentForEmployee,
} from './autoAbsentAttendance'
import {
  createAttendanceId,
  createAttendanceLogId,
  fetchAttendanceByEmployeeAndDate,
  fetchAttendanceForEmployeeMonth,
  insertAttendanceEditLogs,
  insertAttendanceRecord,
} from '../repositories/attendanceRepository'
import { notifyDataSynced } from './dataSyncEvents'

/**
 * Tạo nghỉ không phép cho một ngày (idempotent).
 * @returns {{ created: number, skipped: number, details: Array }}
 */
export async function createAutoAbsentRecordsForDate({
  targetDate,
  settings,
  employees,
  activeBranchIds = null,
  now = new Date(),
}) {
  const cfg = resolveAutoAbsentSettings(settings)
  const gate = canAutoAbsentOnDate(targetDate, cfg, now)
  if (!gate.ok) {
    return {
      created: 0,
      skipped: employees.length,
      details: [{ reason: gate.reason, date: targetDate }],
      gateReason: gate.reason,
    }
  }

  const branchSet = activeBranchIds ? new Set(activeBranchIds) : null
  let created = 0
  let skipped = 0
  const details = []

  for (const employee of employees) {
    if (branchSet && employee.branchId && !branchSet.has(employee.branchId)) {
      skipped += 1
      details.push({ employeeId: employee.id, reason: 'inactive_branch' })
      continue
    }

    let existing = null
    try {
      existing = await fetchAttendanceByEmployeeAndDate(employee.id, targetDate)
    } catch (error) {
      skipped += 1
      details.push({ employeeId: employee.id, reason: 'lookup_error', error: error?.message })
      continue
    }

    const eligible = shouldAutoAbsentForEmployee(employee, targetDate, cfg, existing)
    if (!eligible.ok) {
      skipped += 1
      details.push({ employeeId: employee.id, reason: eligible.reason })
      continue
    }

    try {
      const monthPrefix = getMonthPrefixFromDate(targetDate)
      const monthRecords = await fetchAttendanceForEmployeeMonth(employee.id, monthPrefix)
      const penaltyAmount = cfg.autoAbsentPenaltyAmount > 0
        ? cfg.autoAbsentPenaltyAmount
        : calculatePenaltyForNewRecord('full_day_unpermitted', monthRecords, targetDate)

      const record = buildAutoAbsentRecord({
        employee,
        date: targetDate,
        penaltyAmount,
        id: createAttendanceId(),
      })

      await insertAttendanceRecord(record)
      await insertAttendanceEditLogs([{
        id: createAttendanceLogId(),
        attendanceId: record.id,
        editorId: 'system',
        editorName: 'Hệ thống',
        fieldName: 'create',
        oldValue: '',
        newValue: record.status,
        note: record.reason,
      }])
      created += 1
      details.push({ employeeId: employee.id, reason: 'created', attendanceId: record.id })
    } catch (error) {
      const message = error?.message ?? String(error)
      if (/duplicate key|unique constraint|đã có bản ghi/i.test(message)) {
        skipped += 1
        details.push({ employeeId: employee.id, reason: 'already_has_record' })
      } else {
        skipped += 1
        details.push({ employeeId: employee.id, reason: 'insert_error', error: message })
      }
    }
  }

  if (created > 0) notifyDataSynced(['attendance'])
  return { created, skipped, details, gateReason: '' }
}

/** Job nightly: chốt ngày hôm qua (ICT). */
export async function runAutoAbsentNightlyJob({
  settings,
  employees,
  activeBranchIds = null,
  now = new Date(),
}) {
  const targetDate = getPreviousIctDate(now)
  const result = await createAutoAbsentRecordsForDate({
    targetDate,
    settings,
    employees,
    activeBranchIds,
    now,
  })
  return { targetDate, ...result }
}
