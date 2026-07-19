import { ATTENDANCE_STATUS_OPTIONS } from '../constants/attendanceTypes'
import { ROLES } from '../constants/roles'
import {
  getCurrentUser,
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  getCurrentUserName,
  isAdmin,
  isBranchManager,
} from '../constants/auth'
import { getEmployeeById } from './employeeStorage'
import { notifyDataSynced } from './dataSyncEvents'
import { adminCreateAttendance, adminUpdateAttendance } from './attendanceService'
import { fetchAttendanceByEmployeeAndDate } from '../repositories/attendanceRepository'
import {
  ATTENDANCE_EDIT_REQUEST_STATUS,
  getAttendanceEditRequestById,
  listPendingRequestsForBranch,
  listRequestsForEmployee,
  listUnseenReviewResults,
  loadAttendanceEditRequests,
  upsertAttendanceEditRequest,
} from './attendanceEditRequestStorage'

function isValidStatus(status) {
  return ATTENDANCE_STATUS_OPTIONS.some((item) => item.id === status)
}

function assertEmployeeOwns(employeeId) {
  const session = getCurrentUser()
  if (!session || session.role !== ROLES.EMPLOYEE || session.employeeId !== employeeId) {
    throw new Error('Bạn chỉ được thao tác chấm công của chính mình.')
  }
}

function assertCanReview(branchId) {
  if (isAdmin()) return
  if (isBranchManager() && getCurrentUserBranch() === branchId) return
  throw new Error('Bạn không có quyền duyệt yêu cầu này.')
}

/**
 * Nhân viên gửi yêu cầu sửa / bổ sung chấm công.
 * Không ghi đè bảng attendance cho đến khi Quản lý/Admin duyệt.
 */
export async function submitAttendanceEditRequest({
  record = null,
  date,
  newStatus,
  newReason = '',
  newNote = '',
}) {
  const employeeId = getCurrentUserEmployeeId()
  assertEmployeeOwns(employeeId)

  const employee = getEmployeeById(employeeId)
  if (!employee) throw new Error('Không tìm thấy hồ sơ nhân viên.')

  if (!newStatus || !isValidStatus(newStatus)) {
    throw new Error('Vui lòng chọn trạng thái hợp lệ.')
  }

  const targetDate = record?.date || date
  if (!targetDate) throw new Error('Thiếu ngày chấm công.')

  if (record && record.employeeId !== employeeId) {
    throw new Error('Không được sửa chấm công của người khác.')
  }
  if (record && record.branchId && record.branchId !== employee.branchId) {
    throw new Error('Không được sửa chấm công chi nhánh khác.')
  }

  let type = record?.id ? 'update' : 'create'
  let baseRecord = record
  if (type === 'create') {
    const existingRecord = await fetchAttendanceByEmployeeAndDate(employeeId, targetDate)
    if (existingRecord) {
      type = 'update'
      baseRecord = existingRecord
    }
  }

  if (type === 'update') {
    const unchanged = (
      newStatus === baseRecord.status
      && (newReason ?? '').trim() === (baseRecord.reason ?? '').trim()
      && (newNote ?? '').trim() === (baseRecord.note ?? '').trim()
    )
    if (unchanged) {
      throw new Error('Không có thay đổi để gửi duyệt.')
    }
  }

  const existing = await loadAttendanceEditRequests()
  const pendingSameDay = existing.find((item) => (
    item.employeeId === employeeId
    && item.date === targetDate
    && item.status === ATTENDANCE_EDIT_REQUEST_STATUS.PENDING
  ))
  if (pendingSameDay) {
    throw new Error('Ngày này đang có yêu cầu chờ duyệt. Vui lòng đợi Quản lý xử lý.')
  }

  const saved = await upsertAttendanceEditRequest({
    type,
    attendanceId: baseRecord?.id ?? '',
    employeeId,
    employeeName: employee.name ?? '',
    branchId: employee.branchId ?? baseRecord?.branchId ?? '',
    date: targetDate,
    oldStatus: baseRecord?.status ?? '',
    oldReason: baseRecord?.reason ?? '',
    oldNote: baseRecord?.note ?? '',
    newStatus,
    newReason: (newReason ?? '').trim(),
    newNote: (newNote ?? '').trim(),
    status: ATTENDANCE_EDIT_REQUEST_STATUS.PENDING,
    requestedAt: new Date().toISOString(),
    requestedBy: employeeId,
    requestedByName: getCurrentUserName() || employee.name || '',
    employeeNotified: false,
  })

  notifyDataSynced(['settings', 'attendance-edit-requests'])
  return saved
}

export async function approveAttendanceEditRequest(requestId, { reviewNote = '' } = {}) {
  const request = await getAttendanceEditRequestById(requestId)
  if (!request) throw new Error('Không tìm thấy yêu cầu.')
  if (request.status !== ATTENDANCE_EDIT_REQUEST_STATUS.PENDING) {
    throw new Error('Yêu cầu đã được xử lý.')
  }
  assertCanReview(request.branchId)

  const editor = {
    editorId: getCurrentUser()?.role === ROLES.ADMIN
      ? 'admin'
      : (getCurrentUserBranch() || 'manager'),
    editorName: getCurrentUserName() || (isAdmin() ? 'Admin' : 'Quản lý'),
  }

  if (request.type === 'create' || !request.attendanceId) {
    await adminCreateAttendance({
      employeeId: request.employeeId,
      employeeName: request.employeeName,
      branchId: request.branchId,
      date: request.date,
      status: request.newStatus,
      reason: request.newReason,
      note: request.newNote,
      editor,
    })
  } else {
    const live = await fetchAttendanceByEmployeeAndDate(request.employeeId, request.date)
    if (!live) {
      await adminCreateAttendance({
        employeeId: request.employeeId,
        employeeName: request.employeeName,
        branchId: request.branchId,
        date: request.date,
        status: request.newStatus,
        reason: request.newReason,
        note: request.newNote,
        editor,
      })
    } else {
      await adminUpdateAttendance({
        record: live,
        nextStatus: request.newStatus,
        nextReason: request.newReason,
        nextNote: request.newNote,
        editNote: reviewNote || 'Duyệt yêu cầu chỉnh sửa của nhân viên',
        editor,
      })
    }
  }

  const saved = await upsertAttendanceEditRequest({
    ...request,
    status: ATTENDANCE_EDIT_REQUEST_STATUS.APPROVED,
    reviewedAt: new Date().toISOString(),
    reviewedBy: editor.editorId,
    reviewedByName: editor.editorName,
    reviewNote: (reviewNote ?? '').trim(),
    employeeNotified: false,
  })

  notifyDataSynced(['settings', 'attendance-edit-requests', 'attendance'])
  return saved
}

export async function rejectAttendanceEditRequest(requestId, { reviewNote = '' } = {}) {
  const request = await getAttendanceEditRequestById(requestId)
  if (!request) throw new Error('Không tìm thấy yêu cầu.')
  if (request.status !== ATTENDANCE_EDIT_REQUEST_STATUS.PENDING) {
    throw new Error('Yêu cầu đã được xử lý.')
  }
  assertCanReview(request.branchId)

  const saved = await upsertAttendanceEditRequest({
    ...request,
    status: ATTENDANCE_EDIT_REQUEST_STATUS.REJECTED,
    reviewedAt: new Date().toISOString(),
    reviewedBy: getCurrentUser()?.role === ROLES.ADMIN
      ? 'admin'
      : (getCurrentUserBranch() || 'manager'),
    reviewedByName: getCurrentUserName() || (isAdmin() ? 'Admin' : 'Quản lý'),
    reviewNote: (reviewNote ?? '').trim() || 'Không được duyệt',
    employeeNotified: false,
  })

  notifyDataSynced(['settings', 'attendance-edit-requests'])
  return saved
}

export async function markAttendanceEditRequestNotified(requestIds = []) {
  if (!requestIds.length) return []
  const results = []
  for (const id of requestIds) {
    const request = await getAttendanceEditRequestById(id)
    if (!request || request.employeeNotified) continue
    results.push(await upsertAttendanceEditRequest({
      ...request,
      employeeNotified: true,
    }))
  }
  if (results.length) {
    notifyDataSynced(['settings', 'attendance-edit-requests'])
  }
  return results
}

export async function loadPendingEditRequestsForCurrentManager() {
  const all = await loadAttendanceEditRequests()
  if (isAdmin()) {
    return listPendingRequestsForBranch(all, '', { allBranches: true })
  }
  return listPendingRequestsForBranch(all, getCurrentUserBranch())
}

export async function loadOwnAttendanceEditRequests() {
  const employeeId = getCurrentUserEmployeeId()
  assertEmployeeOwns(employeeId)
  const all = await loadAttendanceEditRequests()
  return listRequestsForEmployee(all, employeeId)
}

export async function loadOwnUnseenAttendanceReviews() {
  const employeeId = getCurrentUserEmployeeId()
  if (!employeeId) return []
  const all = await loadAttendanceEditRequests()
  return listUnseenReviewResults(all, employeeId)
}

export {
  ATTENDANCE_EDIT_REQUEST_STATUS,
  loadAttendanceEditRequests,
}
