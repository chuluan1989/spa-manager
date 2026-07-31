import { ATTENDANCE_STATUS, ATTENDANCE_STATUS_OPTIONS } from '../constants/attendanceTypes'
import { ROLES } from '../constants/roles'
import {
  getCurrentUser,
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  getCurrentUserName,
  getCurrentUserRole,
  isAdmin,
  isBranchManager,
} from '../constants/auth'
import { getEmployeeById } from './employeeStorage'
import { getBranchName } from './branchStorage'
import { notifyDataSynced } from './dataSyncEvents'
import { adminCreateAttendance, adminUpdateAttendance } from './attendanceService'
import { fetchAttendanceByEmployeeAndDate } from '../repositories/attendanceRepository'
import {
  CORRECTION_STATUS,
  createAttendanceChangeEventId,
  createCorrectionRequestId,
  fetchCorrectionRequestById,
  fetchCorrectionRequestsFiltered,
  fetchPendingCorrectionForDay,
  insertAttendanceChangeEvent,
  upsertCorrectionRequest,
} from '../repositories/attendanceCorrectionRepository'
import {
  getApprovedCloseLockMessage,
  isAttendanceDateLockedByApprovedClose,
} from './payrollCycleClose/approvedCloseLock'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  ATTENDANCE_EDIT_REQUEST_STATUS,
  getAttendanceEditRequestById as getLegacyById,
  loadAttendanceEditRequests as loadLegacyRequests,
  upsertAttendanceEditRequest as upsertLegacyRequest,
} from './attendanceEditRequestStorage'
import {
  findPendingConflict,
  mergeCorrectionRequestSources,
} from './attendanceCorrectionMerge'

export const ATTENDANCE_EDIT_REQUEST_STATUS_EXTENDED = {
  ...ATTENDANCE_EDIT_REQUEST_STATUS,
  CANCELLED: CORRECTION_STATUS.CANCELLED,
}

export const CORRECTION_STATUS_LABELS = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  cancelled: 'Đã hủy',
}

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

function reviewerIdentity() {
  const role = getCurrentUserRole()
  const isAdm = role === ROLES.ADMIN
  return {
    editorId: isAdm ? 'admin' : (getCurrentUserBranch() || 'manager'),
    editorName: getCurrentUserName() || (isAdm ? 'Admin' : 'Quản lý'),
    role,
  }
}

function combineDateAndTime(date, timeHHMM, fallbackIso = '') {
  const time = String(timeHHMM || '').trim()
  if (!date || !/^\d{2}:\d{2}$/.test(time)) return fallbackIso || ''
  const [hh, mm] = time.split(':').map(Number)
  const base = fallbackIso ? new Date(fallbackIso) : new Date(`${date}T00:00:00+07:00`)
  if (Number.isNaN(base.getTime())) {
    return `${date}T${time}:00+07:00`
  }
  base.setHours(hh, mm, 0, 0)
  return base.toISOString()
}

function toTimeHHMM(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function normalizeUiRequest(row) {
  if (!row) return null
  // Map DB / legacy → UI shape (giữ tương thích AttendanceEditRequestsPanel cũ)
  const date = row.attendanceDate || row.date || ''
  return {
    id: row.id,
    type: row.type === 'update' ? 'update' : 'create',
    attendanceId: row.attendanceId ?? '',
    employeeId: row.employeeId ?? '',
    employeeName: row.employeeName ?? '',
    branchId: row.branchId ?? '',
    branchName: row.branchName ?? '',
    date,
    attendanceDate: date,
    oldStatus: row.oldStatus ?? '',
    oldReason: row.oldReason ?? '',
    oldNote: row.oldNote ?? '',
    oldCheckIn: row.oldCheckIn ?? '',
    oldCheckOut: row.oldCheckOut ?? '',
    newStatus: row.proposedStatus ?? row.newStatus ?? '',
    newReason: row.proposedReason ?? row.newReason ?? '',
    newNote: row.proposedNote ?? row.newNote ?? '',
    proposedStatus: row.proposedStatus ?? row.newStatus ?? '',
    proposedReason: row.proposedReason ?? row.newReason ?? '',
    proposedNote: row.proposedNote ?? row.newNote ?? '',
    proposedCheckIn: row.proposedCheckIn ?? '',
    proposedCheckOut: row.proposedCheckOut ?? '',
    evidenceNote: row.evidenceNote ?? '',
    finalStatus: row.finalStatus ?? '',
    finalReason: row.finalReason ?? '',
    finalNote: row.finalNote ?? '',
    finalCheckIn: row.finalCheckIn ?? '',
    finalCheckOut: row.finalCheckOut ?? '',
    status: row.status ?? CORRECTION_STATUS.PENDING,
    statusLabel: CORRECTION_STATUS_LABELS[row.status] || row.status,
    requestedAt: row.requestedAt ?? '',
    requestedBy: row.requestedBy ?? '',
    requestedByName: row.requestedByName ?? '',
    reviewedAt: row.reviewedAt ?? '',
    reviewedBy: row.reviewedBy ?? '',
    reviewedByName: row.reviewedByName ?? '',
    reviewNote: row.reviewNote ?? '',
    rejectReason: row.rejectReason ?? row.reviewNote ?? '',
    employeeNotified: Boolean(row.employeeNotified),
    legacySourceId: row.legacySourceId ?? '',
    source: row.source || '',
  }
}

async function writeAuditEvent(partial) {
  try {
    await insertAttendanceChangeEvent({
      id: createAttendanceChangeEventId(),
      ...partial,
    })
  } catch (err) {
    console.warn('[attendance_change_events]', err?.message || err)
  }
}

async function isDatabaseAvailable() {
  return isSupabaseConfigured
}

function markUiSource(rows, source) {
  return (rows ?? []).map((row) => (row ? { ...row, source } : row))
}

/**
 * Nhân viên gửi yêu cầu bổ sung / sửa chấm công.
 * Không ghi đè bảng attendance cho đến khi Admin/QL duyệt.
 */
export async function submitAttendanceEditRequest({
  record = null,
  date,
  newStatus,
  newReason = '',
  newNote = '',
  checkInTime = '',
  checkOutTime = '',
  evidenceNote = '',
  requestId = '',
}) {
  const employeeId = getCurrentUserEmployeeId()
  assertEmployeeOwns(employeeId)

  const employee = getEmployeeById(employeeId)
  if (!employee) throw new Error('Không tìm thấy hồ sơ nhân viên.')

  const targetDate = record?.date || date
  if (!targetDate) throw new Error('Thiếu ngày chấm công.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error('Ngày chấm công không hợp lệ.')
  }

  if (await isAttendanceDateLockedByApprovedClose(employeeId, targetDate)) {
    throw new Error(getApprovedCloseLockMessage(targetDate))
  }

  const resolvedStatus = newStatus || ATTENDANCE_STATUS.ON_TIME
  if (!isValidStatus(resolvedStatus)) {
    throw new Error('Vui lòng chọn trạng thái hợp lệ.')
  }

  if (record && record.employeeId !== employeeId) {
    throw new Error('Không được sửa chấm công của người khác.')
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

  const checkIn = String(checkInTime || '').trim()
  const checkOut = String(checkOutTime || '').trim()
  if (type === 'create' && (!checkIn || !checkOut)) {
    throw new Error('Vui lòng nhập giờ vào và giờ ra.')
  }
  if (!String(newReason || '').trim() && type === 'create') {
    throw new Error('Vui lòng nhập lý do quên chấm công.')
  }

  const db = await isDatabaseAvailable()
  if (db) {
    const merged = await loadAttendanceEditRequests()
    const pendingConflict = findPendingConflict(merged, employeeId, targetDate, requestId)
    if (pendingConflict && pendingConflict.source !== 'legacy') {
      throw new Error('Ngày này đang có yêu cầu chờ duyệt. Vui lòng đợi Quản lý xử lý hoặc rút yêu cầu cũ.')
    }
    if (pendingConflict && pendingConflict.source === 'legacy') {
      throw new Error('Ngày này đang có yêu cầu chờ duyệt (dữ liệu cũ). Vui lòng đợi Quản lý xử lý hoặc rút yêu cầu cũ.')
    }

    const pendingSameDay = await fetchPendingCorrectionForDay(employeeId, targetDate)
    let existing = requestId ? await fetchCorrectionRequestById(requestId) : pendingSameDay
    // Không cho sửa bản legacy qua DB path — phải migrate hoặc dùng JSON path
    if (requestId && !existing) {
      const legacyHit = merged.find((item) => item.id === requestId && item.source === 'legacy')
      if (legacyHit) {
        throw new Error('Yêu cầu này còn ở dữ liệu cũ (JSON). Cần migrate hoặc thao tác trên bản đã chuyển sang bảng mới.')
      }
    }
    if (existing && existing.status !== CORRECTION_STATUS.PENDING) {
      throw new Error('Chỉ được sửa yêu cầu đang chờ duyệt.')
    }
    if (existing && existing.employeeId !== employeeId) {
      throw new Error('Không được sửa yêu cầu của người khác.')
    }

    const before = existing ? { ...existing } : {}
    const payload = {
      id: existing?.id || createCorrectionRequestId(),
      type,
      attendanceId: baseRecord?.id ?? '',
      employeeId,
      employeeName: employee.name ?? '',
      branchId: employee.branchId ?? baseRecord?.branchId ?? '',
      branchName: getBranchName(employee.branchId) || '',
      attendanceDate: targetDate,
      oldStatus: baseRecord?.status ?? '',
      oldReason: baseRecord?.reason ?? '',
      oldNote: baseRecord?.note ?? '',
      oldCheckIn: toTimeHHMM(baseRecord?.submittedAt),
      oldCheckOut: toTimeHHMM(baseRecord?.updatedAt),
      proposedStatus: resolvedStatus,
      proposedReason: String(newReason ?? '').trim(),
      proposedNote: String(newNote ?? '').trim(),
      proposedCheckIn: checkIn,
      proposedCheckOut: checkOut,
      evidenceNote: String(evidenceNote ?? '').trim(),
      status: CORRECTION_STATUS.PENDING,
      requestedAt: existing?.requestedAt || new Date().toISOString(),
      requestedBy: employeeId,
      requestedByName: getCurrentUserName() || employee.name || '',
      employeeNotified: false,
      reviewedAt: null,
      reviewedBy: '',
      reviewedByName: '',
      reviewNote: '',
      rejectReason: '',
      legacySourceId: existing?.legacySourceId || '',
      createdAt: existing?.createdAt,
    }

    const saved = normalizeUiRequest(await upsertCorrectionRequest(payload))
    await writeAuditEvent({
      requestId: saved.id,
      attendanceId: saved.attendanceId,
      employeeId,
      branchId: saved.branchId,
      attendanceDate: targetDate,
      eventType: existing ? 'request_updated' : 'request_submitted',
      actorId: employeeId,
      actorName: saved.requestedByName,
      actorRole: ROLES.EMPLOYEE,
      beforeData: before,
      afterData: payload,
      note: existing ? 'Nhân viên cập nhật yêu cầu' : 'Nhân viên gửi yêu cầu bổ sung',
      branchAtAction: saved.branchId || '',
    })
    notifyDataSynced(['attendance-edit-requests', 'attendance-corrections'])
    return saved
  }

  // Fallback settings JSON (khi chưa chạy migration / Supabase off)
  const existingLegacy = await loadLegacyRequests()
  const pendingSameDay = existingLegacy.find((item) => (
    item.employeeId === employeeId
    && item.date === targetDate
    && item.status === ATTENDANCE_EDIT_REQUEST_STATUS.PENDING
    && item.id !== requestId
  ))
  if (pendingSameDay) {
    throw new Error('Ngày này đang có yêu cầu chờ duyệt. Vui lòng đợi Quản lý xử lý.')
  }

  const saved = normalizeUiRequest(await upsertLegacyRequest({
    id: requestId || undefined,
    type,
    attendanceId: baseRecord?.id ?? '',
    employeeId,
    employeeName: employee.name ?? '',
    branchId: employee.branchId ?? baseRecord?.branchId ?? '',
    date: targetDate,
    oldStatus: baseRecord?.status ?? '',
    oldReason: baseRecord?.reason ?? '',
    oldNote: baseRecord?.note ?? '',
    newStatus: resolvedStatus,
    newReason: String(newReason ?? '').trim(),
    newNote: String(newNote ?? '').trim(),
    proposedCheckIn: checkIn,
    proposedCheckOut: checkOut,
    evidenceNote: String(evidenceNote ?? '').trim(),
    status: ATTENDANCE_EDIT_REQUEST_STATUS.PENDING,
    requestedAt: new Date().toISOString(),
    requestedBy: employeeId,
    requestedByName: getCurrentUserName() || employee.name || '',
    employeeNotified: false,
  }))
  notifyDataSynced(['settings', 'attendance-edit-requests'])
  return saved
}

export async function cancelAttendanceEditRequest(requestId) {
  const employeeId = getCurrentUserEmployeeId()
  assertEmployeeOwns(employeeId)

  const db = await isDatabaseAvailable()
  if (db) {
    const request = await fetchCorrectionRequestById(requestId)
    if (!request) throw new Error('Không tìm thấy yêu cầu.')
    if (request.employeeId !== employeeId) throw new Error('Không được hủy yêu cầu của người khác.')
    if (request.status !== CORRECTION_STATUS.PENDING) {
      throw new Error('Chỉ được hủy yêu cầu đang chờ duyệt.')
    }
    const before = { ...request }
    const saved = normalizeUiRequest(await upsertCorrectionRequest({
      ...request,
      status: CORRECTION_STATUS.CANCELLED,
      reviewedAt: new Date().toISOString(),
      reviewedBy: employeeId,
      reviewedByName: getCurrentUserName() || '',
      reviewNote: 'Nhân viên rút yêu cầu',
    }))
    await writeAuditEvent({
      requestId: saved.id,
      attendanceId: saved.attendanceId,
      employeeId,
      branchId: saved.branchId,
      attendanceDate: saved.date,
      eventType: 'request_cancelled',
      actorId: employeeId,
      actorName: saved.reviewedByName,
      actorRole: ROLES.EMPLOYEE,
      beforeData: before,
      afterData: saved,
      note: 'Nhân viên rút yêu cầu',
      branchAtAction: saved.branchId || '',
    })
    notifyDataSynced(['attendance-edit-requests', 'attendance-corrections'])
    return saved
  }

  const request = await getLegacyById(requestId)
  if (!request) throw new Error('Không tìm thấy yêu cầu.')
  if (request.employeeId !== employeeId) throw new Error('Không được hủy yêu cầu của người khác.')
  if (request.status !== ATTENDANCE_EDIT_REQUEST_STATUS.PENDING) {
    throw new Error('Chỉ được hủy yêu cầu đang chờ duyệt.')
  }
  const saved = normalizeUiRequest(await upsertLegacyRequest({
    ...request,
    status: 'cancelled',
    reviewedAt: new Date().toISOString(),
    reviewedBy: employeeId,
    reviewedByName: getCurrentUserName() || '',
    reviewNote: 'Nhân viên rút yêu cầu',
  }))
  notifyDataSynced(['settings', 'attendance-edit-requests'])
  return saved
}

export async function approveAttendanceEditRequest(requestId, {
  reviewNote = '',
  finalStatus,
  finalReason,
  finalNote,
  finalCheckIn,
  finalCheckOut,
} = {}) {
  const db = await isDatabaseAvailable()
  const raw = db
    ? await fetchCorrectionRequestById(requestId)
    : await getLegacyById(requestId)
  const request = normalizeUiRequest(raw)
  if (!request) throw new Error('Không tìm thấy yêu cầu.')
  if (request.status !== CORRECTION_STATUS.PENDING) {
    throw new Error('Yêu cầu đã được xử lý.')
  }
  assertCanReview(request.branchId)

  if (await isAttendanceDateLockedByApprovedClose(request.employeeId, request.date)) {
    throw new Error(getApprovedCloseLockMessage(request.date))
  }

  const editor = reviewerIdentity()
  if (editor.editorId === request.requestedBy) {
    throw new Error('Nhân viên không được tự duyệt yêu cầu chấm công.')
  }

  const status = finalStatus || request.proposedStatus || request.newStatus
  const reason = finalReason != null ? String(finalReason).trim() : (request.proposedReason || request.newReason || '')
  const note = finalNote != null ? String(finalNote).trim() : (request.proposedNote || request.newNote || '')
  const checkIn = finalCheckIn != null ? String(finalCheckIn).trim() : (request.proposedCheckIn || '')
  const checkOut = finalCheckOut != null ? String(finalCheckOut).trim() : (request.proposedCheckOut || '')

  if (!isValidStatus(status)) throw new Error('Trạng thái duyệt không hợp lệ.')

  const submittedAt = combineDateAndTime(request.date, checkIn)
  const updatedAt = combineDateAndTime(request.date, checkOut, submittedAt) || submittedAt
  const editNote = String(reviewNote || '').trim() || 'Duyệt yêu cầu bổ sung chấm công của nhân viên'

  let attendanceResult = null
  if (request.type === 'create' || !request.attendanceId) {
    attendanceResult = await adminCreateAttendance({
      employeeId: request.employeeId,
      employeeName: request.employeeName,
      branchId: request.branchId,
      date: request.date,
      status,
      reason,
      note,
      submittedAt: submittedAt || undefined,
      updatedAt: updatedAt || undefined,
      editNote,
      editor,
    })
  } else {
    const live = await fetchAttendanceByEmployeeAndDate(request.employeeId, request.date)
    if (!live) {
      attendanceResult = await adminCreateAttendance({
        employeeId: request.employeeId,
        employeeName: request.employeeName,
        branchId: request.branchId,
        date: request.date,
        status,
        reason,
        note,
        submittedAt: submittedAt || undefined,
        updatedAt: updatedAt || undefined,
        editNote,
        editor,
      })
    } else {
      attendanceResult = await adminUpdateAttendance({
        record: live,
        nextStatus: status,
        nextReason: reason,
        nextNote: note,
        nextSubmittedAt: submittedAt || live.submittedAt,
        nextUpdatedAt: updatedAt || live.updatedAt,
        editNote,
        editor,
      })
    }
  }

  const before = { ...request }
  const afterPayload = {
    ...(raw || {}),
    id: request.id,
    type: request.type,
    attendanceId: attendanceResult?.id || request.attendanceId,
    employeeId: request.employeeId,
    employeeName: request.employeeName,
    branchId: request.branchId,
    branchName: request.branchName,
    attendanceDate: request.date,
    proposedStatus: request.proposedStatus || request.newStatus,
    proposedReason: request.proposedReason || request.newReason,
    proposedNote: request.proposedNote || request.newNote,
    proposedCheckIn: request.proposedCheckIn,
    proposedCheckOut: request.proposedCheckOut,
    evidenceNote: request.evidenceNote,
    oldStatus: request.oldStatus,
    oldReason: request.oldReason,
    oldNote: request.oldNote,
    oldCheckIn: request.oldCheckIn,
    oldCheckOut: request.oldCheckOut,
    finalStatus: status,
    finalReason: reason,
    finalNote: note,
    finalCheckIn: checkIn,
    finalCheckOut: checkOut,
    status: CORRECTION_STATUS.APPROVED,
    requestedAt: request.requestedAt,
    requestedBy: request.requestedBy,
    requestedByName: request.requestedByName,
    reviewedAt: new Date().toISOString(),
    reviewedBy: editor.editorId,
    reviewedByName: editor.editorName,
    reviewNote: editNote,
    rejectReason: '',
    employeeNotified: false,
    createdAt: raw?.createdAt,
  }

  let saved
  if (db) {
    saved = normalizeUiRequest(await upsertCorrectionRequest(afterPayload))
    await writeAuditEvent({
      requestId: saved.id,
      attendanceId: saved.attendanceId,
      employeeId: saved.employeeId,
      branchId: saved.branchId,
      attendanceDate: saved.date,
      eventType: 'request_approved',
      actorId: editor.editorId,
      actorName: editor.editorName,
      actorRole: editor.role,
      beforeData: before,
      afterData: {
        request: afterPayload,
        attendance: attendanceResult,
      },
      note: editNote,
      branchAtAction: getCurrentUserBranch() || saved.branchId || '',
    })
  } else {
    saved = normalizeUiRequest(await upsertLegacyRequest({
      ...request,
      newStatus: status,
      newReason: reason,
      newNote: note,
      status: ATTENDANCE_EDIT_REQUEST_STATUS.APPROVED,
      reviewedAt: afterPayload.reviewedAt,
      reviewedBy: editor.editorId,
      reviewedByName: editor.editorName,
      reviewNote: editNote,
      employeeNotified: false,
    }))
  }

  notifyDataSynced(['settings', 'attendance-edit-requests', 'attendance-corrections', 'attendance'])
  return saved
}

export async function rejectAttendanceEditRequest(requestId, { reviewNote = '' } = {}) {
  const reason = String(reviewNote ?? '').trim()
  if (!reason) {
    throw new Error('Vui lòng nhập lý do từ chối.')
  }

  const db = await isDatabaseAvailable()
  const raw = db
    ? await fetchCorrectionRequestById(requestId)
    : await getLegacyById(requestId)
  const request = normalizeUiRequest(raw)
  if (!request) throw new Error('Không tìm thấy yêu cầu.')
  if (request.status !== CORRECTION_STATUS.PENDING) {
    throw new Error('Yêu cầu đã được xử lý.')
  }
  assertCanReview(request.branchId)

  const editor = reviewerIdentity()
  const before = { ...request }
  const afterPayload = {
    ...(raw || {}),
    id: request.id,
    type: request.type,
    attendanceId: request.attendanceId,
    employeeId: request.employeeId,
    employeeName: request.employeeName,
    branchId: request.branchId,
    branchName: request.branchName,
    attendanceDate: request.date,
    proposedStatus: request.proposedStatus || request.newStatus,
    proposedReason: request.proposedReason || request.newReason,
    proposedNote: request.proposedNote || request.newNote,
    proposedCheckIn: request.proposedCheckIn,
    proposedCheckOut: request.proposedCheckOut,
    evidenceNote: request.evidenceNote,
    oldStatus: request.oldStatus,
    oldReason: request.oldReason,
    oldNote: request.oldNote,
    oldCheckIn: request.oldCheckIn,
    oldCheckOut: request.oldCheckOut,
    status: CORRECTION_STATUS.REJECTED,
    requestedAt: request.requestedAt,
    requestedBy: request.requestedBy,
    requestedByName: request.requestedByName,
    reviewedAt: new Date().toISOString(),
    reviewedBy: editor.editorId,
    reviewedByName: editor.editorName,
    reviewNote: reason,
    rejectReason: reason,
    employeeNotified: false,
    createdAt: raw?.createdAt,
  }

  let saved
  if (db) {
    saved = normalizeUiRequest(await upsertCorrectionRequest(afterPayload))
    await writeAuditEvent({
      requestId: saved.id,
      attendanceId: saved.attendanceId,
      employeeId: saved.employeeId,
      branchId: saved.branchId,
      attendanceDate: saved.date,
      eventType: 'request_rejected',
      actorId: editor.editorId,
      actorName: editor.editorName,
      actorRole: editor.role,
      beforeData: before,
      afterData: afterPayload,
      note: reason,
      branchAtAction: getCurrentUserBranch() || saved.branchId || '',
    })
  } else {
    saved = normalizeUiRequest(await upsertLegacyRequest({
      ...request,
      status: ATTENDANCE_EDIT_REQUEST_STATUS.REJECTED,
      reviewedAt: afterPayload.reviewedAt,
      reviewedBy: editor.editorId,
      reviewedByName: editor.editorName,
      reviewNote: reason,
      employeeNotified: false,
    }))
  }

  notifyDataSynced(['settings', 'attendance-edit-requests', 'attendance-corrections'])
  return saved
}

export async function markAttendanceEditRequestNotified(requestIds = []) {
  if (!requestIds.length) return []
  const results = []
  const db = await isDatabaseAvailable()
  for (const id of requestIds) {
    if (db) {
      const request = await fetchCorrectionRequestById(id)
      if (!request || request.employeeNotified) continue
      results.push(normalizeUiRequest(await upsertCorrectionRequest({
        ...request,
        employeeNotified: true,
      })))
    } else {
      const request = await getLegacyById(id)
      if (!request || request.employeeNotified) continue
      results.push(normalizeUiRequest(await upsertLegacyRequest({
        ...request,
        employeeNotified: true,
      })))
    }
  }
  if (results.length) {
    notifyDataSynced(['settings', 'attendance-edit-requests', 'attendance-corrections'])
  }
  return results
}

export async function loadAttendanceEditRequests() {
  const db = await isDatabaseAvailable()
  const legacyRaw = await loadLegacyRequests().catch(() => [])
  const legacy = markUiSource(legacyRaw.map(normalizeUiRequest).filter(Boolean), 'legacy')

  if (!db) {
    return legacy.sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
  }

  const dbRaw = await fetchCorrectionRequestsFiltered({}).catch(() => [])
  const dbRows = markUiSource(dbRaw.map(normalizeUiRequest).filter(Boolean), 'db')
  const { merged } = mergeCorrectionRequestSources(dbRows, legacy)
  return merged
}

export async function loadPendingEditRequestsForCurrentManager({
  branchId = '',
  employeeId = '',
  fromDate = '',
  toDate = '',
} = {}) {
  const all = await loadAttendanceEditRequests()
  const scopedBranch = isAdmin()
    ? branchId
    : (getCurrentUserBranch() || '')
  return all
    .filter((item) => item.status === CORRECTION_STATUS.PENDING)
    .filter((item) => !scopedBranch || item.branchId === scopedBranch)
    .filter((item) => !employeeId || item.employeeId === employeeId)
    .filter((item) => !fromDate || item.date >= fromDate)
    .filter((item) => !toDate || item.date <= toDate)
}

export async function loadOwnAttendanceEditRequests() {
  const employeeId = getCurrentUserEmployeeId()
  assertEmployeeOwns(employeeId)
  const all = await loadAttendanceEditRequests()
  return all.filter((item) => item.employeeId === employeeId)
}

export async function loadOwnUnseenAttendanceReviews() {
  const employeeId = getCurrentUserEmployeeId()
  if (!employeeId) return []
  const all = await loadAttendanceEditRequests()
  return all.filter((item) => (
    item.employeeId === employeeId
    && !item.employeeNotified
    && (
      item.status === CORRECTION_STATUS.APPROVED
      || item.status === CORRECTION_STATUS.REJECTED
    )
  ))
}

export async function loadCorrectionRequestsForEmployeeRange(employeeId, fromDate, toDate) {
  if (!employeeId || !fromDate || !toDate) return []
  const all = await loadAttendanceEditRequests()
  return all.filter((item) => (
    item.employeeId === employeeId
    && item.date >= fromDate
    && item.date <= toDate
  ))
}

export {
  ATTENDANCE_EDIT_REQUEST_STATUS,
  CORRECTION_STATUS,
}
