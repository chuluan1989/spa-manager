import { ATTENDANCE_STATUS, getAttendanceStatusConfig } from '../constants/attendanceTypes'
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

const defaultAdapters = {
  fetchByEmployeeAndDate: fetchAttendanceByEmployeeAndDate,
  fetchMonthRecords: fetchAttendanceForEmployeeMonth,
  insertRecord: insertAttendanceRecord,
  insertLogs: insertAttendanceEditLogs,
  createId: createAttendanceId,
  createLogId: createAttendanceLogId,
  afterSuccess: () => notifyDataSynced(['attendance']),
}

/**
 * Hàm chốt chung — dùng cho nút Admin và GitHub Action/cron.
 * Idempotent theo employee_id + attendance_date; lỗi 1 NV không dừng cả batch.
 */
export async function createAutoAbsentRecordsForDate({
  targetDate,
  settings,
  employees,
  activeBranchIds = null,
  now = new Date(),
  dryRun = false,
  adapters = defaultAdapters,
}) {
  const cfg = resolveAutoAbsentSettings(settings)
  const gate = canAutoAbsentOnDate(targetDate, cfg, now)
  if (!gate.ok) {
    return {
      created: 0,
      skipped: Array.isArray(employees) ? employees.length : 0,
      errors: 0,
      details: [{ reason: gate.reason, date: targetDate }],
      gateReason: gate.reason,
      targetDate,
      dryRun: Boolean(dryRun),
    }
  }

  const branchSet = activeBranchIds ? new Set(activeBranchIds) : null
  let created = 0
  let skipped = 0
  let errors = 0
  const details = []

  for (const employee of employees ?? []) {
    if (branchSet && employee.branchId && !branchSet.has(employee.branchId)) {
      skipped += 1
      details.push({ employeeId: employee.id, reason: 'inactive_branch' })
      continue
    }

    let existing = null
    try {
      existing = await adapters.fetchByEmployeeAndDate(employee.id, targetDate)
    } catch (error) {
      errors += 1
      skipped += 1
      details.push({
        employeeId: employee.id,
        reason: 'lookup_error',
        error: error?.message ?? String(error),
      })
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
      const monthRecords = await adapters.fetchMonthRecords(employee.id, monthPrefix)
      const fallbackPenalty = getAttendanceStatusConfig(ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED)?.penaltyAmount
        ?? 100000
      const penaltyAmount = cfg.autoAbsentPenaltyAmount > 0
        ? cfg.autoAbsentPenaltyAmount
        : (calculatePenaltyForNewRecord(
          ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED,
          monthRecords,
          targetDate,
        ) || fallbackPenalty)

      const record = buildAutoAbsentRecord({
        employee,
        date: targetDate,
        penaltyAmount,
        id: adapters.createId(),
      })

      if (dryRun) {
        created += 1
        details.push({
          employeeId: employee.id,
          reason: 'dry_run_would_create',
          penaltyAmount,
        })
        continue
      }

      await adapters.insertRecord(record)
      await adapters.insertLogs([{
        id: adapters.createLogId(),
        attendanceId: record.id,
        editorId: 'system',
        editorName: 'Hệ thống',
        fieldName: 'create',
        oldValue: '',
        newValue: record.status,
        note: record.reason,
      }])
      created += 1
      details.push({
        employeeId: employee.id,
        reason: 'created',
        attendanceId: record.id,
        penaltyAmount,
      })
    } catch (error) {
      const message = error?.message ?? String(error)
      if (/duplicate key|unique constraint|đã có bản ghi/i.test(message)) {
        skipped += 1
        details.push({ employeeId: employee.id, reason: 'already_has_record' })
      } else {
        errors += 1
        skipped += 1
        details.push({ employeeId: employee.id, reason: 'insert_error', error: message })
      }
    }
  }

  if (!dryRun && created > 0) {
    try {
      adapters.afterSuccess?.()
    } catch {
      // ignore notify errors
    }
  }

  return {
    created,
    skipped,
    errors,
    details,
    gateReason: '',
    targetDate,
    dryRun: Boolean(dryRun),
  }
}

/** Job nightly / nút Admin: chốt ngày hôm qua theo Asia/Ho_Chi_Minh. */
export async function runAutoAbsentNightlyJob({
  settings,
  employees,
  activeBranchIds = null,
  now = new Date(),
  dryRun = false,
  adapters = defaultAdapters,
  targetDate: overrideDate = '',
}) {
  const targetDate = overrideDate || getPreviousIctDate(now)
  const result = await createAutoAbsentRecordsForDate({
    targetDate,
    settings,
    employees,
    activeBranchIds,
    now,
    dryRun,
    adapters,
  })
  return { ...result, targetDate }
}
