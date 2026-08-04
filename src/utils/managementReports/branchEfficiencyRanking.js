/**
 * Xếp hạng + KPI màu — Báo cáo Hiệu quả chi nhánh (B4).
 */

export const BRANCH_EFFICIENCY_SORT_OPTIONS = Object.freeze([
  { value: 'profit', label: 'Lợi nhuận', defaultDir: 'desc' },
  { value: 'revenue', label: 'Doanh thu', defaultDir: 'desc' },
  { value: 'marginPercent', label: 'Biên lợi nhuận', defaultDir: 'desc' },
  { value: 'invoiceCommission', label: '% hóa đơn', defaultDir: 'desc' },
  { value: 'operatingCost', label: 'Chi phí vận hành', defaultDir: 'desc' },
])

export const DEFAULT_BRANCH_EFFICIENCY_SORT = 'profit'

/**
 * Biên LN: >=30 xanh, 20–30 vàng, <20 đỏ.
 * @returns {'good'|'warn'|'bad'}
 */
export function resolveMarginTone(marginPercent) {
  const n = Number(marginPercent)
  if (!Number.isFinite(n)) return 'bad'
  if (n >= 30) return 'good'
  if (n >= 20) return 'warn'
  return 'bad'
}

/**
 * LN âm → đỏ đậm.
 * @returns {'loss-strong'|'neutral'}
 */
export function resolveProfitTone(profit) {
  const n = Number(profit)
  if (Number.isFinite(n) && n < 0) return 'loss-strong'
  return 'neutral'
}

/**
 * Sắp xếp CN theo metric; unknown luôn cuối.
 * @returns {Array} rows kèm rank (1..n cho known; unknown = null hoặc '—')
 */
export function rankBranchEfficiencyRows(rows = [], sortKey = DEFAULT_BRANCH_EFFICIENCY_SORT, sortDir = 'desc') {
  const key = BRANCH_EFFICIENCY_SORT_OPTIONS.some((o) => o.value === sortKey)
    ? sortKey
    : DEFAULT_BRANCH_EFFICIENCY_SORT
  const dir = sortDir === 'asc' ? 1 : -1

  const known = []
  const unknown = []
  for (const row of rows) {
    if (row?.isUnknown) unknown.push(row)
    else known.push(row)
  }

  known.sort((a, b) => {
    const av = Number(a?.[key] ?? 0)
    const bv = Number(b?.[key] ?? 0)
    if (av !== bv) return (av - bv) * dir
    return String(a?.branchName || '').localeCompare(String(b?.branchName || ''), 'vi')
  })

  const ranked = known.map((row, index) => ({
    ...row,
    rank: index + 1,
  }))
  const unknownRanked = unknown.map((row) => ({
    ...row,
    rank: null,
  }))

  return [...ranked, ...unknownRanked]
}
