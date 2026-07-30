import { getCurrentUserName, isAdmin } from '../constants/auth'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  createPayrollAuditId,
  fetchPayrollLocks,
  insertPayrollAuditLog,
} from '../repositories/payrollRepository'
import { isPayrollMonthLocked } from './payrollEngine'
import {
  getPayCycleLockBlockMessage,
  isPayCycleClosedForRecordDate,
} from './payrollPeriodLock'

export function isInvoiceInClosedPayCycle(invoice, todayDate) {
  return isPayCycleClosedForRecordDate(invoice?.date ?? '', todayDate)
}

export function getInvoiceModifyBlockReason(
  invoice,
  { locks = [], todayDate, role } = {},
) {
  if (isAdmin(role)) return ''

  const date = invoice?.date ?? ''
  if (!date) return ''

  if (isPayCycleClosedForRecordDate(date, todayDate)) {
    return getPayCycleLockBlockMessage(date)
  }

  const month = date.slice(0, 7)
  if (isPayrollMonthLocked(month, invoice?.branchId ?? '', locks)) {
    return 'Tháng lương đã chốt. Chỉ Admin được chỉnh sửa hóa đơn.'
  }

  return ''
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
  const closedByCycle = isInvoiceInClosedPayCycle(invoice)
  const lockRows = locks ?? await fetchPayrollLocks({ month: invoice?.date?.slice(0, 7) ?? '' })

  if (isAdmin()) {
    if (
      closedByCycle
      || isPayrollMonthLocked(invoice?.date?.slice(0, 7) ?? '', invoice?.branchId ?? '', lockRows)
    ) {
      if (!String(editReason ?? '').trim()) {
        throw new Error('Vui lòng nhập lý do khi Admin sửa dữ liệu kỳ lương đã chốt.')
      }
    }
    return
  }

  const reason = getInvoiceModifyBlockReason(invoice, { locks: lockRows })
  if (reason) {
    throw new Error(reason)
  }
}

export async function recordInvoiceAdminAuditIfNeeded({
  invoice,
  action,
  oldValue,
  newValue,
  editReason,
}) {
  if (!isAdmin()) return
  if (!isInvoiceInClosedPayCycle(invoice)) return
  if (!String(editReason ?? '').trim()) return
  await writeInvoiceOverrideAudit({
    invoice,
    action,
    oldValue,
    newValue,
    reason: editReason.trim(),
  })
}
