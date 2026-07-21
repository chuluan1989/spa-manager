import { formatCurrency } from '../../utils/invoice'
import {
  CUSTOMER_SEGMENT_BADGES,
  CUSTOMER_SEGMENT_LABELS,
} from '../../constants/customerTypes'
import {
  CrmCeoGrowthPanel,
  CrmGrowthMetricsStrip,
  CrmRevenueBySegment,
} from './CrmGrowthPanels'
import './CrmGrowth.css'

export default function CustomerGrowthHub({
  careToday,
  metrics,
  ceoInsights,
  onSelectCustomer,
  onBack,
}) {
  return (
    <div className="crmg-hub">
      {onBack && (
        <button type="button" className="crmg-btn" onClick={onBack}>
          ← Tổng quan CRM
        </button>
      )}

      <section className="crmg-hub__section">
        <h2>Chỉ số khách hàng</h2>
        <CrmGrowthMetricsStrip metrics={metrics} />
        <CrmRevenueBySegment metrics={metrics} />
      </section>

      <section className="crmg-hub__section">
        <h2>Danh sách cần chăm sóc hôm nay</h2>
        <p className="crmg-muted">{careToday?.length ?? 0} khách</p>
        <div className="crmg-table-wrap">
          <table className="crmg-table">
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Lý do</th>
                <th>Ngày vắng</th>
                <th>NV chính</th>
                <th>LTV</th>
                <th>Phân loại</th>
              </tr>
            </thead>
            <tbody>
              {(careToday ?? []).length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <p className="crmg-muted">Không có khách cần chăm sóc hôm nay.</p>
                  </td>
                </tr>
              )}
              {(careToday ?? []).map((row) => (
                <tr key={row.key} onClick={() => onSelectCustomer?.(row.key)}>
                  <td>
                    <strong>{row.name}</strong>
                    <div className="crmg-muted">{row.phone || 'Thiếu SĐT'}</div>
                  </td>
                  <td>
                    <div className="crmg-reasons">
                      {(row.reasonLabels ?? []).map((label) => (
                        <span key={`${row.key}-${label}`} className="crmg-chip">{label}</span>
                      ))}
                    </div>
                  </td>
                  <td>{row.daysSinceLastVisit} ngày</td>
                  <td>{row.primaryEmployeeName || '—'}</td>
                  <td>{formatCurrency(row.ltv ?? 0)}</td>
                  <td>
                    {CUSTOMER_SEGMENT_BADGES[row.segment]}{' '}
                    {CUSTOMER_SEGMENT_LABELS[row.segment] ?? row.segment}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="crmg-hub__section">
        <h2>CEO Dashboard</h2>
        <CrmCeoGrowthPanel insights={ceoInsights} />
      </section>
    </div>
  )
}
