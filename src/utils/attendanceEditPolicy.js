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
  { locks = [], role = getCurrentUserRole(), branchId = getCurrentUserBranch() } = {},
) {
  if (!checkPermission(PERMISSION_KEYS.EDIT_ATTENDANCE, role, branchId)) {
    return 'Không có quyền sửa chấm công.'
  }
  if (role === ROLES.ADMIN) return ''
  if (role !== ROLES.BRANCH_MANAGER) return 'Không có quyền sửa chấm công.'

  if (recordBranchId && recordBranchId !== branchId) {
    return 'Không có quyền sửa chấm công nhân viên chi nhánh khác.'
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

export async function assertCanEditAttendanceRecord(record, { date, locks } = {}) {
  const targetDate = date ?? record?.date ?? ''
  const recordBranchId = record?.branchId ?? ''
  const role = getCurrentUserRole()

  if (isAdmin()) {
    if (!checkPermission(PERMISSION_KEYS.EDIT_ATTENDANCE, role, getCurrentUserBranch())) {
      throw new Error('Không có quyền sửa chấm công.')
    }
    return
  }

  const lockRows = locks ?? await fetchPayrollLocks({ month: getMonthPrefixFromDate(targetDate) })
  const reason = getAttendanceEditBlockReason(recordBranchId, targetDate, {
    locks: lockRows,
    role,
    branchId: getCurrentUserBranch(),
  })
  if (reason) {
    throw new Error(reason)
  }
}
