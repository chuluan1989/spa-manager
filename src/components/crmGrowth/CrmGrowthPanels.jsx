import { formatCurrency } from '../../utils/invoice'
import {
  CUSTOMER_SEGMENT_BADGES,
  CUSTOMER_SEGMENT_LABELS,
} from '../../constants/customerTypes'
import { CARE_TODAY_REASONS } from '../../utils/crmGrowth/crmGrowthConstants'
import {
  RETENTION_BUCKET_LABELS,
  RETENTION_BUCKETS,
} from '../../utils/crmGrowth/crmGrowthConstants'
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

function formatDate(value) {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

function HealthBadge({ score, gradeLabel, gradeId }) {
  return (
    <span className={`crmg-health crmg-health--${gradeId || 'normal'}`}>
      {score ?? 0} · {gradeLabel || '—'}
    </span>
  )
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
      <div className="crmg-kpi">
        <span>Health Score TB</span>
        <strong>{metrics?.avgHealthScore ?? 0}</strong>
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
                {row.healthScore != null ? ` · Health ${row.healthScore}` : ''}
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

function CeoCustomerList({ title, rows, empty, danger = false, renderMeta }) {
  return (
    <div>
      <h4 className="crmg-muted">{title}</h4>
      <ul className="crmg-list">
        {rows.length === 0 && <li><p className="crmg-muted">{empty}</p></li>}
        {rows.map((c) => (
          <li key={c.key} className={danger ? 'is-danger' : ''}>
            <div className="crmg-list__title">
              <span>{c.name}</span>
              <span>
                {c.healthScore != null
                  ? `${c.healthScore}`
                  : (CUSTOMER_SEGMENT_BADGES[c.segment] || '')}
              </span>
            </div>
            <p>{renderMeta(c)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CrmCeoGrowthPanel({ insights, onOpenCustomers }) {
  const atRisk = (insights?.atRisk ?? []).slice(0, 5)
  const newVip = (insights?.newVip ?? []).slice(0, 5)
  const topSpenders = (insights?.topSpenders ?? []).slice(0, 5)
  const topReturners = (insights?.topReturners ?? []).slice(0, 5)
  const branches = insights?.bestBranches ?? []

  return (
    <section className="crmg-panel">
      <div className="crmg-panel__head">
        <div>
          <h3>CEO · Tăng trưởng khách hàng</h3>
          <p className="crmg-muted">VIP mới · Nguy cơ mất · Top chi tiêu · Top quay lại · Chi nhánh giữ chân</p>
        </div>
        {onOpenCustomers && (
          <button type="button" className="crmg-btn" onClick={onOpenCustomers}>
            Xem CRM
          </button>
        )}
      </div>
      <div className="crmg-columns">
        <CeoCustomerList
          title="Khách VIP mới"
          rows={newVip}
          empty="Không có VIP mới"
          renderMeta={(c) => `${formatCurrency(c.ltv ?? 0)} · lần đầu ${formatDate(c.firstVisitDate)}`}
        />
        <CeoCustomerList
          title="Khách có nguy cơ mất"
          rows={atRisk}
          empty="Không có"
          danger
          renderMeta={(c) => `${c.daysSinceLastVisit} ngày · Health ${c.healthScore ?? '—'} · ${formatCurrency(c.ltv ?? 0)}`}
        />
        <CeoCustomerList
          title="Top khách chi tiêu cao"
          rows={topSpenders}
          empty="Không có"
          renderMeta={(c) => `LTV ${formatCurrency(c.ltv ?? 0)} · ${c.visitCount} lần`}
        />
        <CeoCustomerList
          title="Top khách quay lại nhiều"
          rows={topReturners}
          empty="Không có"
          renderMeta={(c) => `${c.visitCount} lần · ${Number(c.avgVisitsPerMonth ?? 0).toFixed(1)}/tháng`}
        />
        <div>
          <h4 className="crmg-muted">Chi nhánh giữ chân khách tốt nhất</h4>
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

export function CrmRetentionPanel({ retentionLists, onSelectCustomer }) {
  const buckets = [
    RETENTION_BUCKETS.DAYS_45,
    RETENTION_BUCKETS.DAYS_60,
    RETENTION_BUCKETS.DAYS_90,
  ]

  return (
    <section className="crmg-panel">
      <div className="crmg-panel__head">
        <div>
          <h3>Cần giữ chân</h3>
          <p className="crmg-muted">
            {(retentionLists?.all ?? []).length} khách · 45 / 60 / 90 ngày chưa quay lại
          </p>
        </div>
      </div>

      {buckets.map((bucket) => {
        const rows = retentionLists?.[bucket] ?? []
        return (
          <div key={bucket} className="crmg-retention-block">
            <h4>
              {RETENTION_BUCKET_LABELS[bucket]}
              <span className="crmg-muted"> ({rows.length})</span>
            </h4>
            <div className="crmg-table-wrap">
              <table className="crmg-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>SĐT</th>
                    <th>Chi nhánh</th>
                    <th>NV chăm sóc chính</th>
                    <th>Dịch vụ gần nhất</th>
                    <th>Lần gần nhất</th>
                    <th>Health Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7}><p className="crmg-muted">Không có khách trong nhóm này.</p></td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.key} onClick={() => onSelectCustomer?.(row.key)}>
                      <td><strong>{row.name}</strong></td>
                      <td>{row.phone || 'Thiếu SĐT'}</td>
                      <td>{row.branchName}</td>
                      <td>{row.primaryEmployeeName}</td>
                      <td>{row.lastServiceName}</td>
                      <td>{formatDate(row.lastVisitDate)} · {row.daysSinceLastVisit} ngày</td>
                      <td>
                        <HealthBadge
                          score={row.healthScore}
                          gradeLabel={row.healthGradeLabel}
                          gradeId={row.healthGradeId}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </section>
  )
}

export { HealthBadge, formatDate }
