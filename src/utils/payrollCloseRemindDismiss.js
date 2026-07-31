/**
 * Helpers dismiss banner chốt kỳ (tách khỏi component để tránh only-export-components).
 */

const DISMISS_KEY = 'spa-manager-payroll-close-remind-dismissed'

export function isPayrollCloseRemindDismissed(employeeId, billingMonth, cycle) {
  if (!employeeId || !billingMonth || !cycle) return false
  try {
    return sessionStorage.getItem(`${DISMISS_KEY}:${employeeId}:${billingMonth}:${cycle}`) === '1'
  } catch {
    return false
  }
}

export function dismissPayrollCloseRemind(employeeId, billingMonth, cycle) {
  if (!employeeId || !billingMonth || !cycle) return
  try {
    sessionStorage.setItem(`${DISMISS_KEY}:${employeeId}:${billingMonth}:${cycle}`, '1')
  } catch {
    /* ignore */
  }
}
