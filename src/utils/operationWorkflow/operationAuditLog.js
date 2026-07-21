import { getSessionUser } from '../storageAccess'
import { notifyDataSynced } from '../supabaseSync'
import { AUDIT_ACTIONS, OW_STORAGE_KEYS } from './operationWorkflowConstants'

const MAX_ENTRIES = 3000

function readList() {
  try {
    const raw = localStorage.getItem(OW_STORAGE_KEYS.auditLog)
    const data = raw ? JSON.parse(raw) : []
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeList(list) {
  localStorage.setItem(OW_STORAGE_KEYS.auditLog, JSON.stringify(list.slice(-MAX_ENTRIES)))
  notifyDataSynced(['operation-workflow'])
}

function getActor() {
  const user = getSessionUser()
  return {
    actorName: user?.employeeName || user?.name || user?.role || 'Hệ thống',
    actorRole: user?.role ?? 'unknown',
    actorBranchId: user?.branch ?? '',
  }
}

export function appendOperationAudit({
  action,
  entityType = '',
  entityId = '',
  entityName = '',
  branchId = '',
  oldValue = null,
  newValue = null,
  details = '',
}) {
  if (!action) return null
  const actor = getActor()
  const entry = {
    id: `ow-audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action,
    entityType,
    entityId,
    entityName,
    branchId,
    oldValue,
    newValue,
    details,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    createdAt: new Date().toISOString(),
  }
  try {
    const list = readList()
    list.push(entry)
    writeList(list)
  } catch (error) {
    console.warn('[OW Audit] Không ghi được nhật ký:', error?.message)
  }
  return entry
}

export function loadOperationAuditLogs({
  branchId = '',
  entityId = '',
  limit = 200,
} = {}) {
  let list = readList()
  if (branchId) list = list.filter((e) => !e.branchId || e.branchId === branchId)
  if (entityId) list = list.filter((e) => e.entityId === entityId)
  return list.slice(-limit).reverse()
}

export function getOperationAuditActionLabel(action) {
  switch (action) {
    case AUDIT_ACTIONS.TASK_COMPLETE:
      return 'Hoàn thành công việc'
    case AUDIT_ACTIONS.TASK_UNDO:
      return 'Bỏ tick công việc'
    case AUDIT_ACTIONS.TARGET_SET:
      return 'Đặt / sửa KPI ngày'
    case AUDIT_ACTIONS.TARGET_CLEAR:
      return 'Xóa KPI ngày'
    case AUDIT_ACTIONS.NOTE_ADD:
      return 'Thêm ghi chú quản lý'
    case AUDIT_ACTIONS.NOTE_DELETE:
      return 'Xóa ghi chú'
    default:
      return action || '—'
  }
}

export function formatAuditValue(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}
