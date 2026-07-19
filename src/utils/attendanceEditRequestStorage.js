import { fetchSettings, upsertSettings } from '../repositories/settingsRepository'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { loadSystemSettings, saveSystemSettings } from './systemSettingsStorage'

export const ATTENDANCE_EDIT_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `aer-${crypto.randomUUID()}`
  }
  return `aer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readLocalMap() {
  const settings = loadSystemSettings()
  const map = settings.attendanceEditRequests
  return map && typeof map === 'object' ? { ...map } : {}
}

function writeLocalMap(map) {
  const settings = loadSystemSettings()
  saveSystemSettings({
    ...settings,
    attendanceEditRequests: map,
  }, { skipRemoteSync: true })
  return map
}

async function readRemoteMap() {
  if (!isSupabaseConfigured) return readLocalMap()
  const remote = await fetchSettings()
  if (!remote || typeof remote !== 'object') return readLocalMap()
  const map = remote.attendanceEditRequests
  return map && typeof map === 'object' ? { ...map } : {}
}

async function writeRemoteMap(map) {
  if (!isSupabaseConfigured) {
    return writeLocalMap(map)
  }
  const remote = (await fetchSettings()) || {}
  await upsertSettings({
    ...remote,
    attendanceEditRequests: map,
  })
  return writeLocalMap(map)
}

export function normalizeAttendanceEditRequest(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id ?? '',
    type: row.type === 'create' ? 'create' : 'update',
    attendanceId: row.attendanceId ?? '',
    employeeId: row.employeeId ?? '',
    employeeName: row.employeeName ?? '',
    branchId: row.branchId ?? '',
    date: row.date ?? '',
    oldStatus: row.oldStatus ?? '',
    oldReason: row.oldReason ?? '',
    oldNote: row.oldNote ?? '',
    newStatus: row.newStatus ?? '',
    newReason: row.newReason ?? '',
    newNote: row.newNote ?? '',
    status: row.status ?? ATTENDANCE_EDIT_REQUEST_STATUS.PENDING,
    requestedAt: row.requestedAt ?? '',
    requestedBy: row.requestedBy ?? '',
    requestedByName: row.requestedByName ?? '',
    reviewedAt: row.reviewedAt ?? '',
    reviewedBy: row.reviewedBy ?? '',
    reviewedByName: row.reviewedByName ?? '',
    reviewNote: row.reviewNote ?? '',
    employeeNotified: Boolean(row.employeeNotified),
  }
}

export async function loadAttendanceEditRequests() {
  const map = await readRemoteMap()
  writeLocalMap(map)
  return Object.values(map)
    .map(normalizeAttendanceEditRequest)
    .filter(Boolean)
    .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
}

export function loadAttendanceEditRequestsLocal() {
  return Object.values(readLocalMap())
    .map(normalizeAttendanceEditRequest)
    .filter(Boolean)
    .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)))
}

export async function upsertAttendanceEditRequest(request) {
  const normalized = normalizeAttendanceEditRequest({
    ...request,
    id: request.id || createRequestId(),
  })
  const map = await readRemoteMap()
  map[normalized.id] = normalized
  await writeRemoteMap(map)
  return normalized
}

export async function getAttendanceEditRequestById(id) {
  const map = await readRemoteMap()
  return normalizeAttendanceEditRequest(map[id])
}

export function listPendingRequestsForBranch(requests, branchId, { allBranches = false } = {}) {
  return (requests ?? [])
    .filter((item) => item.status === ATTENDANCE_EDIT_REQUEST_STATUS.PENDING)
    .filter((item) => allBranches || !branchId || item.branchId === branchId)
}

export function listRequestsForEmployee(requests, employeeId) {
  return (requests ?? []).filter((item) => item.employeeId === employeeId)
}

export function listUnseenReviewResults(requests, employeeId) {
  return (requests ?? []).filter((item) => (
    item.employeeId === employeeId
    && !item.employeeNotified
    && (
      item.status === ATTENDANCE_EDIT_REQUEST_STATUS.APPROVED
      || item.status === ATTENDANCE_EDIT_REQUEST_STATUS.REJECTED
    )
  ))
}
