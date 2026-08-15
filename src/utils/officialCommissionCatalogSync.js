import { parseOptionalCommissionPercent } from './commissionPercent'
import {
  COMMISSION_CATALOG_SYNC_REASON,
  GIA_LAI_BLOCKED_BRANCH_IDS,
  resolveOfficialCatalogCommissionPercent,
} from './officialCommissionRules'

export { COMMISSION_CATALOG_SYNC_REASON }

export function planOfficialCommissionCatalogSync({
  prices = [],
  nameByKey = {},
} = {}) {
  const rows = []
  const giaLai = []

  for (const row of prices) {
    const branchId = row.branchId ?? row.branch_id
    const durationId = row.durationId ?? row.duration_id
    const name = nameByKey[`${branchId}:${durationId}`] || durationId
    const current = parseOptionalCommissionPercent(row.commissionPercent ?? row.commission_percent)
    const resolved = resolveOfficialCatalogCommissionPercent(branchId, durationId, name)

    if (resolved.blocked) {
      giaLai.push({
        branchId,
        durationId,
        name,
        currentPercent: current,
        plannedPercent: null,
        status: 'BLOCKED',
        reason: resolved.reason,
      })
      continue
    }

    if (resolved.missing) {
      rows.push({
        branchId,
        durationId,
        name,
        currentPercent: current,
        plannedPercent: null,
        status: 'AMBIGUOUS',
        reason: 'Không có rule chuẩn cho chi nhánh/dịch vụ này',
      })
      continue
    }

    const planned = resolved.percent
    const unchanged = current === planned
    rows.push({
      branchId,
      durationId,
      name,
      currentPercent: current,
      plannedPercent: planned,
      status: unchanged ? 'UNCHANGED' : 'CHANGE',
      reason: unchanged ? '' : COMMISSION_CATALOG_SYNC_REASON,
    })
  }

  const change = rows.filter((r) => r.status === 'CHANGE')
  const unchanged = rows.filter((r) => r.status === 'UNCHANGED')
  const ambiguous = rows.filter((r) => r.status === 'AMBIGUOUS')
  const missingCurrent = rows.filter((r) => r.currentPercent == null)

  return {
    rows,
    giaLai,
    summary: {
      changeCount: change.length,
      unchangedCount: unchanged.length,
      ambiguousCount: ambiguous.length,
      missingCurrentCount: missingCurrent.length,
      giaLaiBlockedCount: giaLai.length,
      giaLaiBranches: [...GIA_LAI_BLOCKED_BRANCH_IDS],
    },
  }
}
