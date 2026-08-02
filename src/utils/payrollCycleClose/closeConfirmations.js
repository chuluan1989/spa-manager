/**
 * Xác nhận nhân viên trước khi gửi bảng chốt lương.
 */

export const CLOSE_CONFIRMATION_ITEMS = [
  {
    key: 'attendanceChecked',
    label: 'Tôi đã kiểm tra đúng các ngày chấm công và ngày đi làm trong kỳ.',
  },
  {
    key: 'invoicesChecked',
    label: 'Tôi đã kiểm tra đúng toàn bộ hóa đơn/Tour, dịch vụ, tips và doanh thu của mình trong kỳ.',
  },
  {
    key: 'adjustmentsChecked',
    label: 'Tôi đã kiểm tra đúng KPI, thưởng, phạt, tạm ứng, khoản cộng và khoản trừ.',
  },
]

export function emptyCloseConfirmations() {
  return {
    attendanceChecked: false,
    invoicesChecked: false,
    adjustmentsChecked: false,
  }
}

export function areCloseConfirmationsComplete(confirmations = {}) {
  return CLOSE_CONFIRMATION_ITEMS.every((item) => Boolean(confirmations[item.key]))
}

export function buildCloseConfirmationsSnapshot(confirmations = {}, confirmedAt = new Date().toISOString()) {
  return {
    attendanceChecked: Boolean(confirmations.attendanceChecked),
    invoicesChecked: Boolean(confirmations.invoicesChecked),
    adjustmentsChecked: Boolean(confirmations.adjustmentsChecked),
    confirmedAt,
    labels: CLOSE_CONFIRMATION_ITEMS.map((item) => ({
      key: item.key,
      label: item.label,
      checked: Boolean(confirmations[item.key]),
    })),
  }
}
