import './MissingAttendanceRemindBanner.css'
import {
  dismissMissingAttendanceRemind,
  isMissingAttendanceRemindDismissed,
} from '../../utils/missingAttendanceRemindDismiss'
import { useEffect, useMemo, useState } from 'react'
import { getCurrentUserEmployeeId, isEmployee } from '../../constants/auth'
import { getTodayDate } from '../../utils/invoiceStorage'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import { loadCorrectionRequestsForEmployeeRange } from '../../utils/attendanceEditRequestService'
import { fetchAttendanceFiltered } from '../../repositories/attendanceRepository'
import {
  buildEmployeeAttendancePeriodDays,
  formatMissingDaysMessage,
} from '../../utils/payrollCycleClose/attendancePeriodReview'
import { shiftMonthValue } from '../../utils/payrollCycleClose/payCycleCalendar'

/**
 * Banner nhắc NV các ngày trước đó còn chưa chấm (không tính hôm nay / tương lai / đã gửi YC).
 */
export default function MissingAttendanceRemindBanner({
  onGoAttendance,
  onDismiss,
}) {
  const syncVersion = useDataSyncVersion()
  const employeeId = getCurrentUserEmployeeId()
  const today = getTodayDate()
  const [missingDates, setMissingDates] = useState([])
  const [loading, setLoading] = useState(true)

  const lookbackFrom = useMemo(() => {
    const prevMonth = shiftMonthValue(today.slice(0, 7), -1)
    return `${prevMonth}-16`
  }, [today])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isEmployee() || !employeeId) {
        setMissingDates([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const [records, corrections] = await Promise.all([
          fetchAttendanceFiltered({
            fromDate: lookbackFrom,
            toDate: today,
            employeeId,
          }),
          loadCorrectionRequestsForEmployeeRange(employeeId, lookbackFrom, today),
        ])
        const { summary } = buildEmployeeAttendancePeriodDays({
          employeeId,
          records: records ?? [],
          fromDate: lookbackFrom,
          toDate: today,
          todayDate: today,
          correctionRequests: corrections,
        })
        if (!cancelled) setMissingDates(summary.missingDates)
      } catch {
        if (!cancelled) setMissingDates([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [employeeId, lookbackFrom, today, syncVersion])

  if (!isEmployee() || loading || missingDates.length === 0) return null
  if (isMissingAttendanceRemindDismissed(employeeId, today)) return null

  const message = formatMissingDaysMessage({ missingDates, missingDays: missingDates.length })

  return (
    <div className="missing-att-remind" role="status">
      <div className="missing-att-remind__body">
        <strong>Nhắc chấm công</strong>
        <p>{message}</p>
      </div>
      <div className="missing-att-remind__actions">
        {onGoAttendance && (
          <button type="button" className="missing-att-remind__go" onClick={onGoAttendance}>
            Vào Chấm công
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
