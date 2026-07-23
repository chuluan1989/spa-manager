import { ATTENDANCE_STATUS, getAttendanceStatusConfig, isVoidAttendanceStatus } from '../constants/attendanceTypes'

export function getMonthPrefixFromDate(dateStr) {
  if (!dateStr || dateStr.length < 7) return ''
  return dateStr.slice(0, 7)
}

// Yêu cầu mới: quy đổi toàn bộ "nghỉ có phép" sang đơn vị nửa ngày,
// sau đó miễn trừ tối đa 6 đơn vị nửa ngày / tháng cho mỗi nhân viên.
//
// Quy ước đơn vị:
// - Nghỉ nguyên ngày có phép = 2 đơn vị
// - Nghỉ 1/2 buổi có phép (sáng/tối) = 1 đơn vị
const FREE_HALF_DAY_UNITS_PER_MONTH = 6
const PERMITTED_LEAVE_UNIT_BY_STATUS = {
  [ATTENDANCE_STATUS.FULL_DAY_PERMITTED]: 2,
  [ATTENDANCE_STATUS.HALF_MORNING_PERMITTED]: 1,
  [ATTENDANCE_STATUS.HALF_EVENING_PERMITTED]: 1,
}

function getPermittedLeaveUnit(statusId) {
  return PERMITTED_LEAVE_UNIT_BY_STATUS[statusId] ?? 0
}

function isPermittedLeaveStatus(statusId) {
  return getPermittedLeaveUnit(statusId) > 0
}

// Legacy: xử lý theo từng trạng thái (giữ nguyên cho các trạng thái không thuộc nhóm "nghỉ có phép"
// theo quy đổi đơn vị nửa ngày).
function penaltyForStatusLegacy(statusId, priorSameStatusCount) {
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

function penaltyForPermittedLeaveWithHalfDayCap(statusId, priorPermittedHalfDayUnits) {
  const config = getAttendanceStatusConfig(statusId)
  if (!config) return 0
  const unit = getPermittedLeaveUnit(statusId)
  if (!unit) return 0

  // penaltyAmount là tiền phạt cho 1 lần nghỉ (nguyên ngày hoặc 1/2 buổi).
  // Quy đổi sang tiền / 1 đơn vị nửa ngày để tính đúng số đơn vị bị trừ.
  const amountTotal = Number(config.penaltyAmount ?? 0)
  const unitPenaltyAmount = unit > 0 ? amountTotal / unit : amountTotal

  const freeRemainingUnits = Math.max(0, FREE_HALF_DAY_UNITS_PER_MONTH - priorPermittedHalfDayUnits)
  const billUnits = Math.max(0, unit - freeRemainingUnits)

  return billUnits * unitPenaltyAmount
}

/** Tính tiền phạt cho một bản ghi mới, dựa trên các bản ghi cùng tháng trước đó. */
export function calculatePenaltyForNewRecord(statusId, monthRecords, recordDate) {
  if (isVoidAttendanceStatus(statusId)) return 0

  const monthPrefix = getMonthPrefixFromDate(recordDate)
  const prior = monthRecords.filter(
    (record) =>
      !isVoidAttendanceStatus(record.status)
      && record.status === statusId
      && getMonthPrefixFromDate(record.date) === monthPrefix
      && record.date < recordDate,
  )

  // Nghỉ có phép: miễn trừ tính theo tổng đơn vị nửa ngày trong tháng (không tách theo từng status).
  if (isPermittedLeaveStatus(statusId)) {
    const permittedPriorUnits = monthRecords
      .filter(
        (record) =>
          !isVoidAttendanceStatus(record.status)
          && getMonthPrefixFromDate(record.date) === monthPrefix
          && record.date < recordDate
          && isPermittedLeaveStatus(record.status),
      )
      .reduce((sum, record) => sum + getPermittedLeaveUnit(record.status), 0)

    return penaltyForPermittedLeaveWithHalfDayCap(statusId, permittedPriorUnits)
  }

  // Các trạng thái khác: giữ nguyên logic hiện tại.
  return penaltyForStatusLegacy(statusId, prior.length)
}

/** Tính lại toàn bộ tiền phạt trong tháng theo thứ tự ngày. */
export function recomputeMonthlyPenalties(records, monthPrefix) {
  const sorted = [...records]
    .filter((record) => getMonthPrefixFromDate(record.date) === monthPrefix)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))

  // Cap mới áp dụng theo tổng "đơn vị nửa ngày" cho nhóm nghỉ có phép,
  // nên cần theo dõi tổng đơn vị đã dùng thay vì chỉ đếm theo từng status.
  let usedPermittedHalfDayUnits = 0
  const counters = new Map()

  return sorted.map((record) => {
    if (isVoidAttendanceStatus(record.status)) {
      return { ...record, penaltyAmount: 0 }
    }

    if (isPermittedLeaveStatus(record.status)) {
      const unit = getPermittedLeaveUnit(record.status)
      const config = getAttendanceStatusConfig(record.status)
      const amountTotal = Number(config?.penaltyAmount ?? 0)
      const unitPenaltyAmount = unit > 0 ? amountTotal / unit : amountTotal

      const freeRemainingUnits = Math.max(0, FREE_HALF_DAY_UNITS_PER_MONTH - usedPermittedHalfDayUnits)
      const billUnits = Math.max(0, unit - freeRemainingUnits)
      const penaltyAmount = billUnits * unitPenaltyAmount

      usedPermittedHalfDayUnits += unit
      return { ...record, penaltyAmount }
    }

    const priorCount = counters.get(record.status) ?? 0
    const penaltyAmount = penaltyForStatusLegacy(record.status, priorCount)
    counters.set(record.status, priorCount + 1)
    return { ...record, penaltyAmount }
  })
}

export function sumAttendancePenalties(records) {
  return records.reduce((sum, record) => sum + Number(record.penaltyAmount ?? 0), 0)
}

export function buildAttendanceStats(records) {
  const activeRecords = records.filter((record) => !isVoidAttendanceStatus(record.status))
  const stats = {
    total: activeRecords.length,
    onTime: 0,
    late: 0,
    early: 0,
    offPermitted: 0,
    offUnpermitted: 0,
    weekend: 0,
    totalPenalty: sumAttendancePenalties(activeRecords),
  }

  for (const record of activeRecords) {
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
