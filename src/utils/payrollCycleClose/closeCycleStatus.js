export const CLOSE_CYCLE_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  RETURNED: 'returned',
  RESUBMITTED: 'resubmitted',
  APPROVED: 'approved',
}

export const CLOSE_CYCLE_STATUS_LABELS = {
  [CLOSE_CYCLE_STATUS.DRAFT]: 'Nháp',
  [CLOSE_CYCLE_STATUS.SUBMITTED]: 'Đã gửi — chờ duyệt',
  [CLOSE_CYCLE_STATUS.RETURNED]: 'Bị trả lại',
  [CLOSE_CYCLE_STATUS.RESUBMITTED]: 'Gửi lại — chờ duyệt',
  [CLOSE_CYCLE_STATUS.APPROVED]: 'Đã duyệt',
}

export function getCloseCycleStatusLabel(status) {
  return CLOSE_CYCLE_STATUS_LABELS[status] ?? status ?? '—'
}

/** Được phép nhấn gửi chốt. */
export function canSubmitCloseCycle(status) {
  if (!status) return true
  return (
    status === CLOSE_CYCLE_STATUS.DRAFT
    || status === CLOSE_CYCLE_STATUS.RETURNED
  )
}

export function isCloseCyclePendingReview(status) {
  return (
    status === CLOSE_CYCLE_STATUS.SUBMITTED
    || status === CLOSE_CYCLE_STATUS.RESUBMITTED
  )
}

/** Đã khóa xem như đã gửi / duyệt — không gửi lại. */
export function isCloseCycleLockedForEmployee(status) {
  return (
    status === CLOSE_CYCLE_STATUS.SUBMITTED
    || status === CLOSE_CYCLE_STATUS.RESUBMITTED
    || status === CLOSE_CYCLE_STATUS.APPROVED
  )
}

export function resolveNextSubmitStatus(currentStatus) {
  if (currentStatus === CLOSE_CYCLE_STATUS.RETURNED) {
    return CLOSE_CYCLE_STATUS.RESUBMITTED
  }
  return CLOSE_CYCLE_STATUS.SUBMITTED
}

export function buildCloseCycleId(employeeId, billingMonth, cycle) {
  return `pcc_${employeeId}_${billingMonth}_${cycle}`
}
