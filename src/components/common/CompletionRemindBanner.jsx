import { useEffect, useState } from 'react'
import './CompletionRemindBanner.css'

/**
 * Banner nhắc Hồ sơ / Chấm công — không khóa, không popup, có thể bỏ qua.
 */
export default function CompletionRemindBanner({ status, onCompleteNow, onDismiss }) {
  if (!status || status.dataComplete) return null

  const profileOk = Boolean(status.profileComplete)
  const attendanceOk = Boolean(status.attendanceComplete)

  return (
    <div className="completion-remind" role="status">
      <div className="completion-remind__body">
        <p className="completion-remind__title">
          ⚠️ Bạn còn một số thông tin cần hoàn thành để phục vụ việc tính lương.
        </p>
        <ul className="completion-remind__list">
          <li>Hồ sơ: {profileOk ? 'Đã hoàn thành' : 'Chưa hoàn thành'}</li>
          <li>Chấm công: {attendanceOk ? 'Đã hoàn thành' : 'Chưa hoàn thành'}</li>
        </ul>
        <p className="completion-remind__hint">👉 Vui lòng hoàn thành khi có thời gian.</p>
      </div>
      <div className="completion-remind__actions">
        <button type="button" className="completion-remind__btn completion-remind__btn--primary" onClick={onCompleteNow}>
          Hoàn thành ngay
        </button>
        <button type="button" className="completion-remind__btn" onClick={onDismiss}>
          Để sau
        </button>
      </div>
    </div>
  )
}

const DISMISS_KEY = 'spa-manager-completion-remind-dismissed'

export function isCompletionRemindDismissed(employeeId) {
  if (!employeeId) return false
  try {
    return sessionStorage.getItem(`${DISMISS_KEY}:${employeeId}`) === '1'
  } catch {
    return false
  }
}

export function dismissCompletionRemind(employeeId) {
  if (!employeeId) return
  try {
    sessionStorage.setItem(`${DISMISS_KEY}:${employeeId}`, '1')
  } catch {
    /* ignore */
  }
}

export function clearCompletionRemindDismiss(employeeId) {
  if (!employeeId) return
  try {
    sessionStorage.removeItem(`${DISMISS_KEY}:${employeeId}`)
  } catch {
    /* ignore */
  }
}

/** Hook helper: theo dõi trạng thái dismiss trong phiên. */
export function useCompletionRemindDismissed(employeeId) {
  const [dismissed, setDismissed] = useState(() => isCompletionRemindDismissed(employeeId))

  useEffect(() => {
    setDismissed(isCompletionRemindDismissed(employeeId))
  }, [employeeId])

  const dismiss = () => {
    dismissCompletionRemind(employeeId)
    setDismissed(true)
  }

  return [dismissed, dismiss]
}
