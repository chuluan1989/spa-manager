const KEY_PREFIX = 'spa-manager-attendance-passed'

export function hasPassedEmployeeAttendanceGate(employeeId) {
  if (!employeeId) return false
  try {
    return sessionStorage.getItem(`${KEY_PREFIX}:${employeeId}`) === '1'
  } catch {
    return false
  }
}

export function markEmployeeAttendanceGatePassed(employeeId) {
  if (!employeeId) return
  try {
    sessionStorage.setItem(`${KEY_PREFIX}:${employeeId}`, '1')
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
