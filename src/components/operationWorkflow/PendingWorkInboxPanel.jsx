import { useCallback, useEffect, useState } from 'react'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import {
  loadPendingWorkInbox,
  PENDING_WORK_TYPES,
} from '../../utils/payrollCycleClose/pendingWorkInbox'
import {
  requestAppNavigate,
  setAttendanceScreenPrefill,
  setPayrollCloseReviewPrefill,
} from '../../utils/navigationPrefill'
import './OperationWorkflow.css'

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('vi-VN')
}

/**
 * Tab Cần xử lý — bảng chốt chờ duyệt + yêu cầu sửa chấm công (Phase 1).
 */
export function PendingWorkInboxPanel() {
  const syncVersion = useDataSyncVersion()
  const [items, setItems] = useState([])
  const [counts, setCounts] = useState({
    payrollClose: 0,
    attendanceCorrection: 0,
    total: 0,
    newToday: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await loadPendingWorkInbox()
      setItems(next.items)
      setCounts(next.counts)
    } catch (err) {
      setError(err?.message ?? 'Không tải được danh sách việc cần xử lý.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload, syncVersion])

  const handleOpen = (item) => {
    if (item.type === PENDING_WORK_TYPES.PAYROLL_CLOSE) {
      setPayrollCloseReviewPrefill(item.deepLink.payrollCloseReview)
      requestAppNavigate('salary')
      return
    }
    if (item.type === PENDING_WORK_TYPES.ATTENDANCE_CORRECTION) {
      setAttendanceScreenPrefill('requests')
      requestAppNavigate('attendance')
    }
  }

  return (
    <section className="ow-pending" aria-label="Cần xử lý">
      <header className="ow-pending__head">
        <div>
          <h3>Cần xử lý</h3>
          <p className="ow-muted">
            Bảng chốt lương và yêu cầu sửa chấm công đang chờ — không cần tìm từng màn hình.
          </p>
        </div>
        <button type="button" className="ow-btn" onClick={reload} disabled={loading}>
          {loading ? 'Đang tải…' : 'Làm mới'}
        </button>
      </header>

      <div className="ow-pending__counts" aria-label="Bộ đếm việc chưa xử lý">
        <article>
          <span>Tổng chưa xử lý</span>
          <strong>{counts.total}</strong>
        </article>
        <article>
          <span>Bảng lương chờ duyệt</span>
          <strong>{counts.payrollClose}</strong>
        </article>
        <article>
          <span>Sửa chấm công</span>
          <strong>{counts.attendanceCorrection}</strong>
        </article>
        <article>
          <span>Mới hôm nay</span>
          <strong>{counts.newToday}</strong>
        </article>
      </div>

      {error ? <p className="ow-muted" style={{ color: '#b91c1c' }}>{error}</p> : null}
      {loading && <p className="ow-muted">Đang tải danh sách…</p>}

      {!loading && items.length === 0 ? (
        <p className="ow-muted">Không có việc chờ xử lý.</p>
      ) : null}

      <ul className="ow-pending__list">
        {items.map((item) => (
          <li key={item.id} className={item.isNewToday ? 'is-new' : ''}>
            <div className="ow-pending__meta">
              <span className="ow-pending__type">{item.typeLabel}</span>
              <span className="ow-pending__status">{item.statusLabel}</span>
            </div>
            <strong>{item.employeeName}</strong>
            <p className="ow-muted">
              {item.branchName || item.branchId || '—'}
              {' · '}
              {formatDateTime(item.submittedAt)}
            </p>
            <p>{item.summary}</p>
            <button type="button" className="ow-btn ow-btn--primary" onClick={() => handleOpen(item)}>
              {item.actionLabel || 'Xem và xử lý'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
