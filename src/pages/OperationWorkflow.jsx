import { useEffect } from 'react'
import {
  requestAppNavigate,
  setReportsTabPrefill,
} from '../utils/navigationPrefill'

/**
 * Route cũ / Công việc — chuyển sang Báo cáo → Yêu cầu nhân viên (không trang trắng).
 */
export default function OperationWorkflow() {
  useEffect(() => {
    setReportsTabPrefill('employee-requests')
    requestAppNavigate('reports')
  }, [])

  return (
    <div className="erp-page" style={{ padding: 24 }}>
      <p>Module Công việc đã gỡ. Đang chuyển sang Báo cáo → Yêu cầu nhân viên…</p>
    </div>
  )
}
