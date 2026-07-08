import { getTodayDate } from './invoiceStorage'

const KEY_PREFIX = 'spa-manager-attendance-passed'

export function hasPassedEmployeeAttendanceGate(employeeId, today = getTodayDate()) {
  if (!employeeId) return false
  try {
    return sessionStorage.getItem(`${KEY_PREFIX}:${employeeId}`) === today
  } catch {
    return false
  }
}

export function markEmployeeAttendanceGatePassed(employeeId, today = getTodayDate()) {
  if (!employeeId) return
  try {
    sessionStorage.setItem(`${KEY_PREFIX}:${employeeId}`, today)
  } catch {
    /* ignore */
  }
}

export function clearEmployeeAttendanceGate(employeeId) {
  if (!employeeId) return
  try {
    sessionStorage.removeItem(`${KEY_PREFIX}:${employeeId}`)
  } catch {
    /* ignore */
  }
}
