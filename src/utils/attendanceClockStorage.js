import { fetchSettings, upsertSettings } from '../repositories/settingsRepository'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { loadSystemSettings, saveSystemSettings } from './systemSettingsStorage'

function clockKey(employeeId, date) {
  return `${employeeId}:${date}`
}

function readLocalMap() {
  const settings = loadSystemSettings()
  const map = settings.attendanceClockTimes
  return map && typeof map === 'object' ? { ...map } : {}
}

function writeLocalMap(map) {
  const settings = loadSystemSettings()
  saveSystemSettings({
    ...settings,
    attendanceClockTimes: map,
  }, { skipRemoteSync: true })
  return map
}

async function readRemoteMap() {
  if (!isSupabaseConfigured) return readLocalMap()
  const remote = await fetchSettings()
  if (!remote || typeof remote !== 'object') return readLocalMap()
  const map = remote.attendanceClockTimes
  return map && typeof map === 'object' ? { ...map } : {}
}

async function writeRemoteMap(map) {
  if (!isSupabaseConfigured) return writeLocalMap(map)
  const remote = (await fetchSettings()) || {}
  await upsertSettings({
    ...remote,
    attendanceClockTimes: map,
  })
  return writeLocalMap(map)
}

export function normalizeAttendanceClockEntry(row) {
  if (!row || typeof row !== 'object') return null
  return {
    employeeId: row.employeeId ?? '',
    date: row.date ?? '',
    checkInAt: row.checkInAt ?? '',
    checkOutAt: row.checkOutAt ?? '',
    updatedAt: row.updatedAt ?? '',
  }
}

export async function getAttendanceClockTimes(employeeId, date) {
  if (!employeeId || !date) return null
  const map = await readRemoteMap()
  writeLocalMap(map)
  return normalizeAttendanceClockEntry(map[clockKey(employeeId, date)])
}

export function getAttendanceClockTimesLocal(employeeId, date) {
  if (!employeeId || !date) return null
  return normalizeAttendanceClockEntry(readLocalMap()[clockKey(employeeId, date)])
}

export async function saveAttendanceCheckInTime(employeeId, date, checkInAt = new Date().toISOString()) {
  const map = await readRemoteMap()
  const key = clockKey(employeeId, date)
  const prev = normalizeAttendanceClockEntry(map[key]) || {}
  const next = {
    employeeId,
    date,
    checkInAt: prev.checkInAt || checkInAt,
    checkOutAt: prev.checkOutAt || '',
    updatedAt: new Date().toISOString(),
  }
  map[key] = next
  await writeRemoteMap(map)
  return next
}

export async function saveAttendanceCheckOutTime(employeeId, date, checkOutAt = new Date().toISOString()) {
  const map = await readRemoteMap()
  const key = clockKey(employeeId, date)
  const prev = normalizeAttendanceClockEntry(map[key]) || {}
  if (!prev.checkInAt) {
    throw new Error('Chưa có giờ vào. Vui lòng chấm công vào trước.')
  }
  if (prev.checkOutAt) {
    throw new Error('Bạn đã chấm công ra hôm nay.')
  }
  const next = {
    employeeId,
    date,
    checkInAt: prev.checkInAt,
    checkOutAt,
    updatedAt: new Date().toISOString(),
  }
  map[key] = next
  await writeRemoteMap(map)
  return next
}
