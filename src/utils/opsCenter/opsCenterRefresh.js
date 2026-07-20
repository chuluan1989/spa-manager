export const OPS_CENTER_AUTO_REFRESH_MS = 60_000

export function formatOpsLastUpdated(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
