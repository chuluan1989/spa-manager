import {
  getCurrentUserEmployeeId,
  getCurrentUserName,
  getCurrentUserRole,
  isAdmin,
  isBranchManager,
  getCurrentUserBranch,
  ROLES,
} from '../constants/auth'
import { getEmployeeById } from './employeeStorage'
import { getBranchName } from './branchStorage'
import { getInvoiceById, updateInvoice } from './invoiceStorage'
import { notifyDataSynced } from './dataSyncEvents'
import {
  fetchInvoiceEditRequestById,
  fetchInvoiceEditRequestsFiltered,
  fetchPendingInvoiceEditForInvoice,
  insertInvoiceEditEvent,
  upsertInvoiceEditRequest,
} from '../repositories/invoiceEditRequestRepository'
import {
  WORK_REQUEST_TYPES,
  WORK_TASK_STATUS,
  openWorkTaskAndNotify,
  completeWorkTaskAndNotify,
  getActorMeta,
} from './workInbox/workInboxService'

export const INVOICE_EDIT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
}

function snapshotInvoice(invoice) {
  if (!invoice) return {}
  return {
    id: invoice.id,
    date: invoice.date,
    customerName: invoice.customerName || '',
    customerPhone: invoice.customerPhone || '',
    tips: Number(invoice.tips) || 0,
    services: Array.isArray(invoice.services) ? invoice.services : [],
    serviceTotal: invoice.serviceTotal ?? invoice.total ?? 0,
    total: invoice.total ?? 0,
    note: invoice.note || '',
    employeeId: invoice.employeeId || '',
    supportEmployeeId: invoice.supportEmployeeId || '',
    branchId: invoice.branchId || '',
  }
}

function assertCanReview(branchId) {
  if (isAdmin()) return
  if (isBranchManager()) {
    const managed = getCurrentUserBranch()
    if (!branchId || branchId !== managed) {
      throw new Error('Bạn chỉ xử lý yêu cầu thuộc chi nhánh mình.')
    }
    return
  }
  throw new Error('Không có quyền xử lý yêu cầu sửa hóa đơn.')
}

/**
 * NV gửi yêu cầu sửa hóa đơn (không ghi đè invoice đến khi duyệt).
 */
export async function submitInvoiceEditRequest({
  invoiceId,
  reason = '',
  note = '',
  proposedChanges = {},
}) {
  const employeeId = getCurrentUserEmployeeId()
  if (!employeeId) throw new Error('Chỉ nhân viên được gửi yêu cầu sửa hóa đơn.')

  const invoice = getInvoiceById(invoiceId)
  if (!invoice) throw new Error('Không tìm thấy hóa đơn.')
  if (invoice.employeeId !== employeeId && invoice.supportEmployeeId !== employeeId) {
    throw new Error('Bạn chỉ gửi yêu cầu sửa hóa đơn của mình.')
  }

  const why = String(reason || '').trim()
  if (!why) throw new Error('Vui lòng nhập lý do sửa hóa đơn.')

  const pending = await fetchPendingInvoiceEditForInvoice(invoiceId)
  if (pending) throw new Error('Hóa đơn này đang có yêu cầu chờ duyệt.')

  const employee = getEmployeeById(employeeId)
  const current = snapshotInvoice(invoice)
  const proposed = {
    ...current,
    ...proposedChanges,
    id: invoice.id,
    date: invoice.date,
  }

  const id = `ier_${invoiceId}_${Date.now()}`
  const now = new Date().toISOString()
  const record = {
    id,
    invoiceId,
    invoiceDate: invoice.date || '',
    employeeId,
    employeeName: employee?.name || getCurrentUserName() || '',
    branchId: invoice.branchId || employee?.branchId || '',
    branchName: getBranchName(invoice.branchId || employee?.branchId) || '',
    reason: why,
    note: String(note || '').trim(),
    currentSnapshot: current,
    proposedSnapshot: proposed,
    status: INVOICE_EDIT_STATUS.PENDING,
    requestedAt: now,
    requestedBy: employeeId,
    requestedByName: getCurrentUserName() || employee?.name || '',
    employeeNotified: false,
  }

  const saved = await upsertInvoiceEditRequest(record)
  await insertInvoiceEditEvent({
    id: `iere_${id}_submitted`,
    requestId: id,
    invoiceId,
    employeeId,
    eventType: 'request_submitted',
    actorId: employeeId,
    actorName: record.requestedByName,
    actorRole: ROLES.EMPLOYEE,
    beforeData: current,
    afterData: proposed,
    note: why,
  })

  await openWorkTaskAndNotify({
    requestType: WORK_REQUEST_TYPES.INVOICE_EDIT,
    requestId: saved.id,
    employeeId,
    employeeName: record.employeeName,
    branchId: record.branchId,
    branchName: record.branchName,
    title: 'Yêu cầu sửa hóa đơn',
    summary: `${record.employeeName} yêu cầu sửa hóa đơn ${invoiceId} ngày ${invoice.date}. Lý do: ${why}`,
    payload: {
      page: 'invoices',
      invoiceId,
      requestId: saved.id,
    },
    employeeMessage: 'Yêu cầu đã được gửi thành công đến Quản lý và Admin.',
  }).catch((err) => console.warn('[invoice-edit] work task:', err?.message))

  notifyDataSynced(['invoice-edit-requests', 'work-tasks'])
  return saved
}

export async function approveInvoiceEditRequest(requestId, { reviewNote = '' } = {}) {
  const request = await fetchInvoiceEditRequestById(requestId)
  if (!request) throw new Error('Không tìm thấy yêu cầu.')
  if (request.status !== INVOICE_EDIT_STATUS.PENDING) {
    throw new Error('Yêu cầu đã được xử lý — không duyệt lần hai.')
  }
  assertCanReview(request.branchId)

  const invoice = getInvoiceById(request.invoiceId)
  if (!invoice) throw new Error('Hóa đơn gốc không còn trên hệ thống.')

  const proposed = request.proposedSnapshot || {}
  const before = snapshotInvoice(invoice)
  const actor = getActorMeta()

  // Áp dụng thay đổi đề nghị (không tạo HĐ mới)
  const result = await Promise.resolve(updateInvoice(request.invoiceId, {
    customerName: proposed.customerName ?? invoice.customerName,
    customerPhone: proposed.customerPhone ?? invoice.customerPhone,
    tips: proposed.tips ?? invoice.tips,
    services: proposed.services ?? invoice.services,
    note: proposed.note ?? invoice.note,
  }, invoice, {
    editReason: reviewNote || request.reason || 'Duyệt yêu cầu sửa hóa đơn',
    applyApprovedEditRequest: true,
  }))
  if (!result?.success) {
    throw new Error(result?.error || 'Không áp dụng được thay đổi hóa đơn.')
  }

  const now = new Date().toISOString()
  const saved = await upsertInvoiceEditRequest({
    ...request,
    status: INVOICE_EDIT_STATUS.APPROVED,
    reviewedAt: now,
    reviewedBy: actor.actorId,
    reviewedByName: actor.actorName,
    reviewedByRole: actor.actorRole,
    rejectReason: '',
    employeeNotified: false,
  })

  await insertInvoiceEditEvent({
    id: `iere_${requestId}_approved_${Date.now()}`,
    requestId,
    invoiceId: request.invoiceId,
    employeeId: request.employeeId,
    eventType: 'request_approved',
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    beforeData: before,
    afterData: snapshotInvoice(getInvoiceById(request.invoiceId)),
    note: reviewNote || '',
  })

  await completeWorkTaskAndNotify({
    requestType: WORK_REQUEST_TYPES.INVOICE_EDIT,
    requestId,
    completionStatus: WORK_TASK_STATUS.COMPLETED,
    completionNote: reviewNote || '',
    employeeTitle: 'Yêu cầu của bạn đã được duyệt thành công',
    employeeBody: `Yêu cầu sửa hóa đơn ${request.invoiceId} đã được duyệt bởi ${actor.actorName}.`,
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    payload: {
      page: 'invoices',
      invoiceId: request.invoiceId,
      requestId,
    },
    managerToastBody: 'Đã duyệt yêu cầu thành công.',
  }).catch((err) => console.warn('[invoice-edit] approve task:', err?.message))

  notifyDataSynced(['invoice-edit-requests', 'invoices', 'work-tasks'])
  return saved
}

export async function rejectInvoiceEditRequest(requestId, { rejectReason = '' } = {}) {
  const reason = String(rejectReason || '').trim()
  if (!reason) throw new Error('Bắt buộc nhập lý do từ chối.')

  const request = await fetchInvoiceEditRequestById(requestId)
  if (!request) throw new Error('Không tìm thấy yêu cầu.')
  if (request.status !== INVOICE_EDIT_STATUS.PENDING) {
    throw new Error('Yêu cầu đã được xử lý — không từ chối lần hai.')
  }
  assertCanReview(request.branchId)

  const actor = getActorMeta()
  const now = new Date().toISOString()
  const saved = await upsertInvoiceEditRequest({
    ...request,
    status: INVOICE_EDIT_STATUS.REJECTED,
    reviewedAt: now,
    reviewedBy: actor.actorId,
    reviewedByName: actor.actorName,
    reviewedByRole: actor.actorRole,
    rejectReason: reason,
    employeeNotified: false,
  })

  await insertInvoiceEditEvent({
    id: `iere_${requestId}_rejected_${Date.now()}`,
    requestId,
    invoiceId: request.invoiceId,
    employeeId: request.employeeId,
    eventType: 'request_rejected',
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    beforeData: request.currentSnapshot || {},
    afterData: request.proposedSnapshot || {},
    note: reason,
  })

  await completeWorkTaskAndNotify({
    requestType: WORK_REQUEST_TYPES.INVOICE_EDIT,
    requestId,
    completionStatus: WORK_TASK_STATUS.COMPLETED,
    completionNote: reason,
    employeeTitle: 'Yêu cầu chưa được duyệt',
    employeeBody: `Yêu cầu sửa hóa đơn ${request.invoiceId} bị từ chối. Lý do: ${reason}.`,
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    payload: {
      page: 'invoices',
      invoiceId: request.invoiceId,
      requestId,
    },
    managerToastBody: 'Đã từ chối yêu cầu.',
  }).catch((err) => console.warn('[invoice-edit] reject task:', err?.message))

  notifyDataSynced(['invoice-edit-requests', 'work-tasks'])
  return saved
}

export async function loadPendingInvoiceEditRequestsForManager() {
  const branchId = isAdmin() ? '' : (getCurrentUserBranch() || '')
  return fetchInvoiceEditRequestsFiltered({
    branchId,
    status: INVOICE_EDIT_STATUS.PENDING,
  })
}

export async function loadOwnInvoiceEditRequests() {
  const employeeId = getCurrentUserEmployeeId()
  if (!employeeId) return []
  return fetchInvoiceEditRequestsFiltered({ employeeId })
}
