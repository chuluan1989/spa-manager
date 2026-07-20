import { getCurrentUserName, getCurrentUser } from '../constants/auth'
import { insertServiceChangeLog } from '../repositories/serviceChangeLogRepository'

export async function appendServiceChangeLog(branchId, durationId, entry = {}) {
  if (!branchId || !durationId) return null

  return insertServiceChangeLog({
    branchId,
    durationId,
    serviceId: entry.serviceId ?? '',
    action: entry.action ?? 'update_price',
    oldValues: {
      price: entry.oldPrice ?? null,
      commissionPercent: entry.oldPercent ?? null,
    },
    newValues: {
      price: entry.newPrice ?? null,
      commissionPercent: entry.newPercent ?? null,
    },
    changedBy: getCurrentUser()?.id ?? getCurrentUser()?.employeeId ?? '',
    changedByName: entry.byName ?? getCurrentUserName() ?? 'Admin',
  })
}

export {
  fetchServiceChangeLogs,
  fetchLatestServiceChangeMeta,
} from '../repositories/serviceChangeLogRepository'
