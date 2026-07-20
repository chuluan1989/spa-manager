import { DRILL_METRICS } from '../../utils/drillDownReport'
import { formatCurrency } from '../../utils/invoice'
import { setDrillDownPrefill } from '../../utils/navigationPrefill'

function FinanceSkeleton() {
  return (
    <div className="ops-center__kpi-grid" aria-hidden="true">
      {DRILL_METRICS.map((metric) => (
        <div key={metric.id} className="ops-center__kpi ops-center__kpi--skeleton">
          <span className="ops-center__skeleton ops-center__skeleton--label" />
          <span className="ops-center__skeleton ops-center__skeleton--value" />
        </div>
      ))}
    </div>
  )
}

export default function OpsFinanceSnapshot({
  summary,
  filters,
  loading,
  refreshing = false,
  error,
  onNavigate,
}) {
  const openDashboard = (metricId) => {
    setDrillDownPrefill({
      level: 'system',
      filters: {
        fromDate: filters?.fromDate ?? '',
        toDate: filters?.toDate ?? '',
        branchId: filters?.branchId ?? '',
      },
      metric: metricId,
    })
    onNavigate?.('dashboard')
  }

  return (
    <section className={`ops-center__section ${refreshing ? 'is-refreshing' : ''}`} aria-label="Ảnh tài chính">
      <header className="ops-center__section-head">
        <h2>Ảnh tài chính</h2>
        <p>Cùng công thức Tổng quan / Báo cáo hiện tại · bấm card để xem chi tiết</p>
      </header>

      {loading ? (
        <FinanceSkeleton />
      ) : error ? (
        <p className="ops-center__state ops-center__state--error">{error}</p>
      ) : !summary ? (
        <p className="ops-center__state">Chưa có dữ liệu</p>
      ) : (
        <div className="ops-center__kpi-grid">
          {DRILL_METRICS.map((metric) => (
            <button
              key={metric.id}
              type="button"
              className="ops-center__kpi"
              onClick={() => openDashboard(metric.id)}
            >
              <span className="ops-center__kpi-label">{metric.label}</span>
              <strong className="ops-center__kpi-value">
                {formatCurrency(summary[metric.id] ?? 0)}
              </strong>
              <span className="ops-center__kpi-hint">Xem Tổng quan →</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
