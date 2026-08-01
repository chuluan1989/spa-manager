/**
 * Banner nhắc chốt kỳ — không dùng sessionStorage để tắt nhắc.
 * Thu gọn chỉ giữ trong state React của lần xem hiện tại (App.jsx).
 */

export function isPayrollCloseRemindDismissed() {
  return false
}

export function dismissPayrollCloseRemind() {
  /* no-op: không được tắt nhắc vĩnh viễn / theo phiên */
}
