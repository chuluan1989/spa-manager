import { useEffect, useMemo, useState } from 'react'
import { getAttendanceStatusLabel } from '../../constants/attendanceTypes'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import {
  approveAttendanceEditRequest,
  loadPendingEditRequestsForCurrentManager,
  rejectAttendanceEditRequest,
} from '../../utils/attendanceEditRequestService'
import { getBranchName } from '../../utils/branchStorage'

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

export default function AttendanceEditRequestsPanel() {
  const syncVersion = useDataSyncVersion()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await loadPendingEditRequestsForCurrentManager()
      setRequests(rows)
    } catch (err) {
      setError(err?.message ?? 'Không tải được yêu cầu chỉnh sửa.')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [syncVersion])

  const pendingCount = useMemo(() => requests.length, [requests])

  const handleApprove = async (id) => {
    if (busyId) return
    setBusyId(id)
    setMessage('')
    try {
      await approveAttendanceEditRequest(id)
      setMessage('Đã duyệt yêu cầu.')
      await reload()
    } catch (err) {
      setMessage(err?.message ?? 'Không duyệt được yêu cầu.')
    } finally {
      setBusyId('')
    }
  }

  const handleReject = async (id) => {
    if (busyId) return
    setBusyId(id)
    setMessage('')
    try {
      await rejectAttendanceEditRequest(id)
      setMessage('Đã từ chối yêu cầu. Dữ liệu cũ được giữ nguyên.')
      await reload()
    } catch (err) {
      setMessage(err?.message ?? 'Không từ chối được yêu cầu.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="attendance-page__requests">
      <header className="attendance-page__requests-head">
        <h2>Yêu cầu chỉnh sửa chấm công</h2>
        <span className="attendance-page__today-badge">{pendingCount} chờ duyệt</span>
      </header>

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
                <th>Loại</th>
                <th>Giá trị cũ</th>
                <th>Giá trị mới</th>
                <th>Gửi lúc</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="attendance-page__empty">Không có yêu cầu chờ duyệt.</td>
                </tr>
              ) : requests.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.date)}</td>
                  <td>{item.employeeName || item.employeeId}</td>
                  <td>{getBranchName(item.branchId) || item.branchId}</td>
                  <td>{item.type === 'create' ? 'Bổ sung' : 'Sửa'}</td>
                  <td>
                    {item.type === 'create'
                      ? '—'
                      : `${getAttendanceStatusLabel(item.oldStatus)}${item.oldReason ? ` · ${item.oldReason}` : ''}`}
                  </td>
                  <td>
                    {getAttendanceStatusLabel(item.newStatus)}
                    {item.newReason ? ` · ${item.newReason}` : ''}
                    {item.newNote ? ` · ${item.newNote}` : ''}
                  </td>
                  <td>{formatDateTime(item.requestedAt)}</td>
                  <td className="attendance-page__request-actions">
                    <button
                      type="button"
                      className="attendance-page__edit"
                      disabled={Boolean(busyId)}
                      onClick={() => handleApprove(item.id)}
                    >
                      ✓ Đồng ý
                    </button>
                    <button
                      type="button"
                      className="attendance-page__edit attendance-page__edit--danger"
                      disabled={Boolean(busyId)}
                      onClick={() => handleReject(item.id)}
                    >
                      ✗ Từ chối
                    </button>
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
