/** Ngày T7/CN theo lịch ICT (ISO YYYY-MM-DD, không phụ thuộc timezone máy). */
export function isWeekendIsoDate(isoDate) {
  const iso = String(isoDate || '').slice(0, 10)
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return false
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return weekday === 0 || weekday === 6
}

export function normalizeHolidayDates(holidays = []) {
  if (holidays instanceof Set) {
    return [...holidays].map((d) => String(d).slice(0, 10)).filter(Boolean)
  }
  if (!Array.isArray(holidays)) return []
  return holidays.map((d) => String(d).slice(0, 10)).filter(Boolean)
}

/**
 * Ngày đặc biệt = Thứ 7 / Chủ nhật / ngày lễ trong settings.
 * Không tự suy ngày lễ VN — chỉ dùng danh sách truyền vào.
 */
export function isAttendanceSpecialDay(isoDate, holidays = []) {
  const iso = String(isoDate || '').slice(0, 10)
  if (!iso) return false
  if (isWeekendIsoDate(iso)) return true
  const list = normalizeHolidayDates(holidays)
  return list.includes(iso)
}
