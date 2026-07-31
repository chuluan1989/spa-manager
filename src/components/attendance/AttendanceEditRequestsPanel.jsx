import { useCallback, useEffect, useMemo, useState } from 'react'
import { ATTENDANCE_STATUS, ATTENDANCE_STATUS_OPTIONS, getAttendanceStatusLabel } from '../../constants/attendanceTypes'
import { canSelectBranch, getCurrentUserBranch, isAdmin } from '../../constants/auth'
import { getActiveBranches } from '../../constants/branches'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import {
  approveAttendanceEditRequest,
  loadAttendanceEditRequests,
  rejectAttendanceEditRequest,
} from '../../utils/attendanceEditRequestService'
import { getBranchName } from '../../utils/branchStorage'
import { loadEmployees } from '../../utils/employeeStorage'

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

const STATUS_FILTERS = [
  { id: 'pending', label: 'Chờ duyệt' },
  { id: 'approved', label: 'Đã duyệt' },
  { id: 'rejected', label: 'Từ chối' },
  { id: 'cancelled', label: 'Đã hủy' },
  { id: '', label: 'Tất cả' },
]

export default function AttendanceEditRequestsPanel() {
  const syncVersion = useDataSyncVersion()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [branchFilter, setBranchFilter] = useState(() => (
    canSelectBranch() ? '' : getCurrentUserBranch()
  ))
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [activeId, setActiveId] = useState('')
  const [finalStatus, setFinalStatus] = useState('')
  const [finalCheckIn, setFinalCheckIn] = useState('')
  const [finalCheckOut, setFinalCheckOut] = useState('')
  const [finalReason, setFinalReason] = useState('')
  const [finalNote, setFinalNote] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await loadAttendanceEditRequests()
      setRequests(rows)
    } catch (err) {
      setError(err?.message ?? 'Không tải được yêu cầu chỉnh sửa.')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [syncVersion, reload])

  const scopedBranch = isAdmin() ? branchFilter : (getCurrentUserBranch() || '')

  const filtered = useMemo(() => {
    return requests
      .filter((item) => !statusFilter || item.status === statusFilter)
      .filter((item) => !scopedBranch || item.branchId === scopedBranch)
      .filter((item) => !employeeFilter || item.employeeId === employeeFilter)
      .filter((item) => !fromDate || item.date >= fromDate)
      .filter((item) => !toDate || item.date <= toDate)
  }, [requests, statusFilter, scopedBranch, employeeFilter, fromDate, toDate])

  const employees = useMemo(() => {
    void syncVersion
    const ids = new Set(filtered.map((r) => r.employeeId).concat(
      requests.filter((r) => !scopedBranch || r.branchId === scopedBranch).map((r) => r.employeeId),
    ))
    return loadEmployees().filter((e) => ids.has(e.id))
  }, [filtered, requests, scopedBranch, syncVersion])

  const active = filtered.find((item) => item.id === activeId) || null

  useEffect(() => {
    if (!activeId) return
    const item = requests.find((row) => row.id === activeId)
    if (!item) return
    setFinalStatus(item.proposedStatus || item.newStatus || ATTENDANCE_STATUS.ON_TIME)
    setFinalCheckIn(item.proposedCheckIn || '08:00')
    setFinalCheckOut(item.proposedCheckOut || '17:00')
    setFinalReason(item.proposedReason || item.newReason || '')
    setFinalNote(item.proposedNote || item.newNote || '')
    setRejectReason('')
  }, [activeId, requests])

  const handleApprove = async (id) => {
    if (busyId) return
    setBusyId(id)
    setMessage('')
    try {
      await approveAttendanceEditRequest(id, {
        reviewNote: finalNote || 'Duyệt yêu cầu bổ sung chấm công',
        finalStatus,
        finalReason,
        finalNote,
        finalCheckIn,
        finalCheckOut,
      })
      setMessage('Đã duyệt yêu cầu và cập nhật chấm công chính thức.')
      setActiveId('')
      await reload()
    } catch (err) {
      setMessage(err?.message ?? 'Không duyệt được yêu cầu.')
    } finally {
      setBusyId('')
    }
  }

  const handleReject = async (id) => {
    if (busyId) return
    if (!rejectReason.trim()) {
      setMessage('Vui lòng nhập lý do từ chối.')
      return
    }
    setBusyId(id)
    setMessage('')
    try {
      await rejectAttendanceEditRequest(id, { reviewNote: rejectReason.trim() })
      setMessage('Đã từ chối yêu cầu.')
      setActiveId('')
      await reload()
    } catch (err) {
      setMessage(err?.message ?? 'Không từ chối được yêu cầu.')
    } finally {
      setBusyId('')
    }
  }

  const pendingCount = requests.filter((r) => (
    r.status === 'pending' && (!scopedBranch || r.branchId === scopedBranch)
  )).length

  return (
    <section className="attendance-page__requests">
      <header className="attendance-page__requests-head">
        <h2>Yêu cầu chấm công bổ sung</h2>
        <span className="attendance-page__today-badge">{pendingCount} chờ duyệt</span>
      </header>

      <div className="att-period-review__filters" style={{ marginBottom: '1rem' }}>
        {canSelectBranch() && (
          <label>
            <span>Chi nhánh</span>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">Tất cả</option>
              {getActiveBranches().map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Nhân viên</span>
          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="">Tất cả</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Từ ngày</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label>
          <span>Đến ngày</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <label>
          <span>Trạng thái</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTERS.map((item) => (
              <option key={item.id || 'all'} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="attendance-page__loading">Đang tải yêu cầu...</p>}
      {error && <p className="attendance-page__error" role="alert">{error}</p>}
      {message && <p className="attendance-page__loading">{message}</p>}

      {!loading && (
        <div className="attendance-page__table-wrap">
          <table className="attendance-page__table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Nhân viên</th>
                <th>Chi nhánh</th>
                <th>Giờ vào/ra đề nghị</th>
                <th>Trạng thái đề nghị</th>
                <th>Trạng thái YC</th>
                <th>Gửi lúc</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="attendance-page__empty">Không có yêu cầu phù hợp bộ lọc.</td>
                </tr>
              ) : filtered.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.date)}</td>
                  <td>{item.employeeName || item.employeeId}</td>
                  <td>{getBranchName(item.branchId) || item.branchId}</td>
                  <td>
                    {(item.proposedCheckIn || '—')}
                    {' → '}
                    {(item.proposedCheckOut || '—')}
                  </td>
                  <td>
                    {getAttendanceStatusLabel(item.proposedStatus || item.newStatus)}
                    {(item.proposedReason || item.newReason) ? ` · ${item.proposedReason || item.newReason}` : ''}
                  </td>
                  <td>{item.statusLabel || item.status}</td>
                  <td>{formatDateTime(item.requestedAt)}</td>
                  <td className="attendance-page__request-actions">
                    {item.status === 'pending' && (
                      <button
                        type="button"
                        className="attendance-page__edit"
                        disabled={Boolean(busyId)}
                        onClick={() => setActiveId(item.id === activeId ? '' : item.id)}
                      >
                        {item.id === activeId ? 'Đóng' : 'Xử lý'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && active.status === 'pending' && (
        <div className="att-period-review__warn" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>
            Duyệt yêu cầu — {active.employeeName} · {formatDate(active.date)}
          </h3>
          <p>
            Lý do NV:
            {' '}
            {active.proposedReason || active.newReason || '—'}
          </p>
          {active.evidenceNote && (
            <p>Bằng chứng: {active.evidenceNote}</p>
          )}
          <div className="att-period-review__filters">
            <label>
              <span>Trạng thái công (có thể sửa)</span>
              <select value={finalStatus} onChange={(e) => setFinalStatus(e.target.value)}>
                {ATTENDANCE_STATUS_OPTIONS.filter((o) => (
                  o.id !== ATTENDANCE_STATUS.CANCELLED && o.id !== ATTENDANCE_STATUS.INVALID
                )).map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Giờ vào</span>
              <input type="time" value={finalCheckIn} onChange={(e) => setFinalCheckIn(e.target.value)} />
            </label>
            <label>
              <span>Giờ ra</span>
              <input type="time" value={finalCheckOut} onChange={(e) => setFinalCheckOut(e.target.value)} />
            </label>
            <label>
              <span>Lý do / ghi chú duyệt</span>
              <input value={finalReason} onChange={(e) => setFinalReason(e.target.value)} />
            </label>
            <label>
              <span>Ghi chú thêm</span>
              <input value={finalNote} onChange={(e) => setFinalNote(e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <button
              type="button"
              className="attendance-page__edit"
              disabled={Boolean(busyId)}
              onClick={() => handleApprove(active.id)}
            >
              ✓ Duyệt
            </button>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <label>
              <span>Lý do từ chối *</span>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                style={{ width: '100%' }}
              />
            </label>
            <button
              type="button"
              className="attendance-page__edit attendance-page__edit--danger"
              disabled={Boolean(busyId)}
              onClick={() => handleReject(active.id)}
              style={{ marginTop: '0.5rem' }}
            >
              ✗ Từ chối
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
