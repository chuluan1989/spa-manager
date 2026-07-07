import { loadInvoices } from './invoiceStorage'

export const PERMANENT_DELETE_BLOCKED_MESSAGE =
  'Nhân viên đã phát sinh dữ liệu hệ thống. Vui lòng chuyển sang trạng thái Nghỉ việc hoặc Lưu trữ để đảm bảo tính toàn vẹn dữ liệu.'

function employeeHasInvoiceHistory(employeeId, invoices = loadInvoices()) {
  return invoices.some(
    (invoice) =>
      invoice.employeeId === employeeId
      || invoice.supportEmployeeId === employeeId,
  )
}

/** Kiểm tra có thể xóa vĩnh viễn — chỉ khi chưa phát sinh hóa đơn/doanh thu/lương. */
export function canPermanentDeleteEmployee(employeeId, invoices = loadInvoices()) {
  if (!employeeId) {
    return { allowed: false, reason: 'Không tìm thấy nhân viên.' }
  }
  if (employeeHasInvoiceHistory(employeeId, invoices)) {
    return { allowed: false, reason: PERMANENT_DELETE_BLOCKED_MESSAGE }
  }
  return { allowed: true, reason: '' }
}
