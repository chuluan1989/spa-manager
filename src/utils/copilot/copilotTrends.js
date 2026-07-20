/** Date/trend helpers for Copilot — mirrors Report explorer (no AI). */

export function parseDate(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function shiftDate(dateStr, deltaDays) {
  const date = parseDate(dateStr)
  date.setDate(date.getDate() + deltaDays)
  return formatDate(date)
}

/** Equal-length previous period (same as useReportExplorerData.getPreviousPeriod). */
export function getPreviousPeriod(fromDate, toDate) {
  if (!fromDate || !toDate) return { fromDate: '', toDate: '' }
  const from = parseDate(fromDate)
  const to = parseDate(toDate)
  const days = Math.max(1, Math.round((to - from) / 86400000) + 1)
  const prevTo = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - days + 1)
  return { fromDate: formatDate(prevFrom), toDate: formatDate(prevTo) }
}

export function computeTrend(current, previous) {
  const cur = Number(current ?? 0)
  const prev = Number(previous ?? 0)
  if (prev === 0 && cur === 0) return { direction: 'flat', percent: 0 }
  if (prev === 0) return { direction: 'up', percent: 100 }
  const change = ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(change) < 0.5) return { direction: 'flat', percent: 0 }
  return {
    direction: change > 0 ? 'up' : 'down',
    percent: Math.abs(Math.round(change)),
  }
}

export function filterInvoicesByDate(invoices, fromDate, toDate) {
  return (invoices ?? []).filter((inv) => {
    const d = inv?.date ?? ''
    if (fromDate && d < fromDate) return false
    if (toDate && d > toDate) return false
    return true
  })
}

/** Local HH:mm as "HH:MM" 24h. */
export function getLocalTimeHm(now = new Date()) {
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export function parseInvoiceHour(invoiceTime) {
  const raw = String(invoiceTime ?? '').trim()
  const match = raw.match(/^(\d{1,2})/)
  if (!match) return null
  const hour = Number(match[1])
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null
  return hour
}
