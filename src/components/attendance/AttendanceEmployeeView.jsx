import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAttendanceStatusLabel, getAttendancePermitLabel } from '../../constants/attendanceTypes'
import { getCurrentUserEmployeeId } from '../../constants/auth'
import { formatCurrency } from '../../utils/invoice'
import { getTodayDate } from '../../utils/invoiceStorage'
import { useAttendanceData } from '../../hooks/useAttendanceData'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import { buildAttendanceStats } from '../../utils/attendancePenalties'
import { getAttendanceHolidayDates } from '../../utils/attendanceHolidayDates'
import { getBranchName } from '../../utils/branchStorage'
import { getPayrollBranchDisplayTitle } from '../../constants/branchPayrollDisplay'
import { getEmployeeById } from '../../utils/employeeStorage'
import { hasCheckedInToday } from '../../utils/attendanceService'
import {
  ATTENDANCE_EDIT_REQUEST_STATUS,
  loadOwnAttendanceEditRequests,
  loadOwnUnseenAttendanceReviews,
  markAttendanceEditRequestNotified,
} from '../../utils/attendanceEditRequestService'
import AttendanceCheckInForm from './AttendanceCheckInForm'
import AttendanceEditRequestModal from './AttendanceEditRequestModal'
import AttendanceMonthMatrix from './AttendanceMonthMatrix'
import AttendancePeriodReviewPanel from './AttendancePeriodReviewPanel'
import { buildAttendanceMonthMatrix } from '../../utils/attendanceViewHelpers'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
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
  if (status === ATTENDANCE_EDIT_REQUEST_STATUS.PENDING) return 'Chờ duyệt'
  if (status === ATTENDANCE_EDIT_REQUEST_STATUS.APPROVED) return 'Đã duyệt'
  if (status === ATTENDANCE_EDIT_REQUEST_STATUS.REJECTED) return 'Từ chối'
  if (status === ATTENDANCE_EDIT_REQUEST_STATUS.CANCELLED) return 'Đã hủy'
  return status || '—'
}

export default function AttendanceEmployeeView({ onNavigate } = {}) {
  const employee = getEmployeeById(getCurrentUserEmployeeId())
  const syncVersion = useDataSyncVersion()
  const [screen, setScreen] = useState('period')
  const todayDate = getTodayDate()
  const [checkedInToday, setCheckedInToday] = useState(null)
  const [justSaved, setJustSaved] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [createDate, setCreateDate] = useState('')
  const [toast, setToast] = useState('')
  const [ownRequests, setOwnRequests] = useState([])
  const [reviewNotices, setReviewNotices] = useState([])

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 4000)
  }

  const handleContinueWorking = () => {
    onNavigate?.('invoices')
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
  const stats = useMemo(
    () => buildAttendanceStats(records, { holidays: getAttendanceHolidayDates() }),
    [records],
  )
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

  const refreshMeta = useCallback(async () => {
    if (!employee?.id) return
    try {
      const [checked, requests, unseen] = await Promise.all([
        hasCheckedInToday(employee.id).catch(() => false),
        loadOwnAttendanceEditRequests().catch(() => []),
        loadOwnUnseenAttendanceReviews().catch(() => []),
      ])
      setCheckedInToday(Boolean(checked))
      setOwnRequests(requests)
      setReviewNotices(unseen)
    } catch {
      setCheckedInToday(false)
    }
  }, [employee?.id])

  useEffect(() => {
    refreshMeta()
  }, [refreshMeta, syncVersion])

  const dismissReviewNotices = async () => {
    const ids = reviewNotices.map((item) => item.id)
    setReviewNotices([])
    try {
      await markAttendanceEditRequestNotified(ids)
    } catch {
      /* ignore */
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

  const openCreate = (date) => {
    if (pendingByDate[date]) {
      showToast('Ngày này đang có yêu cầu chờ duyệt.')
      return
    }
    setEditTarget(null)
    setCreateDate(date)
  }

  return (
    <div className="attendance-page erp-page">
      <header className="attendance-page__self-head">
        <div>
          <h1>Chấm công của tôi</h1>
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
              {(item.rejectReason || item.reviewNote) ? ` — ${item.rejectReason || item.reviewNote}` : ''}
            </p>
          ))}
          <button type="button" className="attendance-page__edit" onClick={dismissReviewNotices}>
            Đã hiểu
          </button>
        </div>
      )}

      {ownRequests.length > 0 && (
        <section className="attendance-page__requests" style={{ marginBottom: '1rem' }}>
          <header className="attendance-page__requests-head">
            <h2>Lịch sử yêu cầu bổ sung</h2>
          </header>
          <div className="attendance-page__table-wrap">
            <table className="attendance-page__table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Trạng thái</th>
                  <th>Giờ vào/ra</th>
                  <th>Lý do / phản hồi</th>
                </tr>
              </thead>
              <tbody>
                {ownRequests.slice(0, 20).map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.date)}</td>
                    <td>{requestStatusLabel(item.status)}</td>
                    <td>{(item.proposedCheckIn || '—')} → {(item.proposedCheckOut || '—')}</td>
                    <td>
                      {item.status === 'rejected'
                        ? (item.rejectReason || item.reviewNote || '—')
                        : (item.proposedReason || item.newReason || item.reviewNote || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {toast && <div className="attendance-page__toast">{toast}</div>}

      {/* Module điểm danh cũ: AttendanceCheckInForm — không viết UI mới */}
      {checkedInToday === false && !justSaved && (
        <section className="attendance-page__checkin-block">
          <AttendanceCheckInForm
            onSuccess={async () => {
              setCheckedInToday(true)
              setJustSaved(true)
              reload()
              await refreshMeta()
            }}
          />
        </section>
      )}

      {(justSaved || checkedInToday === true) && (
        <section className="attendance-page__continue-block" role="status">
          <p className="attendance-page__continue-message">
            {justSaved ? 'Chấm công thành công.' : '✅ Hôm nay bạn đã điểm danh.'}
          </p>
          <button
            type="button"
            className="attendance-page__continue-btn"
            onClick={handleContinueWorking}
          >
            Tiếp tục làm việc
          </button>
        </section>
      )}

      <nav className="attendance-page__tabs">
        <button type="button" className={screen === 'period' ? 'is-active' : ''} onClick={() => setScreen('period')}>
          Theo kỳ lương
        </button>
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

      {screen === 'period' ? (
        <AttendancePeriodReviewPanel
          lockedEmployeeId={employee.id}
          defaultBranchId={employee.branchId || ''}
          showToast={showToast}
        />
      ) : (
        <>
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
                <th>Chi nhánh</th>
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
                  <td colSpan={9} className="attendance-page__empty">
                    Chưa có dữ liệu chấm công trong khoảng đã chọn.
                    {screen !== 'today' && (
                      <>
                        {' '}
                        <button type="button" className="attendance-page__edit" onClick={() => openCreate(todayDate)}>
                          Yêu cầu bổ sung hôm nay
                        </button>
                      </>
                    )}
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
                    <td>{getPayrollBranchDisplayTitle(record.branchId, getBranchName(record.branchId))}</td>
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

      {screen === 'week' && !loading && (
        <p className="attendance-page__hint">
          Quên chấm công một ngày?
          {' '}
          <button type="button" className="attendance-page__edit" onClick={() => openCreate(todayDate)}>
            Gửi yêu cầu bổ sung
          </button>
        </p>
      )}
        </>
      )}

      {(editTarget || createDate) && (
        <AttendanceEditRequestModal
          record={editTarget}
          date={createDate}
          showToast={showToast}
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
