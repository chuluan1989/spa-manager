import { useEffect, useMemo, useState } from 'react'
import { canSelectBranch, getCurrentUserBranch, isAdmin, isEmployee } from '../../constants/auth'
import { getActiveBranches } from '../../constants/branches'
import { getTodayDate } from '../../utils/invoiceStorage'
import { useAttendanceData } from '../../hooks/useAttendanceData'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import {
  collectEmployeeIdsWithRecordBranchActivity,
  employeeCurrentlyAtBranch,
} from '../../utils/employeeBranchTimeline'
import { isEmployeeLoginEligible, loadEmployees } from '../../utils/employeeStorage'
import {
  CLOSE_CYCLE_OPTIONS,
  CLOSE_CYCLES,
  formatCloseCycleRangeLabel,
  getCloseCycleRange,
} from '../../utils/payrollCycleClose/payCycleCalendar'
import {
  ATTENDANCE_DAY_RESULT,
  buildEmployeeAttendancePeriodDays,
  formatCloseBlockAttendanceMessage,
  resolveAttendanceReviewRange,
} from '../../utils/payrollCycleClose/attendancePeriodReview'
import { loadCorrectionRequestsForEmployeeRange } from '../../utils/attendanceEditRequestService'
import AttendanceEditRequestModal from './AttendanceEditRequestModal'
import './AttendancePeriodReviewPanel.css'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

const RANGE_MODES = [
  { id: 'cycle', label: 'Theo kỳ lương' },
  { id: 'month', label: 'Theo tháng' },
  { id: 'day', label: 'Một ngày' },
  { id: 'range', label: 'Khoảng ngày' },
]

/**
 * Danh sách Ngày + Kết quả chấm công theo kỳ.
 * Batch 4: nút yêu cầu bổ sung + trạng thái chờ duyệt.
 */
export default function AttendancePeriodReviewPanel({
  lockedEmployeeId = '',
  defaultBranchId = '',
  showToast,
}) {
  const syncVersion = useDataSyncVersion()
  const employeeLocked = Boolean(lockedEmployeeId)
  const employeeMode = employeeLocked || isEmployee()
  const [rangeMode, setRangeMode] = useState('cycle')
  const [billingMonth, setBillingMonth] = useState(() => getTodayDate().slice(0, 7))
  const [cycle, setCycle] = useState(CLOSE_CYCLES.PERIOD_2)
  const [singleDate, setSingleDate] = useState(() => getTodayDate())
  const [fromDate, setFromDate] = useState(() => `${getTodayDate().slice(0, 7)}-01`)
  const [toDate, setToDate] = useState(() => getTodayDate())
  const [branchId, setBranchId] = useState(
    () => defaultBranchId || (canSelectBranch() ? '' : getCurrentUserBranch()),
  )
  const [employeeId, setEmployeeId] = useState(lockedEmployeeId || '')
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [correctionRequests, setCorrectionRequests] = useState([])
  const [requestDate, setRequestDate] = useState('')
  const [existingRequest, setExistingRequest] = useState(null)

  const resolved = useMemo(
    () => resolveAttendanceReviewRange({
      mode: rangeMode,
      billingMonth,
      cycle,
      singleDate,
      fromDate,
      toDate,
      month: billingMonth,
    }),
    [rangeMode, billingMonth, cycle, singleDate, fromDate, toDate],
  )

  const fetchBranchId = canSelectBranch()
    ? branchId
    : (getCurrentUserBranch() || '')

  const filters = useMemo(() => ({
    fromDate: resolved.fromDate,
    toDate: resolved.toDate,
    branchId: employeeLocked ? '' : fetchBranchId,
    employeeId: employeeLocked ? lockedEmployeeId : employeeId,
  }), [resolved.fromDate, resolved.toDate, fetchBranchId, employeeId, employeeLocked, lockedEmployeeId])

  const { records, loading, error, reload } = useAttendanceData(filters)

  const employees = useMemo(() => {
    void syncVersion
    if (employeeLocked) {
      const self = loadEmployees().find((e) => e.id === lockedEmployeeId)
      return self ? [self] : []
    }
    const eligible = loadEmployees().filter((employee) => isEmployeeLoginEligible(employee))
    const scoped = !fetchBranchId
      ? eligible
      : eligible.filter((employee) => (
        employeeCurrentlyAtBranch(employee, fetchBranchId)
        || collectEmployeeIdsWithRecordBranchActivity(fetchBranchId, records).has(employee.id)
      ))
    const q = employeeQuery.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((employee) => String(employee.name || '').toLowerCase().includes(q))
  }, [employeeLocked, lockedEmployeeId, fetchBranchId, records, employeeQuery, syncVersion])

  const selectedEmployeeId = employeeLocked ? lockedEmployeeId : employeeId
  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId)
    || loadEmployees().find((e) => e.id === selectedEmployeeId)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!selectedEmployeeId || !resolved.fromDate || !resolved.toDate) {
        setCorrectionRequests([])
        return
      }
      try {
        const rows = await loadCorrectionRequestsForEmployeeRange(
          selectedEmployeeId,
          resolved.fromDate,
          resolved.toDate,
        )
        if (!cancelled) setCorrectionRequests(rows)
      } catch {
        if (!cancelled) setCorrectionRequests([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedEmployeeId, resolved.fromDate, resolved.toDate, syncVersion])

  const todayDate = getTodayDate()
  const review = useMemo(() => {
    if (!selectedEmployeeId || !resolved.fromDate || !resolved.toDate) {
      return { days: [], summary: null }
    }
    return buildEmployeeAttendancePeriodDays({
      employeeId: selectedEmployeeId,
      records,
      fromDate: resolved.fromDate,
      toDate: resolved.toDate,
      todayDate,
      correctionRequests,
    })
  }, [selectedEmployeeId, records, resolved.fromDate, resolved.toDate, todayDate, correctionRequests])

  const cycleHint = rangeMode === 'cycle'
    ? formatCloseCycleRangeLabel(billingMonth, cycle)
    : `${formatDate(resolved.fromDate)} → ${formatDate(resolved.toDate)}`

  const blockMessage = review.summary ? formatCloseBlockAttendanceMessage(review.summary) : ''

  const openRequest = (day) => {
    if (!employeeMode) return
    setRequestDate(day.date)
    setExistingRequest(day.correctionRequest || null)
  }

  return (
    <div className="att-period-review">
      <section className="att-period-review__filters">
        <div className="att-period-review__mode-tabs" role="tablist" aria-label="Kiểu lọc">
          {RANGE_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              className={rangeMode === mode.id ? 'is-active' : ''}
              aria-selected={rangeMode === mode.id}
              onClick={() => setRangeMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <label>
          <span>Tháng {rangeMode === 'cycle' ? '(tháng kỳ lương)' : ''}</span>
          <input
            type="month"
            value={billingMonth}
            onChange={(e) => setBillingMonth(e.target.value)}
          />
        </label>

        {rangeMode === 'cycle' && (
          <label>
            <span>Kỳ lương</span>
            <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
              {CLOSE_CYCLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} — {option.hint}
                </option>
              ))}
            </select>
          </label>
        )}

        {rangeMode === 'day' && (
          <label>
            <span>Ngày</span>
            <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} />
          </label>
        )}

        {rangeMode === 'range' && (
          <>
            <label>
              <span>Từ ngày</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label>
              <span>Đến ngày</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </>
        )}

        {canSelectBranch() && !employeeLocked && (
          <label>
            <span>Chi nhánh</span>
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setEmployeeId('') }}>
              <option value="">Tất cả</option>
              {getActiveBranches().map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}

        {!employeeLocked && (
          <>
            <label className="att-period-review__search">
              <span>Tìm nhân viên</span>
              <input
                type="search"
                value={employeeQuery}
                placeholder="Nhập tên…"
                onChange={(e) => setEmployeeQuery(e.target.value)}
              />
            </label>
            <label>
              <span>Nhân viên</span>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">— Chọn nhân viên —</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </section>

      <p className="att-period-review__range-hint">{cycleHint}</p>
      {rangeMode === 'cycle' && (
        <p className="att-period-review__submit-hint">
          Ngày gửi chốt dự kiến:
          {' '}
          <strong>{formatDate(getCloseCycleRange(billingMonth, cycle).submitDate)}</strong>
        </p>
      )}

      {error && <p className="att-period-review__error" role="alert">{error}</p>}
      {loading && <p className="att-period-review__muted">Đang tải chấm công…</p>}

      {!selectedEmployeeId && !loading && (
        <p className="att-period-review__muted">Chọn một nhân viên để xem danh sách ngày và kết quả chấm công.</p>
      )}

      {selectedEmployeeId && !loading && review.summary && (
        <>
          <header className="att-period-review__header">
            <div>
              <h3>{selectedEmployee?.name || 'Nhân viên'}</h3>
              <p className="att-period-review__muted">
                {formatDate(resolved.fromDate)}
                {' → '}
                {formatDate(resolved.toDate)}
              </p>
            </div>
            <div className="att-period-review__kpis">
              <article>
                <span>Ngày trong kỳ</span>
                <strong>{review.summary.totalDays}</strong>
              </article>
              <article>
                <span>Đã xử lý</span>
                <strong>{review.summary.completedDays}</strong>
              </article>
              <article className={review.summary.missingDays > 0 ? 'is-warn' : ''}>
                <span>Chưa chấm</span>
                <strong>{review.summary.missingDays}</strong>
              </article>
              {review.summary.pendingCorrectionDays > 0 && (
                <article className="is-warn">
                  <span>Chờ duyệt</span>
                  <strong>{review.summary.pendingCorrectionDays}</strong>
                </article>
              )}
              {review.summary.futureDays > 0 && (
                <article>
                  <span>Chưa đến ngày</span>
                  <strong>{review.summary.futureDays}</strong>
                </article>
              )}
            </div>
          </header>

          {blockMessage && (
            <p className="att-period-review__warn" role="status">{blockMessage}</p>
          )}
          {!blockMessage && review.summary.requiredDays > 0 && (
            <p className="att-period-review__ok" role="status">
              Đã có kết quả chấm công cho mọi ngày đến hôm nay trong kỳ.
            </p>
          )}

          <div className="att-period-review__table-wrap">
            <table className="att-period-review__table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Kết quả chấm công</th>
                  {employeeMode && <th />}
                </tr>
              </thead>
              <tbody>
                {review.days.map((day) => (
                  <tr
                    key={day.date}
                    className={
                      day.result === ATTENDANCE_DAY_RESULT.MISSING
                        ? 'is-missing'
                        : day.result === ATTENDANCE_DAY_RESULT.PENDING_CORRECTION
                          ? 'is-missing'
                          : day.result === ATTENDANCE_DAY_RESULT.FUTURE
                            ? 'is-future'
                            : ''
                    }
                  >
                    <td>{formatDate(day.date)}</td>
                    <td>
                      {day.resultLabel}
                      {day.isPendingCorrection && day.correctionRequest?.rejectReason
                        ? ` · ${day.correctionRequest.rejectReason}`
                        : ''}
                    </td>
                    {employeeMode && (
                      <td>
                        {day.canRequestCorrection && (
                          <button
                            type="button"
                            className="attendance-page__edit"
                            onClick={() => openRequest(day)}
                          >
                            Yêu cầu chấm công bổ sung
                          </button>
                        )}
                        {day.isPendingCorrection && (
                          <button
                            type="button"
                            className="attendance-page__edit"
                            onClick={() => openRequest(day)}
                          >
                            Xem / sửa yêu cầu
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {review.days.length === 0 && (
                  <tr>
                    <td colSpan={employeeMode ? 3 : 2} className="att-period-review__muted">
                      Không có ngày trong khoảng đã chọn.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {isAdmin() && review.summary.missingDates.length > 0 && (
            <details className="att-period-review__missing-list">
              <summary>Danh sách ngày chưa chấm ({review.summary.missingDates.length})</summary>
              <ul>
                {review.summary.missingDates.map((date) => (
                  <li key={date}>{formatDate(date)}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {requestDate && (
        <AttendanceEditRequestModal
          date={requestDate}
          existingRequest={existingRequest}
          showToast={showToast}
          onClose={() => {
            setRequestDate('')
            setExistingRequest(null)
          }}
          onSubmitted={async () => {
            reload?.()
            if (selectedEmployeeId && resolved.fromDate && resolved.toDate) {
              const rows = await loadCorrectionRequestsForEmployeeRange(
                selectedEmployeeId,
                resolved.fromDate,
                resolved.toDate,
              )
              setCorrectionRequests(rows)
            }
          }}
        />
      )}
    </div>
  )
}
