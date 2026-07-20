import { useState } from 'react'
import EmployeeSalaryPanel from '../components/report/EmployeeSalaryPanel'
import ReportExplorer from '../components/report/ReportExplorer'
import ManagementReports from '../components/report/ManagementReports'
import {
  canViewReport,
  isEmployee,
} from '../constants/auth'
import { consumeDrillDownPrefill } from '../utils/navigationPrefill'
import './Report.css'
import '../components/report/ManagementReports.css'

export default function Report({ onNavigate }) {
  const prefill = consumeDrillDownPrefill()
  const [mode, setMode] = useState('management')

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
          <h1 className="report__hero-title">Lương của tôi</h1>
          <p className="report__hero-desc">Theo dõi doanh số, tips và hoa hồng theo chu kỳ.</p>
        </header>
        <EmployeeSalaryPanel />
      </div>
    )
  }

  return (
    <div className="report">
      <header className="report__hero">
        <h1 className="report__hero-title">Báo cáo</h1>
        <p className="report__hero-desc">Đánh giá hiệu quả chi nhánh và nhân viên theo dữ liệu thật.</p>
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
          className={mode === 'explorer' ? 'is-active' : ''}
          onClick={() => setMode('explorer')}
        >
          Tổng hợp drill-down
        </button>
      </div>

      {mode === 'management' ? (
        <ManagementReports onNavigate={onNavigate} />
      ) : (
        <ReportExplorer onNavigate={onNavigate} initialPrefill={prefill} />
      )}
    </div>
  )
}
