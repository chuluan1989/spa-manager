import { getCurrentUserName } from '../constants/auth'

const STORAGE_KEY = 'spa-manager-service-change-logs'

function loadMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function saveMap(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

function entryKey(branchId, durationId) {
  return `${branchId}:${durationId}`
}

export function appendServiceChangeLog(branchId, durationId, entry) {
  if (!branchId || !durationId) return null

  const map = loadMap()
  const key = entryKey(branchId, durationId)
  const list = Array.isArray(map[key]) ? map[key] : []

  const row = {
    id: `svclog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    by: entry.by ?? '',
    byName: entry.byName ?? getCurrentUserName() ?? 'Admin',
    oldPrice: entry.oldPrice ?? null,
    newPrice: entry.newPrice ?? null,
    oldPercent: entry.oldPercent ?? null,
    newPercent: entry.newPercent ?? null,
    action: entry.action ?? 'update',
    note: entry.note ?? '',
  }

  map[key] = [row, ...list].slice(0, 100)
  saveMap(map)
  return row
}

export function getServiceChangeLogs(branchId, durationId) {
  if (!branchId || !durationId) return []
  const map = loadMap()
  return Array.isArray(map[entryKey(branchId, durationId)]) ? map[entryKey(branchId, durationId)] : []
}

export function getLastServiceChangeMeta(branchId, durationId) {
  const logs = getServiceChangeLogs(branchId, durationId)
  if (!logs.length) return null
  const latest = logs[0]
  return {
    updatedAt: latest.at,
    updatedBy: latest.byName || latest.by || '—',
  }
}
