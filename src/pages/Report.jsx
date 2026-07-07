import EmployeeSalaryPanel from '../components/report/EmployeeSalaryPanel'
import ReportExplorer from '../components/report/ReportExplorer'
import {
  canViewReport,
  isEmployee,
} from '../constants/auth'
import { consumeDrillDownPrefill } from '../utils/navigationPrefill'
import './Report.css'

export default function Report({ onNavigate }) {
  const prefill = consumeDrillDownPrefill()

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
      <ReportExplorer onNavigate={onNavigate} initialPrefill={prefill} />
    </div>
  )
}
