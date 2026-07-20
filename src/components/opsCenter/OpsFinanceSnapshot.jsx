import { DRILL_METRICS } from '../../utils/drillDownReport'
import { formatCurrency } from '../../utils/invoice'
import { setDrillDownPrefill } from '../../utils/navigationPrefill'

export default function OpsFinanceSnapshot({
  summary,
  filters,
  loading,
  error,
  onNavigate,
}) {
  if (loading) {
    return <p className="ops-center__state">Đang tải ảnh tài chính…</p>
  }
  if (error) {
    return <p className="ops-center__state ops-center__state--error">{error}</p>
  }
  if (!summary) {
    return <p className="ops-center__state">Chưa có dữ liệu tài chính trong kỳ.</p>
  }

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
    <section className="ops-center__section" aria-label="Ảnh tài chính">
      <header className="ops-center__section-head">
        <h2>Ảnh tài chính</h2>
        <p>Cùng công thức Tổng quan / Báo cáo hiện tại</p>
      </header>
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
            <span className="ops-center__kpi-hint">Xem chi tiết →</span>
          </button>
        ))}
      </div>
    </section>
  )
}
