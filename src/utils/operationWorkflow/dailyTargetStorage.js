import { notifyDataSynced } from '../supabaseSync'
import { appendOperationAudit } from './operationAuditLog'
import { AUDIT_ACTIONS, OW_STORAGE_KEYS, TARGET_METRICS } from './operationWorkflowConstants'

function readStore() {
  try {
    const raw = localStorage.getItem(OW_STORAGE_KEYS.dailyTargets)
    const data = raw ? JSON.parse(raw) : {}
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function writeStore(store) {
  localStorage.setItem(OW_STORAGE_KEYS.dailyTargets, JSON.stringify(store))
  notifyDataSynced(['operation-workflow'])
}

function targetKey(employeeId, date) {
  return `${employeeId || ''}::${date || ''}`
}

export function loadDailyTarget(employeeId, date) {
  if (!employeeId || !date) return null
  const store = readStore()
  return store[targetKey(employeeId, date)] || null
}

export function loadDailyTargetsForDate(date, employeeIds = null) {
  const store = readStore()
  const suffix = `::${date}`
  const rows = []
  for (const [key, value] of Object.entries(store)) {
    if (!key.endsWith(suffix)) continue
    const employeeId = key.slice(0, -suffix.length)
    if (employeeIds && !employeeIds.has(employeeId)) continue
    rows.push({ employeeId, date, ...value })
  }
  return rows
}

export function saveDailyTarget({
  employeeId,
  employeeName = '',
  branchId = '',
  date,
  revenue = 0,
  customers = 0,
  requested = 0,
  tips = 0,
}) {
  if (!employeeId || !date) return null
  const store = readStore()
  const key = targetKey(employeeId, date)
  const oldValue = store[key] || null
  const entry = {
    employeeId,
    employeeName,
    branchId,
    date,
    revenue: Number(revenue) || 0,
    customers: Number(customers) || 0,
    requested: Number(requested) || 0,
    tips: Number(tips) || 0,
    updatedAt: new Date().toISOString(),
  }
  store[key] = entry
  writeStore(store)
  appendOperationAudit({
    action: AUDIT_ACTIONS.TARGET_SET,
    entityType: 'daily_target',
    entityId: employeeId,
    entityName: employeeName || employeeId,
    branchId,
    oldValue,
    newValue: entry,
    details: `KPI ngày ${date}`,
  })
  return entry
}

export function clearDailyTarget(employeeId, date, meta = {}) {
  if (!employeeId || !date) return false
  const store = readStore()
  const key = targetKey(employeeId, date)
  const oldValue = store[key]
  if (!oldValue) return false
  delete store[key]
  writeStore(store)
  appendOperationAudit({
    action: AUDIT_ACTIONS.TARGET_CLEAR,
    entityType: 'daily_target',
    entityId: employeeId,
    entityName: meta.employeeName || employeeId,
    branchId: meta.branchId || oldValue.branchId || '',
    oldValue,
    newValue: null,
    details: `Xóa KPI ngày ${date}`,
  })
  return true
}

export { TARGET_METRICS }
