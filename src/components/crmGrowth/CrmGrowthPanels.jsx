import { formatCurrency } from '../../utils/invoice'
import {
  CUSTOMER_SEGMENT_BADGES,
  CUSTOMER_SEGMENT_LABELS,
} from '../../constants/customerTypes'
import { CARE_TODAY_REASONS } from '../../utils/crmGrowth/crmGrowthConstants'
import './CrmGrowth.css'

function reasonChipClass(reason) {
  if (reason === CARE_TODAY_REASONS.DORMANT || reason === CARE_TODAY_REASONS.AT_RISK) {
    return 'crmg-chip crmg-chip--danger'
  }
  if (reason === CARE_TODAY_REASONS.BIRTHDAY) return 'crmg-chip crmg-chip--info'
  if (reason === CARE_TODAY_REASONS.INVITE_BACK || reason === CARE_TODAY_REASONS.FOLLOW_UP) {
    return 'crmg-chip crmg-chip--warn'
  }
  return 'crmg-chip'
}

export function CrmGrowthMetricsStrip({ metrics }) {
  return (
    <div className="crmg-kpi-grid" aria-label="Chỉ số khách hàng">
      <div className="crmg-kpi">
        <span>Tỷ lệ quay lại</span>
        <strong>{metrics?.returnRate ?? 0}%</strong>
      </div>
      <div className="crmg-kpi">
        <span>Chu kỳ quay lại TB</span>
        <strong>
          {metrics?.avgReturnCycleDays != null ? `${metrics.avgReturnCycleDays} ngày` : '—'}
        </strong>
      </div>
      <div className="crmg-kpi">
        <span>LTV trung bình</span>
        <strong>{formatCurrency(metrics?.avgLtv ?? 0)}</strong>
      </div>
      <div className="crmg-kpi crmg-kpi--gold">
        <span>VIP</span>
        <strong>{metrics?.vipCount ?? 0}</strong>
      </div>
      <div className="crmg-kpi crmg-kpi--danger">
        <span>Nguy cơ / lâu vắng</span>
        <strong>{(metrics?.atRiskCount ?? 0) + (metrics?.dormantCount ?? 0)}</strong>
      </div>
    </div>
  )
}

export function CrmCareTodayPanel({ items, onOpenCustomers, limit = 6 }) {
  const rows = (items ?? []).slice(0, limit)
  return (
    <section className="crmg-panel">
      <div className="crmg-panel__head">
        <div>
          <h3>Cần chăm sóc hôm nay</h3>
          <p className="crmg-muted">{items?.length ?? 0} khách — rule-based</p>
        </div>
        {onOpenCustomers && (
          <button type="button" className="crmg-btn crmg-btn--primary" onClick={onOpenCustomers}>
            Mở CRM
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="crmg-muted">Không có khách cần chăm sóc hôm nay.</p>
      ) : (
        <ul className="crmg-list">
          {rows.map((row) => (
            <li key={row.key} className={row.reasons?.includes(CARE_TODAY_REASONS.DORMANT) ? 'is-danger' : ''}>
              <div className="crmg-list__title">
                <span>{row.name}</span>
                <span>{row.daysSinceLastVisit} ngày</span>
              </div>
              <p>
                {row.phone || 'Thiếu SĐT'} · {row.primaryEmployeeName || '—'} · LTV {formatCurrency(row.ltv ?? 0)}
              </p>
              <div className="crmg-reasons">
                {(row.reasonLabels ?? []).map((label, idx) => (
                  <span key={`${row.key}-${label}`} className={reasonChipClass(row.reasons?.[idx])}>
                    {label}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function CrmCeoGrowthPanel({ insights, onOpenCustomers }) {
  const atRisk = (insights?.atRisk ?? []).slice(0, 5)
  const vip = (insights?.vip ?? []).slice(0, 5)
  const branches = insights?.bestBranches ?? []
  const employees = insights?.bestEmployees ?? []

  return (
    <section className="crmg-panel">
      <div className="crmg-panel__head">
        <div>
          <h3>CEO · Tăng trưởng khách hàng</h3>
          <p className="crmg-muted">Nguy cơ mất · VIP · Chi nhánh / NV giữ chân tốt nhất</p>
        </div>
        {onOpenCustomers && (
          <button type="button" className="crmg-btn" onClick={onOpenCustomers}>
            Xem CRM
          </button>
        )}
      </div>
      <div className="crmg-columns">
        <div>
          <h4 className="crmg-muted">Khách có nguy cơ mất</h4>
          <ul className="crmg-list">
            {atRisk.length === 0 && <li><p className="crmg-muted">Không có</p></li>}
            {atRisk.map((c) => (
              <li key={c.key} className="is-danger">
                <div className="crmg-list__title">
                  <span>{c.name}</span>
                  <span>
                    {CUSTOMER_SEGMENT_BADGES[c.segment]} {CUSTOMER_SEGMENT_LABELS[c.segment]}
                  </span>
                </div>
                <p>{c.daysSinceLastVisit} ngày · LTV {formatCurrency(c.ltv ?? c.totalSpend ?? 0)}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="crmg-muted">Khách VIP</h4>
          <ul className="crmg-list">
            {vip.length === 0 && <li><p className="crmg-muted">Không có</p></li>}
            {vip.map((c) => (
              <li key={c.key}>
                <div className="crmg-list__title">
                  <span>{c.name}</span>
                  <span>{formatCurrency(c.ltv ?? 0)}</span>
                </div>
                <p>{c.primaryEmployeeName || '—'} · {c.visitCount} lần</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="crmg-muted">Chi nhánh giữ chân tốt</h4>
          <ul className="crmg-list">
            {branches.length === 0 && <li><p className="crmg-muted">Chưa đủ dữ liệu</p></li>}
            {branches.map((b) => (
              <li key={b.id}>
                <div className="crmg-list__title">
                  <span>{b.name}</span>
                  <span>{b.retentionRate}%</span>
                </div>
                <p>{b.returning}/{b.total} khách quay lại (&lt;60 ngày)</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="crmg-muted">NV giữ chân tốt</h4>
          <ul className="crmg-list">
            {employees.length === 0 && <li><p className="crmg-muted">Chưa đủ dữ liệu</p></li>}
            {employees.map((e) => (
              <li key={e.id}>
                <div className="crmg-list__title">
                  <span>{e.name}</span>
                  <span>{e.retentionRate}%</span>
                </div>
                <p>{e.returning}/{e.total} khách quay lại (&lt;60 ngày)</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

export function CrmRevenueBySegment({ metrics }) {
  const bySegment = metrics?.bySegment ?? {}
  const rows = Object.entries(bySegment)
  if (!rows.length) return null
  return (
    <section className="crmg-panel">
      <h3>Doanh thu theo nhóm khách</h3>
      <div className="crmg-table-wrap">
        <table className="crmg-table">
          <thead>
            <tr>
              <th>Nhóm</th>
              <th>Số khách</th>
              <th>Doanh thu vé</th>
              <th>Tổng chi tiêu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([seg, row]) => (
              <tr key={seg}>
                <td>
                  {CUSTOMER_SEGMENT_BADGES[seg]} {CUSTOMER_SEGMENT_LABELS[seg] ?? seg}
                </td>
                <td>{row.count}</td>
                <td>{formatCurrency(row.revenue)}</td>
                <td>{formatCurrency(row.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
