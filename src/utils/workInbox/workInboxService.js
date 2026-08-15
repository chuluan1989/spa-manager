import {
  getCurrentUser,
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  getCurrentUserName,
  getCurrentUserRole,
  isAdmin,
  isBranchManager,
  isEmployee,
  ROLES,
} from '../../constants/auth'
import { notifyDataSynced } from '../dataSyncEvents'
import {
  fetchPendingWorkTasks,
  fetchWorkTaskByRequest,
  upsertWorkTaskRow,
} from '../../repositories/workTasksRepository'
import {
  fetchAppNotificationsForRecipient,
  insertAppNotificationRows,
  markAppNotificationsRead,
} from '../../repositories/appNotificationsRepository'

export const WORK_REQUEST_TYPES = {
  PAYROLL_CLOSE: 'payroll_close',
  ATTENDANCE_CORRECTION: 'attendance_correction',
  INVOICE_EDIT: 'invoice_edit',
}

export const WORK_TASK_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

function nid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Upsert đúng 1 task / (type, requestId). Tạo notification cho Admin + QL CN + (tuỳ chọn) NV.
 */
export async function openWorkTaskAndNotify({
  requestType,
  requestId,
  employeeId = '',
  employeeName = '',
  branchId = '',
  branchName = '',
  title = '',
  summary = '',
  payload = {},
  employeeMessage = '',
  managerEventType = 'request_submitted',
}) {
  const existing = await fetchWorkTaskByRequest(requestType, requestId).catch(() => null)
  const taskId = existing?.id || `wt_${requestType}_${requestId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
  const now = new Date().toISOString()

  const task = await upsertWorkTaskRow({
    id: taskId,
    requestType,
    requestId,
    employeeId,
    employeeName,
    branchId,
    branchName,
    title,
    summary,
    status: WORK_TASK_STATUS.PENDING,
    payload,
    submittedAt: existing?.submittedAt || now,
    completedAt: null,
    completedBy: '',
    completedByName: '',
    completedByRole: '',
    completionNote: '',
    createdAt: existing?.createdAt,
  })

  const notifications = [
    {
      id: nid('ntf'),
      recipientRole: 'admin',
      recipientId: 'admin',
      requestType,
      requestId,
      workTaskId: task?.id || taskId,
      title: `Có yêu cầu mới từ ${employeeName || 'nhân viên'}`,
      body: summary,
      eventType: managerEventType,
      payload: { ...payload, requestType, requestId },
    },
  ]

  if (branchId) {
    notifications.push({
      id: nid('ntf'),
      recipientRole: 'branch_manager',
      recipientId: branchId,
      requestType,
      requestId,
      workTaskId: task?.id || taskId,
      title: `Có yêu cầu mới từ ${employeeName || 'nhân viên'}`,
      body: summary,
      eventType: managerEventType,
      payload: { ...payload, requestType, requestId },
    })
  }

  if (employeeId && employeeMessage) {
    notifications.push({
      id: nid('ntf'),
      recipientRole: 'employee',
      recipientId: employeeId,
      requestType,
      requestId,
      workTaskId: task?.id || taskId,
      title: 'Yêu cầu đã được gửi thành công',
      body: employeeMessage,
      eventType: 'request_submitted_ack',
      payload: { ...payload, requestType, requestId },
    })
  }

  await insertAppNotificationRows(notifications).catch((err) => {
    console.warn('[workInbox] notify failed:', err?.message)
  })

  notifyDataSynced(['work-tasks', 'app-notifications', requestType])
  return task
}

export async function completeWorkTaskAndNotify({
  requestType,
  requestId,
  completionStatus = WORK_TASK_STATUS.COMPLETED,
  completionNote = '',
  employeeTitle = '',
  employeeBody = '',
  actorId = '',
  actorName = '',
  actorRole = '',
  payload = {},
  managerToastBody = '',
}) {
  const existing = await fetchWorkTaskByRequest(requestType, requestId).catch(() => null)
  if (existing?.status === WORK_TASK_STATUS.COMPLETED) {
    throw new Error('Yêu cầu đã được xử lý — không xử lý lần hai.')
  }
  const taskId = existing?.id || `wt_${requestType}_${requestId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
  const now = new Date().toISOString()

  const task = await upsertWorkTaskRow({
    id: taskId,
    requestType,
    requestId,
    employeeId: existing?.employeeId || payload.employeeId || '',
    employeeName: existing?.employeeName || payload.employeeName || '',
    branchId: existing?.branchId || payload.branchId || '',
    branchName: existing?.branchName || payload.branchName || '',
    title: existing?.title || '',
    summary: existing?.summary || '',
    status: completionStatus,
    payload: { ...(existing?.payload || {}), ...payload },
    submittedAt: existing?.submittedAt || now,
    completedAt: now,
    completedBy: actorId,
    completedByName: actorName,
    completedByRole: actorRole,
    completionNote,
    createdAt: existing?.createdAt,
  })

  const employeeId = task?.employeeId || existing?.employeeId || payload.employeeId || ''
  const rows = []
  if (employeeId && employeeBody) {
    rows.push({
      id: nid('ntf'),
      recipientRole: 'employee',
      recipientId: employeeId,
      requestType,
      requestId,
      workTaskId: task?.id || taskId,
      title: employeeTitle || 'Cập nhật yêu cầu',
      body: employeeBody,
      eventType: completionStatus === WORK_TASK_STATUS.COMPLETED ? 'request_resolved' : 'request_cancelled',
      payload: { ...payload, requestType, requestId, completionNote },
    })
  }

  // Ack cho người xử lý (admin / manager)
  if (actorRole === ROLES.ADMIN || actorRole === 'admin') {
    rows.push({
      id: nid('ntf'),
      recipientRole: 'admin',
      recipientId: 'admin',
      requestType,
      requestId,
      workTaskId: task?.id || taskId,
      title: 'Đã xử lý yêu cầu',
      body: managerToastBody || 'Đã duyệt/trả lại yêu cầu thành công.',
      eventType: 'handler_ack',
      payload: { ...payload, requestType, requestId },
    })
  } else if (actorRole === ROLES.BRANCH_MANAGER || actorRole === 'branch_manager') {
    const branchId = getCurrentUserBranch() || task?.branchId || ''
    if (branchId) {
      rows.push({
        id: nid('ntf'),
        recipientRole: 'branch_manager',
        recipientId: branchId,
        requestType,
        requestId,
        workTaskId: task?.id || taskId,
        title: 'Đã xử lý yêu cầu',
        body: managerToastBody || 'Đã duyệt/trả lại yêu cầu thành công.',
        eventType: 'handler_ack',
        payload: { ...payload, requestType, requestId },
      })
    }
  }

  await insertAppNotificationRows(rows).catch((err) => {
    console.warn('[workInbox] complete notify failed:', err?.message)
  })

  notifyDataSynced(['work-tasks', 'app-notifications', requestType])
  return task
}

export async function loadPendingWorkTasksForCurrentUser() {
  if (!isAdmin() && !isBranchManager()) return []
  const branchId = isAdmin() ? '' : (getCurrentUserBranch() || '')
  return fetchPendingWorkTasks({ branchId }).catch(() => [])
}

export async function loadMyAppNotifications({ unreadOnly = false } = {}) {
  const user = getCurrentUser()
  if (!user) return []

  if (isAdmin()) {
    return fetchAppNotificationsForRecipient({
      recipientRole: 'admin',
      recipientId: 'admin',
      status: unreadOnly ? 'unread' : '',
    })
  }
  if (isBranchManager()) {
    return fetchAppNotificationsForRecipient({
      recipientRole: 'branch_manager',
      recipientId: getCurrentUserBranch() || '',
      status: unreadOnly ? 'unread' : '',
    })
  }
  if (isEmployee()) {
    return fetchAppNotificationsForRecipient({
      recipientRole: 'employee',
      recipientId: getCurrentUserEmployeeId() || '',
      status: unreadOnly ? 'unread' : '',
    })
  }
  return []
}

export async function markMyNotificationsRead(ids) {
  await markAppNotificationsRead(ids)
  notifyDataSynced(['app-notifications'])
}

export function getActorMeta() {
  return {
    actorId: isAdmin() ? 'admin' : (getCurrentUserEmployeeId() || getCurrentUserBranch() || ''),
    actorName: getCurrentUserName(),
    actorRole: getCurrentUserRole(),
  }
}
