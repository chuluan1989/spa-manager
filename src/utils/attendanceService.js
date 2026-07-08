import { getMonthPrefixFromDate } from './attendancePenalties'
import {
  calculatePenaltyForNewRecord,
  recomputeMonthlyPenalties,
} from './attendancePenalties'
import { notifyDataSynced } from './dataSyncEvents'
import { getBranchById, getBranchName } from './branchStorage'
import { getEmployeeById } from './employeeStorage'
import { upsertEmployeeMinimal } from '../repositories/employeesRepository'
import { upsertBranches } from '../repositories/branchesRepository'
import { isSupabaseConfigured } from '../lib/supabaseClient'
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
  if (/foreign key|violates foreign key|employees|branches/i.test(message)) {
    return 'Dữ liệu nhân viên/chi nhánh chưa đồng bộ. Vui lòng thử lại sau vài giây.'
  }
  if (/quá lâu|timeout/i.test(message)) {
    return message
  }
  if (/Failed to fetch|network|NetworkError/i.test(message)) {
    return 'Mất kết nối mạng. Kiểm tra internet và thử lại.'
  }
  return message || 'Không thể lưu điểm danh. Vui lòng thử lại.'
}

async function ensureBranchSyncedForAttendance(branchId) {
  if (!isSupabaseConfigured || !branchId) return
  const branch = getBranchById(branchId)
  if (!branch?.id) {
    throw new Error('Không tìm thấy chi nhánh.')
  }
  await withTimeout(
    upsertBranches([branch]),
    ATTENDANCE_SYNC_TIMEOUT_MS,
    'Đồng bộ chi nhánh quá lâu. Kiểm tra mạng và thử lại.',
  )
}

async function ensureEmployeeSyncedForAttendance(employeeId, branchId) {
  if (!isSupabaseConfigured || !employeeId) return
  const employee = getEmployeeById(employeeId)
  if (!employee) {
    throw new Error('Không tìm thấy hồ sơ nhân viên. Liên hệ quản trị viên.')
  }
  const resolvedBranchId = branchId || employee.branchId || ''
  if (resolvedBranchId) {
    await ensureBranchSyncedForAttendance(resolvedBranchId)
  }
  await withTimeout(
    upsertEmployeeMinimal({
      id: employee.id,
      branchId: resolvedBranchId,
      name: employee.name,
      status: employee.status ?? 'active',
    }),
    ATTENDANCE_SYNC_TIMEOUT_MS,
    'Đồng bộ nhân viên quá lâu. Kiểm tra mạng và thử lại.',
  )
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
  employeeName,
  branchId,
  status,
  reason = '',
  note = '',
  submittedBy,
}) {
  if (!isSupabaseConfigured) {
    throw new Error('Hệ thống chưa kết nối máy chủ. Liên hệ quản trị viên.')
  }
  if (!employeeId) {
    throw new Error('Không xác định được nhân viên.')
  }

  const resolvedBranchId = branchId || getEmployeeById(employeeId)?.branchId || ''
  if (!resolvedBranchId) {
    throw new Error('Không xác định được chi nhánh.')
  }

  try {
    await ensureEmployeeSyncedForAttendance(employeeId, resolvedBranchId)
  } catch (err) {
    throw new Error(parseAttendanceError(err))
  }

  const branchName = getBranchName(resolvedBranchId)

  try {
    const saved = await withTimeout(
      (async () => {
        const { date, timestamp } = await getServerAttendanceDate()
        const existing = await fetchAttendanceByEmployeeAndDate(employeeId, date)
        if (existing) {
          throw new Error('Bạn đã điểm danh hôm nay. Không thể điểm danh lại.')
        }

        const monthPrefix = getMonthPrefixFromDate(date)
        const monthRecords = await fetchAttendanceForEmployeeMonth(employeeId, monthPrefix)
        const penaltyAmount = calculatePenaltyForNewRecord(status, monthRecords, date)

        return insertAttendanceRecord({
          id: createAttendanceId(),
          date,
          branchId: resolvedBranchId,
          branchName,
          employeeId,
          employeeName,
          status,
          reason: reason.trim(),
          note: note.trim(),
          penaltyAmount,
          submittedAt: timestamp || new Date().toISOString(),
          submittedBy,
          createdBy: submittedBy,
        })
      })(),
      ATTENDANCE_SAVE_TIMEOUT_MS,
      'Lưu điểm danh quá lâu. Kiểm tra mạng và thử lại.',
    )
    notifyDataSynced(['attendance'])
    return saved
  } catch (err) {
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

export async function adminCreateAttendance({
  employeeId,
  employeeName,
  branchId,
  date,
  status,
  reason = '',
  note = '',
  editor,
}) {
  const existing = await fetchAttendanceByEmployeeAndDate(employeeId, date)
  if (existing) {
    throw new Error('Nhân viên đã có bản ghi chấm công trong ngày này.')
  }

  const monthPrefix = getMonthPrefixFromDate(date)
  const monthRecords = await fetchAttendanceForEmployeeMonth(employeeId, monthPrefix)
  const penaltyAmount = calculatePenaltyForNewRecord(status, monthRecords, date)

  const saved = await insertAttendanceRecord({
    id: createAttendanceId(),
    date,
    branchId,
    branchName: getBranchName(branchId),
    employeeId,
    employeeName,
    status,
    reason: reason.trim(),
    note: note.trim(),
    penaltyAmount,
    submittedAt: new Date().toISOString(),
    submittedBy: editor?.editorName ?? 'Admin',
    createdBy: editor?.editorName ?? 'Admin',
  })

  notifyDataSynced(['attendance'])

  await insertAttendanceEditLogs([{
    id: createAttendanceLogId(),
    attendanceId: saved.id,
    editorId: editor?.editorId ?? 'admin',
    editorName: editor?.editorName ?? 'Admin',
    fieldName: 'create',
    oldValue: '',
    newValue: status,
    note: note.trim(),
  }])

  return saved
}

export async function adminUpdateAttendance({
  record,
  nextStatus,
  nextReason,
  nextNote,
  editor,
}) {
  const changes = []
  if (nextStatus !== record.status) {
    changes.push({ field: 'status', oldValue: record.status, newValue: nextStatus })
  }
  if ((nextReason ?? '').trim() !== (record.reason ?? '').trim()) {
    changes.push({ field: 'reason', oldValue: record.reason, newValue: nextReason })
  }
  if ((nextNote ?? '').trim() !== (record.note ?? '').trim()) {
    changes.push({ field: 'note', oldValue: record.note, newValue: nextNote })
  }

  if (changes.length === 0) {
    return record
  }

  const monthPrefix = getMonthPrefixFromDate(record.date)
  const monthRecords = await fetchAttendanceForEmployeeMonth(record.employeeId, monthPrefix)
  const updatedDraft = monthRecords.map((row) =>
    row.id === record.id
      ? {
          ...row,
          status: nextStatus,
          reason: (nextReason ?? '').trim(),
          note: (nextNote ?? '').trim(),
        }
      : row,
  )

  const recomputed = recomputeMonthlyPenalties(updatedDraft, monthPrefix)
  const recomputedRecord = recomputed.find((row) => row.id === record.id) ?? {
    ...record,
    status: nextStatus,
    penaltyAmount: 0,
  }

  const saved = await updateAttendanceRecord({
    ...record,
    status: nextStatus,
    reason: (nextReason ?? '').trim(),
    note: (nextNote ?? '').trim(),
    penaltyAmount: recomputedRecord.penaltyAmount ?? 0,
  })

  notifyDataSynced(['attendance'])

  await insertAttendanceEditLogs(buildEditLogs(record.id, editor, changes, nextNote))

  for (const sibling of recomputed.filter((row) => row.id !== record.id)) {
    const original = monthRecords.find((row) => row.id === sibling.id)
    if (original && original.penaltyAmount !== sibling.penaltyAmount) {
      await updateAttendanceRecord({
        ...original,
        penaltyAmount: sibling.penaltyAmount,
      })
    }
  }

  return saved
}
