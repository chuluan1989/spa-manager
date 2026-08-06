import { useCallback, useEffect, useState } from 'react'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import {
  loadPendingWorkInbox,
  PENDING_WORK_TYPES,
} from '../../utils/payrollCycleClose/pendingWorkInbox'
import {
  approveAttendanceEditRequest,
  rejectAttendanceEditRequest,
} from '../../utils/attendanceEditRequestService'
import {
  approveCloseCycle,
  returnCloseCycle,
} from '../../utils/payrollCycleClose/submitCloseCycle'
import {
  approveInvoiceEditRequest,
  rejectInvoiceEditRequest,
} from '../../utils/invoiceEditRequestService'
import {
  requestAppNavigate,
  setAttendanceScreenPrefill,
  setInvoiceEditScreenPrefill,
  setPayrollCloseReviewPrefill,
} from '../../utils/navigationPrefill'
import './EmployeeRequestsPanel.css'

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('vi-VN')
}

function promptReason(title) {
  const reason = window.prompt(title)
  return String(reason || '').trim()
}

/**
 * Khu vực Báo cáo → Yêu cầu nhân viên (thay tab Cần xử lý của Công việc).
 */
export default function EmployeeRequestsPanel({ focusRequestId = '' }) {
  const syncVersion = useDataSyncVersion()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState('')
  const [detailId, setDetailId] = useState(focusRequestId || '')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await loadPendingWorkInbox()
      setItems(next.items)
    } catch (err) {
      setError(err?.message ?? 'Không tải được danh sách yêu cầu.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload, syncVersion])

  const handleView = (item) => {
    setDetailId(item.id)
    if (item.type === PENDING_WORK_TYPES.PAYROLL_CLOSE) {
      setPayrollCloseReviewPrefill(item.deepLink.payrollCloseReview)
      requestAppNavigate('salary')
      return
    }
    if (item.type === PENDING_WORK_TYPES.ATTENDANCE_CORRECTION) {
      setAttendanceScreenPrefill('requests')
      requestAppNavigate('attendance')
      return
    }
    if (item.type === PENDING_WORK_TYPES.INVOICE_EDIT) {
      setInvoiceEditScreenPrefill('requests', {
        requestId: item.deepLink?.requestId || item.source?.id || '',
      })
      requestAppNavigate('invoices')
    }
  }

  const handleApprove = async (item) => {
    if (busyId) return
    setBusyId(item.id)
    setMessage('')
    try {
      if (item.type === PENDING_WORK_TYPES.ATTENDANCE_CORRECTION) {
        const src = item.source || {}
        const requestId = src.requestId || src.id || String(item.id).replace(/^acr:/, '').replace(/^wt:/, '')
        await approveAttendanceEditRequest(requestId, {
          reviewNote: 'Duyệt yêu cầu sửa chấm công',
          finalStatus: src.payload?.proposedStatus || src.proposedStatus || src.newStatus,
          finalReason: src.payload?.proposedReason || src.proposedReason || src.newReason || '',
          finalNote: src.payload?.proposedNote || src.proposedNote || src.newNote || '',
          finalCheckIn: src.payload?.proposedCheckIn || src.proposedCheckIn || '',
          finalCheckOut: src.payload?.proposedCheckOut || src.proposedCheckOut || '',
        })
      } else if (item.type === PENDING_WORK_TYPES.PAYROLL_CLOSE) {
        const review = item.deepLink?.payrollCloseReview || {}
        const src = item.source || {}
        await approveCloseCycle({
          employeeId: review.employeeId || item.employeeId || src.employeeId,
          billingMonth: review.billingMonth || src.payload?.billingMonth,
          cycle: review.cycle || src.payload?.cycle,
        })
      } else if (item.type === PENDING_WORK_TYPES.INVOICE_EDIT) {
        const id = item.deepLink?.requestId || item.source?.requestId || item.source?.id
        await approveInvoiceEditRequest(id, { reviewNote: 'Duyệt yêu cầu sửa hóa đơn' })
      } else {
        throw new Error('Loại yêu cầu chưa hỗ trợ duyệt tại đây.')
      }
      setMessage('Đã duyệt yêu cầu.')
      await reload()
    } catch (err) {
      setMessage(err?.message ?? 'Không duyệt được yêu cầu.')
    } finally {
      setBusyId('')
    }
  }

  const handleReturn = async (item) => {
    if (busyId) return
    const reason = promptReason('Nhập lý do trả lại / từ chối (bắt buộc):')
    if (!reason) {
      setMessage('Cần lý do để trả lại.')
      return
    }
    setBusyId(item.id)
    setMessage('')
    try {
      if (item.type === PENDING_WORK_TYPES.ATTENDANCE_CORRECTION) {
        const src = item.source || {}
        const id = src.requestId || src.id || String(item.id).replace(/^acr:/, '').replace(/^wt:/, '')
        await rejectAttendanceEditRequest(id, { reviewNote: reason })
      } else if (item.type === PENDING_WORK_TYPES.PAYROLL_CLOSE) {
        const review = item.deepLink?.payrollCloseReview || {}
        const src = item.source || {}
        await returnCloseCycle({
          employeeId: review.employeeId || item.employeeId || src.employeeId,
          billingMonth: review.billingMonth || src.payload?.billingMonth,
          cycle: review.cycle || src.payload?.cycle,
          returnReason: reason,
        })
      } else if (item.type === PENDING_WORK_TYPES.INVOICE_EDIT) {
        const id = item.deepLink?.requestId || item.source?.requestId || item.source?.id
        await rejectInvoiceEditRequest(id, { rejectReason: reason })
      } else {
        throw new Error('Loại yêu cầu chưa hỗ trợ trả lại tại đây.')
      }
      setMessage('Đã trả lại yêu cầu.')
      await reload()
    } catch (err) {
      setMessage(err?.message ?? 'Không trả lại được yêu cầu.')
    } finally {
      setBusyId('')
    }
  }

  const detail = items.find((row) => (
    row.id === detailId
    || row.source?.id === detailId
    || row.source?.requestId === detailId
    || row.deepLink?.requestId === detailId
    || row.deepLink?.payrollCloseReview?.closeId === detailId
  )) || null

  useEffect(() => {
    if (!focusRequestId || items.length === 0) return
    const hit = items.find((row) => (
      row.id === focusRequestId
      || row.source?.id === focusRequestId
      || row.source?.requestId === focusRequestId
      || row.deepLink?.requestId === focusRequestId
      || row.deepLink?.payrollCloseReview?.closeId === focusRequestId
    ))
    if (hit) setDetailId(hit.id)
  }, [focusRequestId, items])

  return (
    <section className="emp-req" aria-label="Yêu cầu nhân viên">
      <header className="emp-req__head">
        <div>
          <h2>Yêu cầu nhân viên</h2>
          <p>
            Sửa chấm công · Duyệt bảng lương · Điều chỉnh khác (vd. sửa hóa đơn).
          </p>
        </div>
        <button type="button" className="emp-req__btn" onClick={reload} disabled={loading}>
          {loading ? 'Đang tải…' : 'Làm mới'}
        </button>
      </header>

      {error ? <p className="emp-req__error">{error}</p> : null}
      {message ? <p className="emp-req__msg">{message}</p> : null}

      <div className="emp-req__table-wrap">
        <table className="emp-req__table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Nhân viên</th>
              <th>Chi nhánh</th>
              <th>Loại yêu cầu</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={6}>Không có yêu cầu chờ xử lý.</td>
              </tr>
            ) : null}
            {items.map((item) => (
              <tr key={item.id} className={item.id === detailId ? 'is-focus' : undefined}>
                <td>{formatDateTime(item.submittedAt)}</td>
                <td>{item.employeeName}</td>
                <td>{item.branchName || item.branchId || '—'}</td>
                <td>{item.typeLabel}</td>
                <td>{item.statusLabel}</td>
                <td className="emp-req__actions">
                  <button type="button" className="emp-req__btn emp-req__btn--small" onClick={() => handleView(item)}>
                    Xem
                  </button>
                  <button
                    type="button"
                    className="emp-req__btn emp-req__btn--small emp-req__btn--primary"
                    disabled={busyId === item.id}
                    onClick={() => handleApprove(item)}
                  >
                    Duyệt
                  </button>
                  <button
                    type="button"
                    className="emp-req__btn emp-req__btn--small emp-req__btn--danger"
                    disabled={busyId === item.id}
                    onClick={() => handleReturn(item)}
                  >
                    Trả lại
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail ? (
        <aside className="emp-req__detail">
          <h3>Chi tiết</h3>
          <p><strong>{detail.typeLabel}</strong> · {detail.statusLabel}</p>
          <p>{detail.summary}</p>
          <p className="emp-req__muted">
            {detail.employeeName} · {detail.branchName || detail.branchId || '—'} · {formatDateTime(detail.submittedAt)}
          </p>
        </aside>
      ) : null}
    </section>
  )
}
