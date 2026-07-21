import { notifyDataSynced } from '../supabaseSync'
import { appendOperationAudit } from './operationAuditLog'
import { AUDIT_ACTIONS, DEFAULT_DAILY_TASKS, OW_STORAGE_KEYS } from './operationWorkflowConstants'

function readStore() {
  try {
    const raw = localStorage.getItem(OW_STORAGE_KEYS.dailyTasks)
    const data = raw ? JSON.parse(raw) : {}
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function writeStore(store) {
  localStorage.setItem(OW_STORAGE_KEYS.dailyTasks, JSON.stringify(store))
  notifyDataSynced(['operation-workflow'])
}

function dayKey(branchId, date) {
  return `${branchId || 'unknown'}::${date || ''}`
}

export function getDefaultDailyTaskCatalog() {
  return DEFAULT_DAILY_TASKS.map((t) => ({ ...t }))
}

/**
 * @returns {{ catalog: Array, completions: Record<string, object> }}
 */
export function loadBranchDailyTasks(branchId, date) {
  const store = readStore()
  const key = dayKey(branchId, date)
  const row = store[key] || { completions: {} }
  return {
    catalog: getDefaultDailyTaskCatalog(),
    completions: row.completions || {},
    branchId,
    date,
  }
}

export function toggleDailyTaskComplete({
  branchId,
  date,
  taskId,
  taskLabel,
  completedBy,
  completedByName,
}) {
  if (!branchId || !date || !taskId) return null
  const store = readStore()
  const key = dayKey(branchId, date)
  const row = store[key] || { completions: {} }
  const completions = { ...(row.completions || {}) }
  const existing = completions[taskId]
  let result

  if (existing?.completed) {
    const oldValue = { ...existing }
    delete completions[taskId]
    appendOperationAudit({
      action: AUDIT_ACTIONS.TASK_UNDO,
      entityType: 'daily_task',
      entityId: taskId,
      entityName: taskLabel || taskId,
      branchId,
      oldValue,
      newValue: null,
      details: `${date} · bỏ hoàn thành`,
    })
    result = { completed: false }
  } else {
    const entry = {
      completed: true,
      completedAt: new Date().toISOString(),
      completedBy: completedBy || '',
      completedByName: completedByName || '',
      taskLabel: taskLabel || taskId,
    }
    completions[taskId] = entry
    appendOperationAudit({
      action: AUDIT_ACTIONS.TASK_COMPLETE,
      entityType: 'daily_task',
      entityId: taskId,
      entityName: taskLabel || taskId,
      branchId,
      oldValue: null,
      newValue: entry,
      details: `${date} · hoàn thành`,
    })
    result = entry
  }

  store[key] = { completions, updatedAt: new Date().toISOString() }
  writeStore(store)
  return result
}

export function getBranchTaskProgress(branchId, date) {
  const { catalog, completions } = loadBranchDailyTasks(branchId, date)
  const done = catalog.filter((t) => completions[t.id]?.completed).length
  return {
    total: catalog.length,
    done,
    percent: catalog.length ? Math.round((done / catalog.length) * 100) : 0,
    incomplete: catalog.filter((t) => !completions[t.id]?.completed),
  }
}
