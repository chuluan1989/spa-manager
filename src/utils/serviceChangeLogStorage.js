import { getCurrentUserName, getCurrentUser } from '../constants/auth'
import { insertServiceChangeLog } from '../repositories/serviceChangeLogRepository'

export async function appendServiceChangeLog(branchId, durationId, entry = {}) {
  if (!branchId || !durationId) return null

  const reason = String(entry.reason ?? entry.changeReason ?? '').trim()
  const oldValues = {
    price: entry.oldPrice ?? null,
    commissionPercent: entry.oldPercent ?? null,
  }
  const newValues = {
    price: entry.newPrice ?? null,
    commissionPercent: entry.newPercent ?? null,
    ...(reason ? { reason, note: reason } : {}),
  }

  return insertServiceChangeLog({
    branchId,
    durationId,
    serviceId: entry.serviceId ?? '',
    action: entry.action ?? 'update_price',
    oldValues,
    newValues,
    changeReason: reason,
    reason,
    changedBy: getCurrentUser()?.id ?? getCurrentUser()?.employeeId ?? '',
    changedByName: entry.byName ?? getCurrentUserName() ?? 'Admin',
  })
}

export {
  fetchServiceChangeLogs,
  fetchLatestServiceChangeMeta,
} from '../repositories/serviceChangeLogRepository'
