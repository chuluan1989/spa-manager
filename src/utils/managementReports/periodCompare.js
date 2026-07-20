/**
 * Management Reports V1 — period compare rules (calendar MoM, not equal-length generic).
 */

export function parseIsoDate(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export function formatIsoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function daysInMonth(yearMonth) {
  const [y, m] = String(yearMonth).split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function shiftYearMonth(yearMonth, deltaMonths) {
  const [y, m] = String(yearMonth).split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1 + deltaMonths, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function countInclusiveDays(fromDate, toDate) {
  if (!fromDate || !toDate) return 0
  const from = parseIsoDate(fromDate)
  const to = parseIsoDate(toDate)
  const days = Math.round((to - from) / 86400000) + 1
  return Math.max(0, days)
}

/**
 * Compare period for management metrics.
 * - Month-aligned from day 1 + viewing open current month through today → same days previous month
 * - Month-aligned from day 1 + full closed month → full previous calendar month
 * - Otherwise → equal-length period immediately before (fallback)
 */
export function getManagementComparePeriod(fromDate, toDate, today) {
  if (!fromDate || !toDate) return { fromDate: '', toDate: '', mode: 'empty' }

  const monthKey = fromDate.slice(0, 7)
  const monthStart = `${monthKey}-01`
  const sameMonth = fromDate.slice(0, 7) === toDate.slice(0, 7)
  const fromIsMonthStart = fromDate === monthStart
  const lastDay = daysInMonth(monthKey)
  const toDay = Number(toDate.slice(8, 10))
  const isFullMonth = sameMonth && fromIsMonthStart && toDay === lastDay
  const isOpenCurrentMonth = sameMonth
    && fromIsMonthStart
    && today?.slice(0, 7) === monthKey
    && toDate <= today

  if (fromIsMonthStart && sameMonth && (isFullMonth || isOpenCurrentMonth)) {
    const prevMonth = shiftYearMonth(monthKey, -1)
    const prevLast = daysInMonth(prevMonth)
    if (isFullMonth) {
      return {
        fromDate: `${prevMonth}-01`,
        toDate: `${prevMonth}-${String(prevLast).padStart(2, '0')}`,
        mode: 'full-month',
      }
    }
    const prevDay = Math.min(toDay, prevLast)
    return {
      fromDate: `${prevMonth}-01`,
      toDate: `${prevMonth}-${String(prevDay).padStart(2, '0')}`,
      mode: 'mtd-same-days',
    }
  }

  const from = parseIsoDate(fromDate)
  const to = parseIsoDate(toDate)
  const days = Math.max(1, Math.round((to - from) / 86400000) + 1)
  const prevTo = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - days + 1)
  return {
    fromDate: formatIsoDate(prevFrom),
    toDate: formatIsoDate(prevTo),
    mode: 'equal-length',
  }
}

/**
 * @returns {{ direction: 'up'|'down'|'flat'|'new'|'none', percent: number|null, label: string }}
 */
export function computeSafeTrend(current, previous) {
  const cur = Number(current ?? 0)
  const prev = Number(previous ?? 0)
  if (prev === 0 && cur === 0) {
    return { direction: 'none', percent: null, label: 'Không có dữ liệu kỳ trước' }
  }
  if (prev === 0 && cur !== 0) {
    return { direction: 'new', percent: null, label: 'Mới phát sinh' }
  }
  const change = ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(change) < 0.5) {
    return { direction: 'flat', percent: 0, label: '0%' }
  }
  const percent = Math.abs(Math.round(change))
  if (change > 0) return { direction: 'up', percent, label: `+${percent}%` }
  return { direction: 'down', percent, label: `−${percent}%` }
}

export function safeDivide(numerator, denominator) {
  const den = Number(denominator)
  if (!Number.isFinite(den) || den === 0) return null
  const num = Number(numerator ?? 0)
  if (!Number.isFinite(num)) return null
  return num / den
}

export function safeRatePercent(numerator, denominator) {
  const ratio = safeDivide(numerator, denominator)
  if (ratio == null) return null
  return Math.round(ratio * 1000) / 10
}
