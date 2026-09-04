import { loadSystemSettings } from './systemSettingsStorage'
import { normalizeHolidayDates } from './attendanceSpecialDays'

export function getAttendanceHolidayDates() {
  return normalizeHolidayDates(loadSystemSettings()?.autoAbsentHolidays)
}
