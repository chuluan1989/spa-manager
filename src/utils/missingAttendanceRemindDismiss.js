/**
 * Helpers dismiss banner thiếu chấm công (tách khỏi component để tránh only-export-components).
 */

const DISMISS_KEY = 'spa.missingAttendanceRemind.dismissed'

function dismissKey(employeeId, today) {
  return `${DISMISS_KEY}:${employeeId}:${today}`
}

export function isMissingAttendanceRemindDismissed(employeeId, today) {
  if (typeof sessionStorage === 'undefined' || !employeeId) return false
  return sessionStorage.getItem(dismissKey(employeeId, today)) === '1'
}

export function dismissMissingAttendanceRemind(employeeId, today) {
  if (typeof sessionStorage === 'undefined' || !employeeId) return
  sessionStorage.setItem(dismissKey(employeeId, today), '1')
}
