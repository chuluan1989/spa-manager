import { useCallback, useEffect, useState } from 'react'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import {
  loadMyAppNotifications,
  markMyNotificationsRead,
} from '../../utils/workInbox/workInboxService'
import {
  requestAppNavigate,
  setAttendanceScreenPrefill,
  setInvoiceEditScreenPrefill,
  setPayrollCloseReviewPrefill,
  setReportsTabPrefill,
} from '../../utils/navigationPrefill'
import './AppNotificationsBanner.css'

/**
 * Banner thông báo hai chiều — mở Báo cáo → Yêu cầu nhân viên (hoặc hồ sơ gốc).
 */
export default function AppNotificationsBanner() {
  const syncVersion = useDataSyncVersion()
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const rows = await loadMyAppNotifications({ unreadOnly: true })
      setItems((rows || []).slice(0, 5))
    } catch {
      setItems([])
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload, syncVersion])

  if (items.length === 0) return null

  const handleOpen = async (row) => {
    setBusy(true)
    try {
      await markMyNotificationsRead([row.id])
      const payload = row.payload || {}
      const type = row.requestType || payload.requestType
      const requestId = row.requestId || payload.closeId || payload.requestId || ''

      // Vào Báo cáo → Yêu cầu nhân viên (đúng hồ sơ cần xử lý).
      setReportsTabPrefill('employee-requests', { requestId })
      if (type === 'payroll_close' && payload.employeeId && payload.billingMonth && payload.cycle) {
        setPayrollCloseReviewPrefill({
          employeeId: payload.employeeId,
          billingMonth: payload.billingMonth,
          cycle: payload.cycle,
          closeId: payload.closeId || row.requestId,
        })
      }
      if (type === 'attendance_correction') {
        setAttendanceScreenPrefill('requests')
      }
      if (type === 'invoice_edit') {
        setInvoiceEditScreenPrefill('requests', { requestId: row.requestId || '' })
      }
      requestAppNavigate('reports')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const handleDismissAll = async () => {
    setBusy(true)
    try {
      await markMyNotificationsRead(items.map((row) => row.id))
      setItems([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-ntf" role="status" aria-live="polite">
      <div className="app-ntf__head">
        <strong>Thông báo ({items.length})</strong>
        <button type="button" disabled={busy} onClick={handleDismissAll}>
          Đánh dấu đã đọc
        </button>
      </div>
      <ul className="app-ntf__list">
        {items.map((row) => (
          <li key={row.id}>
            <div>
              <p className="app-ntf__title">{row.title}</p>
              <p className="app-ntf__body">{row.body}</p>
            </div>
            <button type="button" disabled={busy} onClick={() => handleOpen(row)}>
              Xem
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
