import { getMonthPrefixFromDate } from './attendancePenalties'
import {
  calculatePenaltyForNewRecord,
  recomputeMonthlyPenalties,
} from './attendancePenalties'
import { notifyDataSynced } from './dataSyncEvents'
import { getBranchById, getBranchName } from './branchStorage'
import { getEmployeeById } from './employeeStorage'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { ATTENDANCE_STATUS } from '../constants/attendanceTypes'
import { assertCanEditAttendanceRecord } from './attendanceEditPolicy'
import { upsertBranchMinimal } from '../repositories/branchesRepository'
import { fetchEmployeeById } from '../repositories/employeesRepository'
import {
  createAttendanceId,
  createAttendanceLogId,
  fetchAttendanceByEmployeeAndDate,
  fetchAttendanceForEmployeeMonth,
  fetchAttendanceServerDate,
  insertAttendanceEditLogs,
  insertAttendanceRecord,
  updateAttendanceRecord,
} from '../repositories/attendanceRepository'

const ATTENDANCE_SYNC_TIMEOUT_MS = 8000
const ATTENDANCE_SAVE_TIMEOUT_MS = 15000

function notifyAttendanceDataChanged() {
  notifyDataSynced(['attendance', 'payroll', 'reports', 'dashboard'])
}

function withTimeout(promise, ms, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), ms)
    }),
  ])
}

function parseAttendanceError(error) {
  const message = error?.message ?? String(error ?? '')
  if (/Supabase chưa cấu hình/i.test(message)) {
    return 'Hệ thống chưa kết nối máy chủ. Liên hệ quản trị viên.'
  }
  if (/duplicate key|unique constraint|đã điểm danh/i.test(message)) {
    return 'Bạn đã điểm danh hôm nay. Không thể điểm danh lại.'
  }
  if (/foreign key|violates foreign key/i.test(message)) {
    if (/employee_id|employees/i.test(message)) {
      return 'Không lưu được chấm công: mã nhân viên chưa có trên máy chủ.'
    }
    if (/branch_id|branches/i.test(message)) {
      return 'Không lưu được chấm công: mã chi nhánh chưa có trên máy chủ.'
    }
    return 'Không lưu được chấm công. Liên hệ quản trị viên.'
  }
  if (error?.attendanceDebug) {
    console.error('[attendanceService]', error.attendanceDebug)
  }
  if (/quá lâu|timeout/i.test(message)) {
    return message
  }
  if (/Failed to fetch|network|NetworkError/i.test(message)) {
    return 'Mất kết nối mạng. Kiểm tra internet và thử lại.'
  }
  return message || 'Không thể lưu điểm danh. Vui lòng thử lại.'
}

async function ensureAttendanceForeignKeys(employeeId) {
  if (!isSupabaseConfigured || !employeeId) {
    throw new Error('Không xác định được nhân viên.')
  }

  const employee = getEmployeeById(employeeId)
  if (!employee?.id) {
    throw new Error('Không tìm thấy hồ sơ nhân viên.')
  }

  const branchId = employee.branchId ?? ''
  if (!branchId) {
    throw new Error('Nhân viên chưa được gán chi nhánh.')
  }

  const branch = getBranchById(branchId)
  if (!branch?.id) {
    throw new Error('Không tìm thấy chi nhánh của nhân viên.')
  }

  await withTimeout(
    upsertBranchMinimal(branch),
    ATTENDANCE_SYNC_TIMEOUT_MS,
    'Không thể chuẩn bị chi nhánh trên máy chủ. Kiểm tra mạng và thử lại.',
  )

  const remoteEmployee = await withTimeout(
    fetchEmployeeById(employee.id),
    ATTENDANCE_SYNC_TIMEOUT_MS,
    'Không thể kiểm tra hồ sơ nhân viên trên máy chủ. Kiểm tra mạng và thử lại.',
  )
  if (!remoteEmployee) {
    throw new Error('Nhân viên không tồn tại.')
  }

  return { employee, branchId }
}

export async function getServerAttendanceDate() {
  const server = await fetchAttendanceServerDate()
  if (!server.date) {
    throw new Error('Không lấy được ngày server.')
  }
  return server
}

export async function hasCheckedInToday(employeeId) {
  return withTimeout(
    (async () => {
      const { date } = await getServerAttendanceDate()
      const existing = await fetchAttendanceByEmployeeAndDate(employeeId, date)
      return Boolean(existing)
    })(),
    ATTENDANCE_SAVE_TIMEOUT_MS,
    'Không kiểm tra được điểm danh. Kiểm tra mạng và thử lại.',
  )
}

export async function submitEmployeeAttendance({
  employeeId,
  status,
  reason = '',
  note = '',
}) {
  if (!isSupabaseConfigured) {
    throw new Error('Hệ thống chưa kết nối máy chủ. Liên hệ quản trị viên.')
  }
  if (!employeeId) {
    throw new Error('Không xác định được nhân viên.')
  }
  if (!status) {
    throw new Error('Vui lòng chọn trạng thái điểm danh.')
  }

  let employee
  let branchId
  try {
    ;({ employee, branchId } = await ensureAttendanceForeignKeys(employeeId))
  } catch (err) {
    throw new Error(parseAttendanceError(err))
  }

  try {
    const saved = await withTimeout(
      (async () => {
        const { date, timestamp } = await getServerAttendanceDate()
        const existing = await fetchAttendanceByEmployeeAndDate(employee.id, date)
        if (existing) {
          throw new Error('Bạn đã điểm danh hôm nay. Không thể điểm danh lại.')
        }

        const monthPrefix = getMonthPrefixFromDate(date)
        const monthRecords = await fetchAttendanceForEmployeeMonth(employee.id, monthPrefix)
        const penaltyAmount = calculatePenaltyForNewRecord(status, monthRecords, date)

        return insertAttendanceRecord({
          id: createAttendanceId(),
          date,
          branchId,
          employeeId: employee.id,
          employeeName: employee.name ?? '',
          status,
          reason: reason.trim(),
          note: note.trim(),
          penaltyAmount,
          submittedAt: timestamp || new Date().toISOString(),
          submittedBy: employee.id,
          createdBy: employee.id,
        }, {
          onForeignKeyError: () => ensureAttendanceForeignKeys(employee.id),
        })
      })(),
      ATTENDANCE_SAVE_TIMEOUT_MS,
      'Lưu điểm danh quá lâu. Kiểm tra mạng và thử lại.',
    )
    notifyAttendanceDataChanged()
    return saved
  } catch (err) {
    throw new Error(parseAttendanceError(err))
  }
}

/**
 * Bổ sung chấm công lùi (kỳ lương 1): từ periodStart đến hôm nay ICT.
 * Không tạo trùng nếu ngày đã có bản ghi.
 */
export async function submitEmployeeAttendanceBackfill({
  employeeId,
  date,
  status,
  reason = '',
  note = '',
  minDate = '2026-07-01',
}) {
  if (!isSupabaseConfigured) {
    throw new Error('Hệ thống chưa kết nối máy chủ. Liên hệ quản trị viên.')
  }
  if (!employeeId) throw new Error('Không xác định được nhân viên.')
  if (!status) throw new Error('Vui lòng chọn trạng thái điểm danh.')
  if (!date) throw new Error('Vui lòng chọn ngày cần bổ sung.')

  const { date: serverDate } = await getServerAttendanceDate()
  if (date > serverDate) {
    throw new Error('Không được chọn ngày tương lai.')
  }
  if (date < minDate) {
    throw new Error(`Chỉ được bổ sung từ ngày ${minDate}.`)
  }

  let employee
  let branchId
  try {
    ;({ employee, branchId } = await ensureAttendanceForeignKeys(employeeId))
  } catch (err) {
    throw new Error(parseAttendanceError(err))
  }

  try {
    const saved = await withTimeout(
      (async () => {
        const existing = await fetchAttendanceByEmployeeAndDate(employee.id, date)
        if (existing) {
          const err = new Error('Ngày này đã có chấm công. Không tạo bản ghi trùng.')
          err.existing = existing
          throw err
        }

        const monthPrefix = getMonthPrefixFromDate(date)
        const monthRecords = await fetchAttendanceForEmployeeMonth(employee.id, monthPrefix)
        const penaltyAmount = calculatePenaltyForNewRecord(status, monthRecords, date)

        return insertAttendanceRecord({
          id: createAttendanceId(),
          date,
          branchId,
          employeeId: employee.id,
          employeeName: employee.name ?? '',
          status,
          reason: reason.trim(),
          note: note.trim(),
          penaltyAmount,
          submittedAt: new Date().toISOString(),
          submittedBy: employee.id,
          createdBy: employee.id,
        }, {
          onForeignKeyError: () => ensureAttendanceForeignKeys(employee.id),
        })
      })(),
      ATTENDANCE_SAVE_TIMEOUT_MS,
      'Lưu điểm danh quá lâu. Kiểm tra mạng và thử lại.',
    )
    notifyAttendanceDataChanged()
    return saved
  } catch (err) {
    if (err?.existing) throw err
    throw new Error(parseAttendanceError(err))
  }
}

function buildEditLogs(attendanceId, editor, changes, editNote = '') {
  return changes.map((change) => ({
    id: createAttendanceLogId(),
    attendanceId,
    editorId: editor.editorId ?? '',
    editorName: editor.editorName ?? '',
    fieldName: change.field,
    oldValue: String(change.oldValue ?? ''),
    newValue: String(change.newValue ?? ''),
    note: editNote,
  }))
}

function assertCanEditAttendanceRecordBranch(record, options = {}) {
  return assertCanEditAttendanceRecord(record, options)
}

async function recomputeAndPersistMonthPenalties(employeeId, monthPrefix, draftRecords) {
  const recomputed = recomputeMonthlyPenalties(draftRecords, monthPrefix)
  const originalMap = new Map(draftRecords.map((row) => [row.id, row]))
  for (const row of recomputed) {
    const original = originalMap.get(row.id)
    if (!original || original.penaltyAmount !== row.penaltyAmount) {
      await updateAttendanceRecord({
        ...original,
        ...row,
      })
    }
  }
  return recomputed
}

export async function adminCreateAttendance({
  employeeId,
  employeeName,
  branchId,
  date,
  status,
  reason = '',
  note = '',
  editNote = '',
  submittedAt,
  updatedAt,
  editor,
}) {
  const resolvedBranchId = branchId || getEmployeeById(employeeId)?.branchId || ''
  await assertCanEditAttendanceRecordBranch({ branchId: resolvedBranchId }, { date })
  if (!String(editNote ?? '').trim()) {
    throw new Error('Vui lòng nhập lý do bổ sung chấm công.')
  }
  if (resolvedBranchId) {
    await ensureAttendanceForeignKeys(employeeId)
  }

  const existing = await fetchAttendanceByEmployeeAndDate(employeeId, date)
  if (existing) {
    throw new Error('Nhân viên đã có bản ghi chấm công trong ngày này. Không được tạo trùng.')
  }

  const monthPrefix = getMonthPrefixFromDate(date)
  const monthRecords = await fetchAttendanceForEmployeeMonth(employeeId, monthPrefix)
  const penaltyAmount = calculatePenaltyForNewRecord(status, monthRecords, date)

  const now = new Date().toISOString()
  const resolvedSubmittedAt = submittedAt || now
  const resolvedUpdatedAt = updatedAt || resolvedSubmittedAt

  const saved = await insertAttendanceRecord({
    id: createAttendanceId(),
    date,
    branchId: resolvedBranchId || branchId,
    employeeId,
    employeeName: employeeName ?? getEmployeeById(employeeId)?.name ?? '',
    status,
    reason: reason.trim(),
    note: note.trim(),
    penaltyAmount,
    submittedAt: resolvedSubmittedAt,
    updatedAt: resolvedUpdatedAt,
    submittedBy: editor?.editorId ?? editor?.editorName ?? 'admin',
    createdBy: editor?.editorId ?? editor?.editorName ?? 'admin',
  }, {
    onForeignKeyError: () => ensureAttendanceForeignKeys(employeeId),
  })

  notifyAttendanceDataChanged()

  await insertAttendanceEditLogs([{
    id: createAttendanceLogId(),
    attendanceId: saved.id,
    editorId: editor?.editorId ?? 'admin',
    editorName: editor?.editorName ?? 'Admin',
    fieldName: 'create',
    oldValue: '',
    newValue: `${date}|${status}|${resolvedSubmittedAt}|${resolvedUpdatedAt}`,
    note: editNote.trim(),
  }])

  return saved
}

export async function adminUpdateAttendance({
  record,
  nextDate,
  nextStatus,
  nextReason,
  nextNote,
  nextSubmittedAt,
  nextUpdatedAt,
  editNote = '',
  editor,
}) {
  await assertCanEditAttendanceRecordBranch(record, { date: nextDate ?? record.date })
  if (!String(editNote ?? '').trim()) {
    throw new Error('Vui lòng nhập lý do chỉnh sửa.')
  }

  const resolvedDate = (nextDate ?? record.date ?? '').trim()
  const resolvedStatus = nextStatus ?? record.status
  const resolvedReason = (nextReason ?? record.reason ?? '').trim()
  const resolvedNote = (nextNote ?? record.note ?? '').trim()
  const resolvedSubmittedAt = nextSubmittedAt ?? record.submittedAt ?? ''
  const resolvedUpdatedAt = nextUpdatedAt ?? record.updatedAt ?? new Date().toISOString()

  const changes = []
  if (resolvedDate && resolvedDate !== record.date) {
    changes.push({ field: 'date', oldValue: record.date, newValue: resolvedDate })
  }
  if (resolvedStatus !== record.status) {
    changes.push({ field: 'status', oldValue: record.status, newValue: resolvedStatus })
  }
  if (resolvedReason !== (record.reason ?? '').trim()) {
    changes.push({ field: 'reason', oldValue: record.reason, newValue: resolvedReason })
  }
  if (resolvedNote !== (record.note ?? '').trim()) {
    changes.push({ field: 'note', oldValue: record.note, newValue: resolvedNote })
  }
  if (resolvedSubmittedAt && resolvedSubmittedAt !== (record.submittedAt ?? '')) {
    changes.push({ field: 'check_in', oldValue: record.submittedAt, newValue: resolvedSubmittedAt })
  }
  if (resolvedUpdatedAt && resolvedUpdatedAt !== (record.updatedAt ?? '')) {
    changes.push({ field: 'check_out', oldValue: record.updatedAt, newValue: resolvedUpdatedAt })
  }

  if (changes.length === 0) {
    return record
  }

  if (resolvedDate !== record.date) {
    const duplicate = await fetchAttendanceByEmployeeAndDate(record.employeeId, resolvedDate)
    if (duplicate && duplicate.id !== record.id) {
      throw new Error('Nhân viên đã có bản ghi chấm công trong ngày này. Không được tạo trùng.')
    }
  }

  const oldMonthPrefix = getMonthPrefixFromDate(record.date)
  const newMonthPrefix = getMonthPrefixFromDate(resolvedDate)
  const oldMonthRecords = await fetchAttendanceForEmployeeMonth(record.employeeId, oldMonthPrefix)
  const oldDraft = oldMonthRecords.map((row) =>
    row.id === record.id
      ? {
          ...row,
          date: resolvedDate,
          status: resolvedStatus,
          reason: resolvedReason,
          note: resolvedNote,
          submittedAt: resolvedSubmittedAt,
          updatedAt: resolvedUpdatedAt,
        }
      : row,
  )

  let penaltyAmount = record.penaltyAmount ?? 0
  if (oldMonthPrefix === newMonthPrefix) {
    const recomputed = recomputeMonthlyPenalties(oldDraft, oldMonthPrefix)
    penaltyAmount = recomputed.find((row) => row.id === record.id)?.penaltyAmount ?? 0
  } else {
    const oldWithoutRecord = oldMonthRecords.filter((row) => row.id !== record.id)
    await recomputeAndPersistMonthPenalties(record.employeeId, oldMonthPrefix, oldWithoutRecord)

    const newMonthRecords = await fetchAttendanceForEmployeeMonth(record.employeeId, newMonthPrefix)
    const newDraft = [
      ...newMonthRecords.filter((row) => row.id !== record.id),
      {
        ...record,
        date: resolvedDate,
        status: resolvedStatus,
        reason: resolvedReason,
        note: resolvedNote,
        submittedAt: resolvedSubmittedAt,
        updatedAt: resolvedUpdatedAt,
      },
    ]
    const recomputedNew = recomputeMonthlyPenalties(newDraft, newMonthPrefix)
    penaltyAmount = recomputedNew.find((row) => row.id === record.id)?.penaltyAmount ?? 0
  }

  const saved = await updateAttendanceRecord({
    ...record,
    date: resolvedDate,
    status: resolvedStatus,
    reason: resolvedReason,
    note: resolvedNote,
    submittedAt: resolvedSubmittedAt,
    updatedAt: resolvedUpdatedAt,
    penaltyAmount,
  })

  notifyAttendanceDataChanged()

  await insertAttendanceEditLogs(
    buildEditLogs(record.id, editor, changes, editNote || resolvedNote),
  )

  if (oldMonthPrefix === newMonthPrefix) {
    const recomputed = recomputeMonthlyPenalties(
      oldDraft.map((row) => (row.id === record.id ? saved : row)),
      oldMonthPrefix,
    )
    for (const sibling of recomputed.filter((row) => row.id !== record.id)) {
      const original = oldMonthRecords.find((row) => row.id === sibling.id)
      if (original && original.penaltyAmount !== sibling.penaltyAmount) {
        await updateAttendanceRecord({
          ...original,
          penaltyAmount: sibling.penaltyAmount,
        })
      }
    }
  } else {
    const newMonthRecords = await fetchAttendanceForEmployeeMonth(record.employeeId, newMonthPrefix)
    await recomputeAndPersistMonthPenalties(record.employeeId, newMonthPrefix, newMonthRecords)
  }

  return saved
}

export async function adminVoidAttendance({
  record,
  voidType = 'cancelled',
  editNote = '',
  editor,
}) {
  await assertCanEditAttendanceRecordBranch(record)

  const nextStatus = voidType === 'invalid'
    ? ATTENDANCE_STATUS.INVALID
    : ATTENDANCE_STATUS.CANCELLED

  if (record.status === nextStatus) {
    throw new Error('Bản ghi đã ở trạng thái này.')
  }
  if (!String(editNote ?? '').trim()) {
    throw new Error('Vui lòng nhập lý do hủy / đánh dấu không hợp lệ.')
  }

  return adminUpdateAttendance({
    record,
    nextStatus,
    nextReason: record.reason,
    nextNote: editNote.trim(),
    editNote: editNote.trim(),
    editor,
  })
}
