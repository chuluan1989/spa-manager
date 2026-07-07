import { getSessionUser } from './storageAccess'

const STORAGE_KEY = 'spa-manager-employee-audit-log'
const MAX_ENTRIES = 2000

export const EMPLOYEE_AUDIT_ACTIONS = {
  STATUS_CHANGE: 'status_change',
  TRANSFER: 'transfer',
  ARCHIVE: 'archive',
  PROFILE_UPDATE: 'profile_update',
  PERMANENT_DELETE: 'permanent_delete',
  PERMANENT_DELETE_BLOCKED: 'permanent_delete_blocked',
}

function getActor() {
  const user = getSessionUser()
  return {
    actorName: user?.employeeName || user?.name || user?.role || 'Hệ thống',
    actorRole: user?.role ?? 'unknown',
  }
}

export function loadEmployeeAuditLogs({ employeeId = '', limit = 200 } = {}) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : []
    if (!Array.isArray(data)) return []
    const filtered = employeeId
      ? data.filter((entry) => entry.employeeId === employeeId)
      : data
    return filtered.slice(-limit).reverse()
  } catch {
    return []
  }
}

export function appendEmployeeAuditLog({
  employeeId,
  employeeName = '',
  action,
  details = '',
  meta = {},
}) {
  if (!employeeId || !action) return null

  const actor = getActor()
  const entry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employeeId,
    employeeName,
    action,
    details,
    meta,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    createdAt: new Date().toISOString(),
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : []
    const list = Array.isArray(data) ? data : []
    list.push(entry)
    const trimmed = list.slice(-MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch (error) {
    console.warn('[Audit] Không thể ghi nhật ký nhân viên:', error?.message)
  }

  return entry
}

export function getAuditActionLabel(action) {
  switch (action) {
    case EMPLOYEE_AUDIT_ACTIONS.STATUS_CHANGE:
      return 'Đổi trạng thái'
    case EMPLOYEE_AUDIT_ACTIONS.TRANSFER:
      return 'Chuyển chi nhánh'
    case EMPLOYEE_AUDIT_ACTIONS.ARCHIVE:
      return 'Lưu trữ'
    case EMPLOYEE_AUDIT_ACTIONS.PROFILE_UPDATE:
      return 'Cập nhật hồ sơ'
    case EMPLOYEE_AUDIT_ACTIONS.PERMANENT_DELETE:
      return 'Xóa vĩnh viễn'
    case EMPLOYEE_AUDIT_ACTIONS.PERMANENT_DELETE_BLOCKED:
      return 'Chặn xóa vĩnh viễn'
    default:
      return action
  }
}
