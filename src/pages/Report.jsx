import { useState } from 'react'
import DrillDownExplorer from '../components/drilldown/DrillDownExplorer'
import EmployeeSalaryPanel from '../components/report/EmployeeSalaryPanel'
import AdminEmployeeReport from '../components/report/AdminEmployeeReport'
import {
  canViewOverviewReport,
  canViewReport,
  isEmployee,
} from '../constants/auth'
import { consumeDrillDownPrefill } from '../utils/navigationPrefill'
import './Report.css'

const REPORT_TABS = {
  OVERVIEW: 'overview',
  SALARY: 'salary',
}

export default function Report({ onNavigate }) {
  const [activeTab, setActiveTab] = useState(
    isEmployee() ? REPORT_TABS.SALARY : REPORT_TABS.OVERVIEW,
  )
  const prefill = consumeDrillDownPrefill()

  if (!canViewReport()) {
    return (
      <div className="report report--denied">
        <h2 className="report__title">Không có quyền truy cập</h2>
        <p className="report__subtitle">Bạn không được phép xem báo cáo.</p>
      </div>
    )
  }

  return (
    <div className="report">
      <nav className="report__tabs" aria-label="Loại báo cáo">
        {canViewOverviewReport() && (
          <button
            type="button"
            className={`report__tab ${activeTab === REPORT_TABS.OVERVIEW ? 'report__tab--active' : ''}`}
            onClick={() => setActiveTab(REPORT_TABS.OVERVIEW)}
          >
            Drill-down
          </button>
        )}
        <button
          type="button"
          className={`report__tab ${activeTab === REPORT_TABS.SALARY ? 'report__tab--active' : ''}`}
          onClick={() => setActiveTab(REPORT_TABS.SALARY)}
        >
          {isEmployee() ? 'Lương nhân viên' : 'Báo cáo nhân viên'}
        </button>
      </nav>

      {activeTab === REPORT_TABS.SALARY || !canViewOverviewReport() ? (
        isEmployee() ? <EmployeeSalaryPanel /> : <AdminEmployeeReport onNavigate={onNavigate} />
      ) : (
        <DrillDownExplorer
          title="Báo cáo"
          rootLabel="Báo cáo"
          subtitle="Phân tích nhiều cấp — truy ngược mọi con số đến hóa đơn gốc"
          initialPrefill={prefill}
          onNavigate={onNavigate}
        />
      )}
    </div>
  )
}
