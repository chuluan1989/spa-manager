import { getCurrentUserEmployeeId, getCurrentUserName, isAdmin } from '../constants/auth'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  createPayrollAuditId,
  fetchPayrollLocks,
  insertPayrollAuditLog,
} from '../repositories/payrollRepository'
import { isPayrollMonthLocked } from './payrollEngine'
import {
  getApprovedCloseLockMessage,
  invalidateCloseAfterSourceChange,
  isEmployeeDateLockedByApprovedCloseSync,
  isEmployeeRecordLockedByApprovedClose,
} from './payrollCycleClose/approvedCloseLock'

/**
 * HĐ thuộc kỳ đã Admin duyệt cho đúng NV sở hữu.
 * Sync: cache; async assert là nguồn chuẩn khi lưu.
 */
export function isInvoiceInClosedPayCycle(invoice) {
  const employeeId = invoice?.employeeId || ''
  const date = invoice?.date ?? ''
  if (!employeeId || !date) return false
  return isEmployeeDateLockedByApprovedCloseSync(employeeId, date)
}

export function getInvoiceModifyBlockReason(
  invoice,
  { role } = {},
) {
  if (isAdmin(role)) return ''

  const date = invoice?.date ?? ''
  if (!date) return ''

  // Chỉ khóa theo phiếu approved của đúng NV + khoảng from–to (cache sync).
  const employeeId = invoice?.employeeId || getCurrentUserEmployeeId() || ''
  if (employeeId && isEmployeeDateLockedByApprovedCloseSync(employeeId, date)) {
    return getInvoiceCreateLockedDateMessage()
  }

  return ''
}

/** Thông báo khi NV chọn ngày thuộc kỳ Admin đã duyệt — không ám chỉ khóa tài khoản. */
export function getInvoiceCreateLockedDateMessage() {
  return (
    'Ngày hóa đơn này thuộc kỳ lương đã được Admin duyệt. '
    + 'Nhân viên không thể nhập/sửa trực tiếp. '
    + 'Vui lòng nhờ Admin xử lý nếu cần bổ sung.'
  )
}

export function canModifyInvoice(invoice, options = {}) {
  return !getInvoiceModifyBlockReason(invoice, options)
}

export async function writeInvoiceOverrideAudit({
  invoice,
  action,
  oldValue,
  newValue,
  reason,
}) {
  if (!isSupabaseConfigured) return null
  return insertPayrollAuditLog({
    id: createPayrollAuditId(),
    entityType: 'invoice',
    entityId: invoice?.id ?? '',
    action,
    editorId: 'admin',
    editorName: getCurrentUserName(),
    oldValue: oldValue ?? {},
    newValue: newValue ?? {},
    reason: reason ?? '',
  })
}

export async function assertCanModifyInvoice(
  invoice,
  { locks, editReason } = {},
) {
  const employeeId = invoice?.employeeId || getCurrentUserEmployeeId() || ''
  const date = invoice?.date ?? ''
  const lockedByApproved = employeeId && date
    ? await isEmployeeRecordLockedByApprovedClose(employeeId, date)
    : false
  const lockRows = locks ?? await fetchPayrollLocks({ month: date.slice(0, 7) ?? '' })

  if (isAdmin()) {
    if (
      lockedByApproved
      || isPayrollMonthLocked(date.slice(0, 7) ?? '', invoice?.branchId ?? '', lockRows)
    ) {
      if (!String(editReason ?? '').trim()) {
        throw new Error('Vui lòng nhập lý do khi Admin sửa dữ liệu kỳ lương đã duyệt.')
      }
    }
    return
  }

  if (lockedByApproved) {
    throw new Error(getApprovedCloseLockMessage(date) || getInvoiceCreateLockedDateMessage())
  }

  return
}

export async function recordInvoiceAdminAuditIfNeeded({
  invoice,
  action,
  oldValue,
  newValue,
  editReason,
}) {
  if (!isAdmin()) return
  const employeeId = invoice?.employeeId || ''
  const locked = employeeId && invoice?.date
    ? await isEmployeeRecordLockedByApprovedClose(employeeId, invoice.date)
    : isInvoiceInClosedPayCycle(invoice)
  if (!locked) return
  if (!String(editReason ?? '').trim()) return
  await writeInvoiceOverrideAudit({
    invoice,
    action,
    oldValue,
    newValue,
    reason: editReason.trim(),
  })
}

/** Sau lưu HĐ thành công — nếu phiếu đang chờ duyệt thì đánh dấu cần gửi lại. */
export async function notifyCloseIfInvoiceSourceChanged(invoice) {
  const employeeId = invoice?.employeeId || ''
  const date = invoice?.date || ''
  if (!employeeId || !date) return null
  return invalidateCloseAfterSourceChange(employeeId, date).catch((err) => {
    console.warn('[invoice] invalidate close:', err?.message)
    return null
  })
}
