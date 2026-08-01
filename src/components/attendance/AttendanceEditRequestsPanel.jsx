import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAttendanceStatusLabel } from '../../constants/attendanceTypes'
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

function currentStatusLabel(item) {
  const status = item.oldStatus || ''
  if (!status) return 'Chưa chấm'
  return getAttendanceStatusLabel(status) || status
}

function proposedStatusLabel(item) {
  const status = item.proposedStatus || item.newStatus || ''
  if (!status) return '—'
  return getAttendanceStatusLabel(status) || status
}

function requestReason(item) {
  return item.proposedReason || item.newReason || item.evidenceNote || '—'
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
  const [rejectingId, setRejectingId] = useState('')
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

  const handleApprove = async (item) => {
    if (busyId || item.status !== 'pending') return
    setBusyId(item.id)
    setMessage('')
    setRejectingId('')
    setRejectReason('')
    try {
      await approveAttendanceEditRequest(item.id, {
        reviewNote: 'Duyệt yêu cầu bổ sung chấm công',
        finalStatus: item.proposedStatus || item.newStatus,
        finalReason: item.proposedReason || item.newReason || '',
        finalNote: item.proposedNote || item.newNote || '',
        finalCheckIn: item.proposedCheckIn || '',
        finalCheckOut: item.proposedCheckOut || '',
      })
      setMessage('Đã duyệt yêu cầu và cập nhật chấm công chính thức.')
      await reload()
    } catch (err) {
      setMessage(err?.message ?? 'Không duyệt được yêu cầu.')
    } finally {
      setBusyId('')
    }
  }

  const openReject = (id) => {
    if (busyId) return
    setMessage('')
    setRejectingId(id)
    setRejectReason('')
  }

  const cancelReject = () => {
    setRejectingId('')
    setRejectReason('')
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
      setRejectingId('')
      setRejectReason('')
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
                <th>Trạng thái hiện tại</th>
                <th>Đề nghị chuyển sang</th>
                <th>Lý do</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="attendance-page__empty">Không có yêu cầu phù hợp bộ lọc.</td>
                </tr>
              ) : filtered.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.date)}</td>
                  <td>{item.employeeName || item.employeeId}</td>
                  <td>{getBranchName(item.branchId) || item.branchId}</td>
                  <td>{currentStatusLabel(item)}</td>
                  <td>{proposedStatusLabel(item)}</td>
                  <td>{requestReason(item)}</td>
                  <td className="attendance-page__request-actions">
                    {item.status === 'pending' ? (
                      rejectingId === item.id ? (
                        <div className="attendance-page__reject-inline">
                          <input
                            type="text"
                            placeholder="Lý do từ chối *"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            disabled={Boolean(busyId)}
                            aria-label="Lý do từ chối"
                          />
                          <button
                            type="button"
                            className="attendance-page__edit attendance-page__edit--danger"
                            disabled={Boolean(busyId)}
                            onClick={() => handleReject(item.id)}
                          >
                            Xác nhận từ chối
                          </button>
                          <button
                            type="button"
                            className="attendance-page__edit"
                            disabled={Boolean(busyId)}
                            onClick={cancelReject}
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className="attendance-page__request-inline-actions">
                          <button
                            type="button"
                            className="attendance-page__edit"
                            disabled={Boolean(busyId)}
                            onClick={() => handleApprove(item)}
                          >
                            Duyệt
                          </button>
                          <button
                            type="button"
                            className="attendance-page__edit attendance-page__edit--danger"
                            disabled={Boolean(busyId)}
                            onClick={() => openReject(item.id)}
                          >
                            Từ chối
                          </button>
                        </div>
                      )
                    ) : (
                      <span>{item.statusLabel || item.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
