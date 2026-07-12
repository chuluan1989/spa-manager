/** Thời gian theo Asia/Ho_Chi_Minh (ICT). */

const ICT = 'Asia/Ho_Chi_Minh'

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** @returns {{ date: string, hour: number, minute: number, second: number, isoLike: string }} */
export function getIctParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ICT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]))
  const year = map.year
  const month = map.month
  const day = map.day
  const hour = Number(map.hour === '24' ? '0' : map.hour)
  const minute = Number(map.minute)
  const second = Number(map.second)
  return {
    date: `${year}-${month}-${day}`,
    hour,
    minute,
    second,
    isoLike: `${year}-${month}-${day}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}+07:00`,
  }
}

export function getIctTodayDate(now = new Date()) {
  return getIctParts(now).date
}

/** true khi đã qua 23:59:59 của lockDate theo ICT (tức từ 00:00 ngày kế tiếp). */
export function isAfterIctEndOfDay(lockDate, now = new Date()) {
  if (!lockDate) return false
  const ict = getIctParts(now)
  if (ict.date > lockDate) return true
  if (ict.date < lockDate) return false
  // Cùng ngày lockDate: chỉ khóa sau 23:59:59 → thực tế từ giây 00 của ngày sau.
  // "Sau 23:59" = từ 00:00:00 ngày tiếp theo. Trong cùng ngày lockDate vẫn chưa khóa.
  return false
}

export function listDatesInclusive(fromDate, toDate) {
  if (!fromDate || !toDate || fromDate > toDate) return []
  const out = []
  const [fy, fm, fd] = fromDate.split('-').map(Number)
  const cursor = new Date(Date.UTC(fy, fm - 1, fd))
  const [ty, tm, td] = toDate.split('-').map(Number)
  const end = new Date(Date.UTC(ty, tm - 1, td))
  while (cursor <= end) {
    const y = cursor.getUTCFullYear()
    const m = pad2(cursor.getUTCMonth() + 1)
    const d = pad2(cursor.getUTCDate())
    out.push(`${y}-${m}-${d}`)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

export function formatVnDate(isoDate) {
  if (!isoDate) return '—'
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${d}/${m}/${y}`
}
