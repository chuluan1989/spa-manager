import './TodayAttendanceRemindBanner.css'

/**
 * Banner mềm: hôm nay chưa chấm công.
 * Không popup, không khóa, không redirect bắt buộc.
 */
export default function TodayAttendanceRemindBanner({ onCheckInNow, onDismiss }) {
  return (
    <div className="today-attendance-remind" role="status">
      <div className="today-attendance-remind__body">
        <p className="today-attendance-remind__title">📌 Hôm nay bạn chưa chấm công.</p>
      </div>
      <div className="today-attendance-remind__actions">
        <button
          type="button"
          className="today-attendance-remind__btn today-attendance-remind__btn--primary"
          onClick={onCheckInNow}
        >
          Chấm công ngay
        </button>
        <button type="button" className="today-attendance-remind__btn" onClick={onDismiss}>
          Để sau
        </button>
      </div>
    </div>
  )
}

const DISMISS_KEY = 'spa-manager-today-attendance-dismissed'

export function isTodayAttendanceRemindDismissed(employeeId, date) {
  if (!employeeId || !date) return false
  try {
    return sessionStorage.getItem(`${DISMISS_KEY}:${employeeId}:${date}`) === '1'
  } catch {
    return false
  }
}

export function dismissTodayAttendanceRemind(employeeId, date) {
  if (!employeeId || !date) return
  try {
    sessionStorage.setItem(`${DISMISS_KEY}:${employeeId}:${date}`, '1')
  } catch {
    /* ignore */
  }
}
