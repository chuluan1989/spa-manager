import { useEffect, useMemo, useState } from 'react'
import { ATTENDANCE_STATUS, getAttendanceStatusLabel, getAttendancePermitLabel } from '../../constants/attendanceTypes'
import { getCurrentUserEmployeeId } from '../../constants/auth'
import { formatCurrency } from '../../utils/invoice'
import { getTodayDate } from '../../utils/invoiceStorage'
import { useAttendanceData } from '../../hooks/useAttendanceData'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import { buildAttendanceStats } from '../../utils/attendancePenalties'
import { getBranchName } from '../../utils/branchStorage'
import { getEmployeeById } from '../../utils/employeeStorage'
import {
  getServerAttendanceDate,
  hasCheckedInToday,
  submitEmployeeAttendance,
} from '../../utils/attendanceService'
import {
  getAttendanceClockTimes,
  saveAttendanceCheckInTime,
  saveAttendanceCheckOutTime,
} from '../../utils/attendanceClockStorage'
import {
  ATTENDANCE_EDIT_REQUEST_STATUS,
  loadOwnAttendanceEditRequests,
  loadOwnUnseenAttendanceReviews,
  markAttendanceEditRequestNotified,
} from '../../utils/attendanceEditRequestService'
import { notifyDataSynced } from '../../utils/dataSyncEvents'
import AttendanceCheckInForm from './AttendanceCheckInForm'
import AttendanceEditRequestModal from './AttendanceEditRequestModal'
import AttendanceMonthMatrix from './AttendanceMonthMatrix'
import { buildAttendanceMonthMatrix } from '../../utils/attendanceViewHelpers'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

function formatTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('vi-VN')
}

function addDays(isoDate, delta) {
  const date = new Date(`${isoDate}T12:00:00`)
  date.setDate(date.getDate() + delta)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getWeekRange(today) {
  const date = new Date(`${today}T12:00:00`)
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const fromDate = addDays(today, mondayOffset)
  const toDate = addDays(fromDate, 6)
  return { fromDate, toDate }
}

function getMonthRange(today) {
  const month = today.slice(0, 7)
  const [yearStr, monthStr] = month.split('-')
  const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate()
  return {
    fromDate: `${month}-01`,
    toDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

function requestStatusLabel(status) {
  if (status === ATTENDANCE_EDIT_REQUEST_STATUS.PENDING) return 'Chờ Quản lý duyệt'
  if (status === ATTENDANCE_EDIT_REQUEST_STATUS.APPROVED) return '✓ Đã duyệt'
  if (status === ATTENDANCE_EDIT_REQUEST_STATUS.REJECTED) return '✗ Không được duyệt'
  return status || '—'
}

export default function AttendanceEmployeeView({ onNavigate } = {}) {
  const employee = getEmployeeById(getCurrentUserEmployeeId())
  const syncVersion = useDataSyncVersion()
  const [screen, setScreen] = useState('today')
  const [todayDate, setTodayDate] = useState(() => getTodayDate())
  const [todayRecord, setTodayRecord] = useState(null)
  const [clock, setClock] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [successPanel, setSuccessPanel] = useState(false)
  const [showOtherStatus, setShowOtherStatus] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [createDate, setCreateDate] = useState('')
  const [toast, setToast] = useState('')
  const [ownRequests, setOwnRequests] = useState([])
  const [reviewNotices, setReviewNotices] = useState([])

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 4000)
  }

  const range = useMemo(() => {
    if (screen === 'week') return getWeekRange(todayDate)
    if (screen === 'month') return getMonthRange(todayDate)
    return { fromDate: todayDate, toDate: todayDate }
  }, [screen, todayDate])

  const filters = useMemo(() => ({
    fromDate: range.fromDate,
    toDate: range.toDate,
    employeeId: employee?.id ?? '',
  }), [range, employee?.id])

  const { records, loading, error, reload } = useAttendanceData(filters)
  const stats = useMemo(() => buildAttendanceStats(records), [records])
  const month = todayDate.slice(0, 7)
  const matrix = useMemo(
    () => buildAttendanceMonthMatrix(employee ? [employee] : [], records, month),
    [employee, records, month],
  )

  const pendingByDate = useMemo(() => {
    const map = {}
    for (const item of ownRequests) {
      if (item.status === ATTENDANCE_EDIT_REQUEST_STATUS.PENDING) {
        map[item.date] = item
      }
    }
    return map
  }, [ownRequests])

  const checkInAt = clock?.checkInAt || todayRecord?.submittedAt || todayRecord?.createdAt || ''
  const checkOutAt = clock?.checkOutAt || ''
  const hasCheckedIn = Boolean(todayRecord)
  const hasCheckedOut = Boolean(checkOutAt)

  const refreshMeta = async () => {
    if (!employee?.id) return
    try {
      const server = await getServerAttendanceDate().catch(() => ({ date: getTodayDate() }))
      const date = server?.date || getTodayDate()
      setTodayDate(date)
      const [checked, requests, unseen, clockTimes] = await Promise.all([
        hasCheckedInToday(employee.id).catch(() => false),
        loadOwnAttendanceEditRequests().catch(() => []),
        loadOwnUnseenAttendanceReviews().catch(() => []),
        getAttendanceClockTimes(employee.id, date).catch(() => null),
      ])
      setOwnRequests(requests)
      setReviewNotices(unseen)
      setClock(clockTimes)
      if (!checked) setTodayRecord(null)
      return { date, checked }
    } catch {
      return null
    }
  }

  useEffect(() => {
    refreshMeta()
  }, [employee?.id, syncVersion])

  useEffect(() => {
    const row = records.find((item) => item.date === todayDate) || null
    setTodayRecord(row)
  }, [records, todayDate])

  const dismissReviewNotices = async () => {
    const ids = reviewNotices.map((item) => item.id)
    setReviewNotices([])
    try {
      await markAttendanceEditRequestNotified(ids)
    } catch {
      /* ignore */
    }
  }

  const handleContinueWorking = () => {
    setSuccessPanel(false)
    onNavigate?.('invoices')
  }

  const handleCheckIn = async () => {
    if (!employee?.id || busy) return
    setBusy(true)
    setActionError('')
    try {
      const saved = await submitEmployeeAttendance({
        employeeId: employee.id,
        status: ATTENDANCE_STATUS.ON_TIME,
        reason: '',
      })
      const server = await getServerAttendanceDate().catch(() => ({ date: todayDate, timestamp: new Date().toISOString() }))
      const clockSaved = await saveAttendanceCheckInTime(
        employee.id,
        server.date || todayDate,
        server.timestamp || saved?.submittedAt || new Date().toISOString(),
      )
      setClock(clockSaved)
      setTodayRecord(saved)
      setSuccessPanel(true)
      setShowOtherStatus(false)
      notifyDataSynced(['attendance', 'settings'])
      reload()
      await refreshMeta()
    } catch (err) {
      const message = err?.message ?? 'Không thể chấm công vào.'
      if (/đã điểm danh/i.test(message)) {
        setSuccessPanel(true)
        await refreshMeta()
        reload()
      } else {
        setActionError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleCheckOut = async () => {
    if (!employee?.id || busy) return
    setBusy(true)
    setActionError('')
    try {
      const clockSaved = await saveAttendanceCheckOutTime(employee.id, todayDate)
      setClock(clockSaved)
      setSuccessPanel(true)
      notifyDataSynced(['settings'])
      showToast('Chấm công thành công.')
    } catch (err) {
      setActionError(err?.message ?? 'Không thể chấm công ra.')
    } finally {
      setBusy(false)
    }
  }

  if (!employee) {
    return <p className="attendance-page__empty">Không tìm thấy hồ sơ nhân viên.</p>
  }

  const openEdit = (record) => {
    if (pendingByDate[record.date]) {
      showToast('Ngày này đang có yêu cầu chờ duyệt.')
      return
    }
    setCreateDate('')
    setEditTarget(record)
  }

  return (
    <div className="attendance-page erp-page">
      <header className="attendance-page__self-head">
        <div>
          <h1>Chấm công</h1>
          <p>{employee.name} · {getBranchName(employee.branchId)}</p>
        </div>
        <span className="attendance-page__today-badge">Hôm nay: {formatDate(todayDate)}</span>
      </header>

      {reviewNotices.length > 0 && (
        <div className="attendance-page__review-notices" role="status">
          {reviewNotices.map((item) => (
            <p key={item.id}>
              {item.status === ATTENDANCE_EDIT_REQUEST_STATUS.APPROVED
                ? `✓ Đã duyệt yêu cầu ngày ${formatDate(item.date)}`
                : `✗ Không được duyệt yêu cầu ngày ${formatDate(item.date)}`}
              {item.reviewNote ? ` — ${item.reviewNote}` : ''}
            </p>
          ))}
          <button type="button" className="attendance-page__edit" onClick={dismissReviewNotices}>
            Đã hiểu
          </button>
        </div>
      )}

      {toast && <div className="attendance-page__toast">{toast}</div>}

      <section className="attendance-page__today-hero" aria-live="polite">
        {successPanel ? (
          <div className="attendance-page__success-panel">
            <p className="attendance-page__success-title">Chấm công thành công.</p>
            <button
              type="button"
              className="attendance-page__continue-btn"
              onClick={handleContinueWorking}
            >
              ➡ Tiếp tục làm việc
            </button>
          </div>
        ) : (
          <>
            <div className="attendance-page__today-summary">
              <p className="attendance-page__today-status">
                {hasCheckedIn
                  ? '✅ Hôm nay bạn đã chấm công.'
                  : 'Hôm nay bạn chưa chấm công.'}
              </p>
              <dl className="attendance-page__clock-grid">
                <div>
                  <dt>Giờ vào</dt>
                  <dd>{formatTime(checkInAt)}</dd>
                </div>
                <div>
                  <dt>Giờ ra</dt>
                  <dd>{formatTime(checkOutAt)}</dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{todayRecord ? getAttendanceStatusLabel(todayRecord.status) : 'Chưa chấm'}</dd>
                </div>
              </dl>
            </div>

            {actionError && <p className="attendance-page__error" role="alert">{actionError}</p>}

            {!hasCheckedIn && !showOtherStatus && (
              <div className="attendance-page__today-actions">
                <button
                  type="button"
                  className="attendance-page__big-checkin"
                  onClick={handleCheckIn}
                  disabled={busy}
                >
                  {busy ? 'Đang chấm...' : '✅ Chấm công vào'}
                </button>
                <button
                  type="button"
                  className="attendance-page__edit"
                  onClick={() => setShowOtherStatus(true)}
                  disabled={busy}
                >
                  Chấm công với trạng thái khác
                </button>
              </div>
            )}

            {!hasCheckedIn && showOtherStatus && (
              <AttendanceCheckInForm
                onSuccess={async () => {
                  setSuccessPanel(true)
                  setShowOtherStatus(false)
                  const server = await getServerAttendanceDate().catch(() => ({ date: todayDate, timestamp: new Date().toISOString() }))
                  await saveAttendanceCheckInTime(employee.id, server.date || todayDate, server.timestamp || new Date().toISOString())
                  reload()
                  await refreshMeta()
                }}
              />
            )}

            {hasCheckedIn && !hasCheckedOut && (
              <div className="attendance-page__today-actions">
                <button
                  type="button"
                  className="attendance-page__big-checkin"
                  onClick={handleCheckOut}
                  disabled={busy}
                >
                  {busy ? 'Đang chấm...' : '✅ Chấm công ra'}
                </button>
                <button
                  type="button"
                  className="attendance-page__continue-btn attendance-page__continue-btn--secondary"
                  onClick={handleContinueWorking}
                >
                  ➡ Tiếp tục làm việc
                </button>
                {todayRecord && (
                  <button
                    type="button"
                    className="attendance-page__edit"
                    onClick={() => openEdit(todayRecord)}
                    disabled={Boolean(pendingByDate[todayDate])}
                  >
                    Sửa
                  </button>
                )}
              </div>
            )}

            {hasCheckedIn && hasCheckedOut && (
              <div className="attendance-page__today-actions">
                <button
                  type="button"
                  className="attendance-page__continue-btn"
                  onClick={handleContinueWorking}
                >
                  ➡ Tiếp tục làm việc
                </button>
                {todayRecord && (
                  <button
                    type="button"
                    className="attendance-page__edit"
                    onClick={() => openEdit(todayRecord)}
                    disabled={Boolean(pendingByDate[todayDate])}
                  >
                    Sửa
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <nav className="attendance-page__tabs">
        <button type="button" className={screen === 'today' ? 'is-active' : ''} onClick={() => setScreen('today')}>
          Hôm nay
        </button>
        <button type="button" className={screen === 'week' ? 'is-active' : ''} onClick={() => setScreen('week')}>
          Tuần này
        </button>
        <button type="button" className={screen === 'month' ? 'is-active' : ''} onClick={() => setScreen('month')}>
          Tháng này
        </button>
      </nav>

      <section className="attendance-page__stats">
        <article><span>Tổng</span><strong>{stats.total}</strong></article>
        <article><span>Đúng giờ</span><strong>{stats.onTime}</strong></article>
        <article><span>Đi trễ</span><strong>{stats.late}</strong></article>
        <article className="is-penalty"><span>Tổng phạt</span><strong>{formatCurrency(stats.totalPenalty)}</strong></article>
      </section>

      {error && <p className="attendance-page__error">{error}</p>}
      {loading && <p className="attendance-page__loading">Đang tải...</p>}

      {!loading && screen === 'month' && (
        <AttendanceMonthMatrix days={matrix.days} rows={matrix.rows} />
      )}

      {!loading && (
        <div className="attendance-page__table-wrap">
          <table className="attendance-page__table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Trạng thái</th>
                <th>Có phép</th>
                <th>Ghi chú</th>
                <th>Người xác nhận</th>
                <th>Yêu cầu sửa</th>
                <th>Cập nhật</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="attendance-page__empty">
                    Chưa có dữ liệu chấm công trong khoảng đã chọn.
                  </td>
                </tr>
              ) : records.map((record) => {
                const pending = pendingByDate[record.date]
                const related = ownRequests.find((item) => (
                  item.date === record.date
                  && item.status !== ATTENDANCE_EDIT_REQUEST_STATUS.PENDING
                ))
                return (
                  <tr key={record.id}>
                    <td>{formatDate(record.date)}</td>
                    <td>{getAttendanceStatusLabel(record.status)}</td>
                    <td>{getAttendancePermitLabel(record.status)}</td>
                    <td>{record.note || record.reason || '—'}</td>
                    <td>
                      {related?.reviewedByName
                        || (record.submittedBy === employee.id ? 'Tự chấm' : (record.submittedBy || '—'))}
                    </td>
                    <td>{pending ? requestStatusLabel(pending.status) : (related ? requestStatusLabel(related.status) : '—')}</td>
                    <td>{formatDateTime(record.updatedAt || record.submittedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="attendance-page__edit"
                        onClick={() => openEdit(record)}
                        disabled={Boolean(pending)}
                      >
                        Sửa
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(editTarget || createDate) && (
        <AttendanceEditRequestModal
          record={editTarget}
          date={createDate}
          showToast={(message) => showToast(
            /đã gửi yêu cầu/i.test(message)
              ? 'Đã gửi yêu cầu chỉnh sửa tới Quản lý.'
              : message,
          )}
          onClose={() => {
            setEditTarget(null)
            setCreateDate('')
          }}
          onSubmitted={async () => {
            await refreshMeta()
            reload()
          }}
        />
      )}
    </div>
  )
}
