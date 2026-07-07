import DrillDownExplorer from '../components/drilldown/DrillDownExplorer'
import { getCurrentUserName, isAdmin, isEmployee } from '../constants/auth'
import { consumeDrillDownPrefill } from '../utils/navigationPrefill'

export default function Dashboard({ onNavigate }) {
  const prefill = consumeDrillDownPrefill()

  return (
    <DrillDownExplorer
      title="Dashboard"
      rootLabel="Dashboard"
      subtitle={
        isAdmin()
          ? 'Tổng quan quản trị toàn hệ thống — drill-down đến từng hóa đơn'
          : isEmployee()
            ? `Tổng quan doanh số — ${getCurrentUserName()}`
            : 'Tổng quan chi nhánh — drill-down đến từng hóa đơn'
      }
      initialPrefill={prefill}
      onNavigate={onNavigate}
    />
  )
}
