import { ROLES } from '../constants/roles'
import {
  getCurrentUserBranch,
  getCurrentUserRole,
  isAdmin,
} from '../constants/auth'
import { getMonthPrefixFromDate } from './attendancePenalties'
import { getTodayDate } from './invoiceStorage'
import { isPayrollMonthLocked } from './payrollEngine'
import { checkPermission, PERMISSION_KEYS } from './permissionsStorage'
import { fetchPayrollLocks } from '../repositories/payrollRepository'
import {
  getApprovedCloseLockMessage,
  isAttendanceDateLockedByApprovedClose,
  isEmployeeDateLockedByApprovedCloseSync,
} from './payrollCycleClose/approvedCloseLock'

export function getCurrentAttendanceMonth() {
  return getTodayDate().slice(0, 7)
}

export function getAttendanceMonthBounds(monthPrefix = getCurrentAttendanceMonth()) {
  const [yearStr, monthStr] = monthPrefix.split('-')
  const year = Number(yearStr)
  const monthNum = Number(monthStr)
  const lastDay = new Date(year, monthNum, 0).getDate()
  return {
    fromDate: `${monthPrefix}-01`,
    toDate: `${monthPrefix}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function getAttendanceEditBlockReason(
  recordBranchId = '',
  recordDate = '',
  {
    locks = [],
    role = getCurrentUserRole(),
    branchId = getCurrentUserBranch(),
    employeeId = '',
  } = {},
) {
  if (!checkPermission(PERMISSION_KEYS.EDIT_ATTENDANCE, role, branchId)) {
    return 'Không có quyền sửa chấm công.'
  }
  if (role === ROLES.ADMIN) return ''
  if (role !== ROLES.BRANCH_MANAGER) return 'Không có quyền sửa chấm công.'

  if (recordBranchId && recordBranchId !== branchId) {
    return 'Không có quyền sửa chấm công nhân viên chi nhánh khác.'
  }

  if (employeeId && recordDate && isEmployeeDateLockedByApprovedCloseSync(employeeId, recordDate)) {
    return getApprovedCloseLockMessage(recordDate)
  }

  const recordMonth = getMonthPrefixFromDate(recordDate)
  if (!recordMonth || recordMonth !== getCurrentAttendanceMonth()) {
    return 'Quản lý chi nhánh chỉ được chỉnh chấm công trong tháng hiện tại.'
  }

  if (isPayrollMonthLocked(recordMonth, recordBranchId || branchId, locks)) {
    return 'Tháng lương đã chốt. Chỉ Admin được chỉnh sửa chấm công.'
  }

  return ''
}

export function canEditAttendanceRecord(
  recordBranchId = '',
  recordDate = '',
  options = {},
) {
  return !getAttendanceEditBlockReason(recordBranchId, recordDate, options)
}

export async function assertCanEditAttendanceRecord(record, { date, locks, editNote } = {}) {
  const targetDate = date ?? record?.date ?? ''
  const recordBranchId = record?.branchId ?? ''
  const employeeId = record?.employeeId ?? ''
  const role = getCurrentUserRole()
  const locked = employeeId && targetDate
    ? await isAttendanceDateLockedByApprovedClose(employeeId, targetDate)
    : false

  // Admin được sửa kỳ đã duyệt khi có lý do + audit (không chặn sớm).
  if (isAdmin()) {
    if (!checkPermission(PERMISSION_KEYS.EDIT_ATTENDANCE, role, getCurrentUserBranch())) {
      throw new Error('Không có quyền sửa chấm công.')
    }
    const lockRows = locks ?? await fetchPayrollLocks({ month: getMonthPrefixFromDate(targetDate) })
    const monthLocked = isPayrollMonthLocked(
      getMonthPrefixFromDate(targetDate),
      recordBranchId,
      lockRows,
    )
    if ((locked || monthLocked) && !String(editNote ?? '').trim()) {
      throw new Error('Vui lòng nhập lý do khi Admin sửa dữ liệu kỳ lương đã duyệt.')
    }
    return
  }

  if (locked) {
    throw new Error(getApprovedCloseLockMessage(targetDate))
  }

  const lockRows = locks ?? await fetchPayrollLocks({ month: getMonthPrefixFromDate(targetDate) })
  const reason = getAttendanceEditBlockReason(recordBranchId, targetDate, {
    locks: lockRows,
    role,
    branchId: getCurrentUserBranch(),
    employeeId,
  })
  if (reason) {
    throw new Error(reason)
  }
}
