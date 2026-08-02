import './MissingAttendanceRemindBanner.css'
import {
  dismissMissingAttendanceRemind,
  isMissingAttendanceRemindDismissed,
} from '../../utils/missingAttendanceRemindDismiss'
import { useEffect, useState } from 'react'
import { getCurrentUserEmployeeId, isEmployee } from '../../constants/auth'
import { getTodayDate } from '../../utils/invoiceStorage'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import { loadCorrectionRequestsForEmployeeRange } from '../../utils/attendanceEditRequestService'
import { fetchAttendanceFiltered } from '../../repositories/attendanceRepository'
import { fetchPayrollCycleClose } from '../../repositories/payrollCycleCloseRepository'
import {
  buildEmployeeAttendancePeriodDays,
  formatMissingDaysMessage,
  isAttendanceOptionalForCloseCycle,
} from '../../utils/payrollCycleClose/attendancePeriodReview'
import { listDuePayrollCloseTargets } from '../../utils/payrollCycleClose/closeRemind'
import { canSubmitCloseCycle } from '../../utils/payrollCycleClose/closeCycleStatus'
import { getEmployeeById } from '../../utils/employeeStorage'

/**
 * Banner nhắc NV thiếu chấm công — chỉ trong kỳ đang đến hạn chốt (chưa gửi).
 * Không lookback các tháng/kỳ cũ không liên quan.
 */
export default function MissingAttendanceRemindBanner({
  onGoAttendance,
  onDismiss,
}) {
  const syncVersion = useDataSyncVersion()
  const employeeId = getCurrentUserEmployeeId()
  const today = getTodayDate()
  const [missingDates, setMissingDates] = useState([])
  const [rangeLabel, setRangeLabel] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isEmployee() || !employeeId) {
        setMissingDates([])
        setRangeLabel('')
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const employee = getEmployeeById(employeeId)
        const dueTargets = listDuePayrollCloseTargets(today)
        let activeTarget = null
        for (const target of dueTargets) {
          if (isAttendanceOptionalForCloseCycle(target.billingMonth, target.cycle)) continue
          const existing = await fetchPayrollCycleClose({
            employeeId,
            billingMonth: target.billingMonth,
            cycle: target.cycle,
          }).catch(() => null)
          if (!canSubmitCloseCycle(existing?.status ?? null)) continue
          activeTarget = target
          break
        }

        if (!activeTarget) {
          if (!cancelled) {
            setMissingDates([])
            setRangeLabel('')
          }
          return
        }

        const toDate = activeTarget.toDate > today ? today : activeTarget.toDate
        const fromDate = activeTarget.fromDate
        if (!fromDate || !toDate || fromDate > toDate) {
          if (!cancelled) setMissingDates([])
          return
        }

        const [records, corrections] = await Promise.all([
          fetchAttendanceFiltered({
            fromDate,
            toDate,
            employeeId,
          }),
          loadCorrectionRequestsForEmployeeRange(employeeId, fromDate, toDate),
        ])
        const { summary } = buildEmployeeAttendancePeriodDays({
          employeeId,
          records: records ?? [],
          fromDate,
          toDate,
          todayDate: today,
          correctionRequests: corrections,
          employmentStartDate: employee?.startDate || '',
          employmentEndDate: employee?.endDate || employee?.daysOff || '',
        })
        if (!cancelled) {
          setMissingDates(summary.missingDates)
          setRangeLabel(activeTarget.rangeLabel || '')
        }
      } catch {
        if (!cancelled) {
          setMissingDates([])
          setRangeLabel('')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [employeeId, today, syncVersion])

  if (!isEmployee() || loading || missingDates.length === 0) return null
  if (isMissingAttendanceRemindDismissed(employeeId, today)) return null

  const message = formatMissingDaysMessage({ missingDates, missingDays: missingDates.length })

  return (
    <div className="missing-att-remind" role="status">
      <div className="missing-att-remind__body">
        <strong>Nhắc chấm công kỳ cần chốt</strong>
        {rangeLabel ? <p className="missing-att-remind__range">{rangeLabel}</p> : null}
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
