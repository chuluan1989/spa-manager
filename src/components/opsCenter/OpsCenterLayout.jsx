import OpsPeriodStrip from './OpsPeriodStrip'
import OpsFinanceSnapshot from './OpsFinanceSnapshot'
import OpsTodayHealth from './OpsTodayHealth'
import OpsAlertsPanel from './OpsAlertsPanel'
import OpsQuickLinks from './OpsQuickLinks'
import './OpsCenter.css'

export default function OpsCenterLayout({
  periodMode,
  onChangePeriod,
  financeSummary,
  filters,
  financeLoading,
  financeError,
  todayHealth,
  alerts,
  opsLoading,
  opsError,
  onNavigate,
}) {
  return (
    <div className="ops-center erp-page">
      <header className="ops-center__header">
        <div>
          <h1>Điều hành</h1>
          <p>Trung tâm vận hành — chỉ đọc dữ liệu, deep-link về các màn hiện có.</p>
        </div>
        <OpsPeriodStrip periodMode={periodMode} onChangePeriod={onChangePeriod} />
      </header>

      <OpsFinanceSnapshot
        summary={financeSummary}
        filters={filters}
        loading={financeLoading}
        error={financeError}
        onNavigate={onNavigate}
      />

      <div className="ops-center__split">
        <OpsTodayHealth
          health={todayHealth}
          loading={opsLoading}
          error={opsError}
          onNavigate={onNavigate}
        />
        <OpsAlertsPanel
          alerts={alerts}
          loading={opsLoading}
          error={opsError}
          onNavigate={onNavigate}
        />
      </div>

      <OpsQuickLinks onNavigate={onNavigate} />
    </div>
  )
}
