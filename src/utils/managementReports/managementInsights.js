/**
 * Rule-based revenue insights + top movers + KPI color tones.
 * No AI — only compares already-computed period metrics/trends.
 */

/** |%| ≥ strong → đậm; |%| < mild → vàng (ổn định / nhẹ). */
export const KPI_TONE_THRESHOLDS = {
  mild: 5,
  strong: 15,
}

/**
 * Chuẩn hóa màu KPI theo hướng + ngưỡng %.
 * @returns {'green'|'yellow'|'red'|'neutral'}
 */
export function resolveKpiTone(trend) {
  if (!trend) return 'neutral'
  const { direction, percent } = trend
  if (direction === 'new') return 'green'
  if (direction === 'none') return 'neutral'
  if (direction === 'flat') return 'yellow'
  const p = Number(percent ?? 0)
  if (direction === 'up') {
    return p >= KPI_TONE_THRESHOLDS.mild ? 'green' : 'yellow'
  }
  if (direction === 'down') {
    return p >= KPI_TONE_THRESHOLDS.mild ? 'red' : 'yellow'
  }
  return 'neutral'
}

/**
 * Giải thích rule-based vì sao doanh thu tăng/giảm (dựa trên trend đã có).
 */
export function buildRevenueInsights(row) {
  if (!row?.revenueTrend) return []

  const rev = row.revenueTrend
  if (rev.direction === 'none') {
    return [{ id: 'no-data', text: 'Không đủ dữ liệu kỳ trước để giải thích.', tone: 'neutral' }]
  }
  if (rev.direction === 'flat') {
    return [{ id: 'stable', text: 'Doanh thu gần như không đổi so với kỳ trước.', tone: 'yellow' }]
  }

  const rising = rev.direction === 'up' || rev.direction === 'new'
  const items = []

  const pushFactor = (id, trend, upLabel, downLabel) => {
    if (!trend) return
    if (trend.direction === 'up' || trend.direction === 'new') {
      items.push({
        id,
        text: `${upLabel}${trend.label && trend.label !== 'Mới phát sinh' ? ` (${trend.label})` : trend.direction === 'new' ? ' (mới phát sinh)' : ''}`,
        tone: 'green',
        alignsWithRevenue: rising,
      })
    } else if (trend.direction === 'down') {
      items.push({
        id,
        text: `${downLabel} (${trend.label})`,
        tone: 'red',
        alignsWithRevenue: !rising,
      })
    }
  }

  pushFactor('customers', row.customerTrend, 'Khách tăng', 'Khách giảm')
  pushFactor('ticket', row.averageTicketTrend, 'Invoice TB tăng', 'Invoice TB giảm')
  pushFactor('tips', row.tipsTrend, 'Tips tăng', 'Tips giảm')
  pushFactor('requested', row.requestedRateTrend, 'Tỷ lệ khách yêu cầu tăng', 'Tỷ lệ khách yêu cầu giảm')

  if (items.length === 0) {
    items.push({
      id: 'revenue-only',
      text: rising
        ? `Doanh thu ${rev.label || 'tăng'} — chưa thấy biến động rõ ở khách / invoice TB / tips / tỷ lệ YC.`
        : `Doanh thu ${rev.label || 'giảm'} — chưa thấy biến động rõ ở khách / invoice TB / tips / tỷ lệ YC.`,
      tone: resolveKpiTone(rev),
    })
    return items
  }

  // Ưu tiên yếu tố cùng chiều với doanh thu
  items.sort((a, b) => Number(b.alignsWithRevenue) - Number(a.alignsWithRevenue))

  const headline = rising
    ? `Doanh thu ${rev.direction === 'new' ? 'mới phát sinh' : `tăng ${rev.label}`}. Gợi ý nguyên nhân:`
    : `Doanh thu giảm ${rev.label}. Gợi ý nguyên nhân:`

  return [{ id: 'headline', text: headline, tone: resolveKpiTone(rev), isHeadline: true }, ...items]
}

function trendScore(trend, preferUp) {
  if (!trend) return -1
  if (preferUp) {
    if (trend.direction === 'new') return 10_000
    if (trend.direction === 'up') return trend.percent ?? 0
    return -1
  }
  if (trend.direction === 'down') return trend.percent ?? 0
  return -1
}

/**
 * TOP tăng / TOP giảm theo doanh thu hoặc tỷ lệ khách yêu cầu.
 */
export function buildTopMovers(rows, { metric = 'revenue', limit = 5 } = {}) {
  const trendKey = metric === 'requestedRate' ? 'requestedRateTrend' : 'revenueTrend'
  const list = Array.isArray(rows) ? rows : []

  const gainers = [...list]
    .filter((row) => {
      const t = row[trendKey]
      return t && (t.direction === 'up' || t.direction === 'new')
    })
    .sort((a, b) => trendScore(b[trendKey], true) - trendScore(a[trendKey], true))
    .slice(0, limit)

  const losers = [...list]
    .filter((row) => row[trendKey]?.direction === 'down')
    .sort((a, b) => trendScore(b[trendKey], false) - trendScore(a[trendKey], false))
    .slice(0, limit)

  return { gainers, losers, metric, trendKey }
}
