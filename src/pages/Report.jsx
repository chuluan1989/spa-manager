import { useEffect, useState } from 'react'
import EmployeeSalaryPanel from '../components/report/EmployeeSalaryPanel'
import EmployeeCustomerRequestedPanel from '../components/report/EmployeeCustomerRequestedPanel'
import EmployeeRequestsPanel from '../components/report/EmployeeRequestsPanel'
import ReportExplorer from '../components/report/ReportExplorer'
import ManagementReports from '../components/report/ManagementReports'
import BranchEfficiencyPanel from '../components/report/BranchEfficiencyPanel'
import {
  canViewReport,
  isAdmin,
  isBranchManager,
  isEmployee,
} from '../constants/auth'
import {
  consumeDrillDownPrefill,
  consumeReportsRequestFocus,
  consumeReportsTabPrefill,
} from '../utils/navigationPrefill'
import './Report.css'
import '../components/report/ManagementReports.css'
import '../components/report/BranchEfficiencyPanel.css'

export default function Report({ onNavigate }) {
  const prefill = consumeDrillDownPrefill()
  const tabPrefill = consumeReportsTabPrefill()
  const requestFocus = consumeReportsRequestFocus()
  const canHandleRequests = isAdmin() || isBranchManager()
  const [mode, setMode] = useState(() => {
    if (tabPrefill === 'employee-requests' && canHandleRequests) return 'employee-requests'
    return 'management'
  })
  const [employeeTab, setEmployeeTab] = useState('salary')
  const [focusRequestId, setFocusRequestId] = useState(requestFocus || '')

  useEffect(() => {
    if (tabPrefill === 'employee-requests' && canHandleRequests) {
      setMode('employee-requests')
    }
    if (requestFocus) setFocusRequestId(requestFocus)
  }, [tabPrefill, requestFocus, canHandleRequests])

  if (!canViewReport()) {
    return (
      <div className="report report--denied">
        <h2 className="report__title">Không có quyền truy cập</h2>
        <p className="report__subtitle">Bạn không được phép xem báo cáo.</p>
      </div>
    )
  }

  if (isEmployee()) {
    return (
      <div className="report report--salary">
        <header className="report__hero">
          <h1 className="report__hero-title">Báo cáo của tôi</h1>
          <p className="report__hero-desc">Theo dõi lương và lượt khách yêu cầu theo chu kỳ.</p>
        </header>

        <div className="report-mode-tabs" role="tablist" aria-label="Chế độ báo cáo nhân viên">
          <button
            type="button"
            className={employeeTab === 'salary' ? 'is-active' : ''}
            onClick={() => setEmployeeTab('salary')}
          >
            Lương
          </button>
          <button
            type="button"
            className={employeeTab === 'requested' ? 'is-active' : ''}
            onClick={() => setEmployeeTab('requested')}
          >
            Khách yêu cầu
          </button>
        </div>

        {employeeTab === 'salary' ? <EmployeeSalaryPanel /> : <EmployeeCustomerRequestedPanel />}
      </div>
    )
  }

  return (
    <div className="report">
      <header className="report__hero">
        <h1 className="report__hero-title">Báo cáo</h1>
        <p className="report__hero-desc">Đánh giá hiệu quả chi nhánh và xử lý yêu cầu nhân viên.</p>
      </header>

      <div className="report-mode-tabs" role="tablist" aria-label="Chế độ báo cáo">
        <button
          type="button"
          className={mode === 'management' ? 'is-active' : ''}
          onClick={() => setMode('management')}
        >
          Quản trị CN / NV
        </button>
        <button
          type="button"
          className={mode === 'efficiency' ? 'is-active' : ''}
          onClick={() => setMode('efficiency')}
        >
          Hiệu quả chi nhánh
        </button>
        <button
          type="button"
          className={mode === 'explorer' ? 'is-active' : ''}
          onClick={() => setMode('explorer')}
        >
          Tổng hợp drill-down
        </button>
        {canHandleRequests && (
          <button
            type="button"
            className={mode === 'employee-requests' ? 'is-active' : ''}
            onClick={() => setMode('employee-requests')}
          >
            Yêu cầu nhân viên
          </button>
        )}
      </div>

      {mode === 'management' ? (
        <ManagementReports onNavigate={onNavigate} />
      ) : mode === 'efficiency' ? (
        <BranchEfficiencyPanel />
      ) : mode === 'employee-requests' ? (
        <EmployeeRequestsPanel focusRequestId={focusRequestId} />
      ) : (
        <ReportExplorer onNavigate={onNavigate} initialPrefill={prefill} />
      )}
    </div>
  )
}
