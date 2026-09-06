import './MissingAttendanceRemindBanner.css'
import {
  dismissMissingAttendanceRemind,
  isMissingAttendanceRemindDismissed,
} from '../../utils/missingAttendanceRemindDismiss'
import { useEffect, useState } from 'react'
import { getCurrentUserEmployeeId, isEmployee } from '../../constants/auth'
import { ATTENDANCE_BACKEND_ERROR_MESSAGE } from '../../constants/attendanceUi'
import { getIctTodayDate } from '../../utils/ictTime'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import {
  formatDailyMissingAttendanceMessage,
  loadInProgressMissingAttendanceDates,
} from '../../utils/missingAttendanceRemind'

/**
 * Banner nhắc ngày đã qua chưa chấm — chỉ trong KỲ LƯƠNG ĐANG DIỄN RA.
 * Hôm nay dùng TodayAttendanceRemindBanner riêng.
 * Chốt kỳ dùng PayrollCloseRemindBanner riêng.
 */
export default function MissingAttendanceRemindBanner({
  todayDate: todayDateProp,
  onGoAttendance,
  onDismiss,
}) {
  const syncVersion = useDataSyncVersion()
  const employeeId = getCurrentUserEmployeeId()
  const today = todayDateProp || getIctTodayDate()
  const [missingDates, setMissingDates] = useState([])
  const [systemError, setSystemError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isEmployee() || !employeeId) {
        setMissingDates([])
        setSystemError('')
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const result = await loadInProgressMissingAttendanceDates({
          employeeId,
          todayDate: today,
        })
        if (cancelled) return
        if (result.skippedReason === 'backend_error') {
          setMissingDates([])
          setSystemError(result.error || ATTENDANCE_BACKEND_ERROR_MESSAGE)
          return
        }
        setSystemError('')
        setMissingDates(result.missingDates ?? [])
      } catch {
        if (!cancelled) {
          setMissingDates([])
          setSystemError(ATTENDANCE_BACKEND_ERROR_MESSAGE)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [employeeId, today, syncVersion])

  if (!isEmployee() || loading) return null
  if (isMissingAttendanceRemindDismissed(employeeId, today)) return null

  if (systemError) {
    return (
      <div className="missing-att-remind" role="alert">
        <div className="missing-att-remind__body">
          <strong>Lỗi hệ thống</strong>
          <p>{systemError}</p>
        </div>
        <div className="missing-att-remind__actions">
          <button
            type="button"
            className="missing-att-remind__dismiss"
            onClick={() => onDismiss?.()}
          >
            Đóng
          </button>
        </div>
      </div>
    )
  }

  if (missingDates.length === 0) return null

  const message = formatDailyMissingAttendanceMessage(missingDates)

  return (
    <div className="missing-att-remind" role="status">
      <div className="missing-att-remind__body">
        <strong>Thiếu chấm công</strong>
        <p>{message}</p>
      </div>
      <div className="missing-att-remind__actions">
        {onGoAttendance && (
          <button type="button" className="missing-att-remind__go" onClick={onGoAttendance}>
            Đi đến Chấm công
          </button>
        )}
        <button
          type="button"
          className="missing-att-remind__dismiss"
          onClick={() => {
            dismissMissingAttendanceRemind(employeeId, today)
            onDismiss?.()
          }}
        >
          Đóng
        </button>
      </div>
    </div>
  )
}
