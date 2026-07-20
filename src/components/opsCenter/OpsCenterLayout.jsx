import OpsPeriodStrip from './OpsPeriodStrip'
import OpsRefreshBar from './OpsRefreshBar'
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
  financeRefreshing,
  financeError,
  todayHealth,
  alerts,
  opsLoading,
  opsRefreshing,
  opsError,
  lastUpdatedAt,
  refreshing,
  onRefresh,
  onNavigate,
}) {
  return (
    <div className="ops-center erp-page">
      <header className="ops-center__header">
        <div>
          <h1>Điều hành</h1>
          <p>Trung tâm vận hành — tự làm mới mỗi 60 giây, deep-link về các màn hiện có.</p>
        </div>
        <div className="ops-center__header-actions">
          <OpsPeriodStrip periodMode={periodMode} onChangePeriod={onChangePeriod} />
          <OpsRefreshBar
            lastUpdatedAt={lastUpdatedAt}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        </div>
      </header>

      <OpsFinanceSnapshot
        summary={financeSummary}
        filters={filters}
        loading={financeLoading}
        refreshing={financeRefreshing}
        error={financeError}
        onNavigate={onNavigate}
      />

      <div className="ops-center__split">
        <OpsTodayHealth
          health={todayHealth}
          loading={opsLoading}
          refreshing={opsRefreshing}
          error={opsError}
          onNavigate={onNavigate}
        />
        <OpsAlertsPanel
          alerts={alerts}
          loading={opsLoading}
          refreshing={opsRefreshing}
          error={opsError}
          onNavigate={onNavigate}
        />
      </div>

      <OpsQuickLinks onNavigate={onNavigate} />
    </div>
  )
}
