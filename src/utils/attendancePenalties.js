import { getAttendanceStatusConfig } from '../constants/attendanceTypes'

export function getMonthPrefixFromDate(dateStr) {
  if (!dateStr || dateStr.length < 7) return ''
  return dateStr.slice(0, 7)
}

function penaltyForStatus(statusId, priorSameStatusCount) {
  const config = getAttendanceStatusConfig(statusId)
  if (!config) return 0
  if (config.penaltyType === 'none') return 0
  if (config.penaltyType === 'fixed') return config.penaltyAmount ?? 0
  if (config.penaltyType === 'monthly_free') {
    const free = config.freePerMonth ?? 0
    const amount = config.penaltyAmount ?? 0
    return priorSameStatusCount >= free ? amount : 0
  }
  return 0
}

/** Tính tiền phạt cho một bản ghi mới, dựa trên các bản ghi cùng tháng trước đó. */
export function calculatePenaltyForNewRecord(statusId, monthRecords, recordDate) {
  const monthPrefix = getMonthPrefixFromDate(recordDate)
  const prior = monthRecords.filter(
    (record) =>
      record.status === statusId
      && getMonthPrefixFromDate(record.date) === monthPrefix
      && record.date < recordDate,
  )
  return penaltyForStatus(statusId, prior.length)
}

/** Tính lại toàn bộ tiền phạt trong tháng theo thứ tự ngày. */
export function recomputeMonthlyPenalties(records, monthPrefix) {
  const sorted = [...records]
    .filter((record) => getMonthPrefixFromDate(record.date) === monthPrefix)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))

  const counters = new Map()
  return sorted.map((record) => {
    const priorCount = counters.get(record.status) ?? 0
    const penaltyAmount = penaltyForStatus(record.status, priorCount)
    counters.set(record.status, priorCount + 1)
    return { ...record, penaltyAmount }
  })
}

export function sumAttendancePenalties(records) {
  return records.reduce((sum, record) => sum + Number(record.penaltyAmount ?? 0), 0)
}

export function buildAttendanceStats(records) {
  const stats = {
    total: records.length,
    onTime: 0,
    late: 0,
    early: 0,
    offPermitted: 0,
    offUnpermitted: 0,
    weekend: 0,
    totalPenalty: sumAttendancePenalties(records),
  }

  for (const record of records) {
    const config = getAttendanceStatusConfig(record.status)
    const group = config?.statGroup ?? ''
    if (group === 'on_time') stats.onTime += 1
    else if (group === 'late' || group === 'late_permitted') stats.late += 1
    else if (group === 'early' || group === 'early_permitted') stats.early += 1
    else if (group.includes('permitted') && !group.includes('unpermitted')) stats.offPermitted += 1
    else if (group.includes('unpermitted')) stats.offUnpermitted += 1
    else if (group === 'weekend') stats.weekend += 1
  }

  return stats
}

export function mergeAttendanceIntoEmployeeReports(report, attendanceRecords) {
  if (!report?.employees) return report

  const employees = report.employees.map((row) => {
    const penalties = sumAttendancePenalties(
      attendanceRecords.filter((record) => record.employeeId === row.employeeId),
    )
    const totalSalary = Math.max(0, row.totalSalary - penalties)
    return {
      ...row,
      attendancePenalty: penalties,
      totalSalary,
    }
  })

  const periodTotals = {
    ...report.periodTotals,
    attendancePenalty: employees.reduce((sum, row) => sum + (row.attendancePenalty ?? 0), 0),
    totalSalary: employees.reduce((sum, row) => sum + (row.totalSalary ?? 0), 0),
  }

  return {
    ...report,
    employees,
    periodTotals,
  }
}
