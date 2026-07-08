import { formatCurrency } from '../../utils/invoice'
import {
  CUSTOMER_SEGMENT_BADGES,
  CUSTOMER_SEGMENT_LABELS,
} from '../../constants/customerTypes'

export default function CustomerDashboard({ dashboard }) {
  const cards = [
    { label: 'Tổng khách hàng', value: dashboard.totalCustomers, tone: 'neutral' },
    { label: 'Khách mới', value: dashboard.newCustomers, tone: 'green' },
    { label: 'Khách thân thiết', value: dashboard.loyalCustomers, tone: 'blue' },
    { label: 'Khách VIP', value: dashboard.vipCustomers, tone: 'gold' },
    { label: 'Nguy cơ mất khách', value: dashboard.atRiskCustomers, tone: 'red' },
    { label: 'Quay lại tháng này', value: dashboard.returningThisMonth, tone: 'neutral' },
    { label: 'Tỷ lệ quay lại', value: `${dashboard.returnRate}%`, tone: 'neutral' },
  ]

  return (
    <section className="crm-dashboard">
      <div className="crm-dashboard__cards">
        {cards.map((card) => (
          <article key={card.label} className={`crm-dashboard__card crm-dashboard__card--${card.tone}`}>
            <span className="crm-dashboard__card-label">{card.label}</span>
            <strong className="crm-dashboard__card-value">{card.value}</strong>
          </article>
        ))}
      </div>

      <div className="crm-dashboard__tops">
        <article className="crm-dashboard__top-panel">
          <h3>Top chi tiêu cao</h3>
          <ul>
            {dashboard.topSpend.length === 0 && <li className="crm-dashboard__empty">Chưa có dữ liệu</li>}
            {dashboard.topSpend.map((customer, index) => (
              <li key={customer.key}>
                <span>{index + 1}. {customer.name}</span>
                <strong>{formatCurrency(customer.totalSpend)}</strong>
              </li>
            ))}
          </ul>
        </article>
        <article className="crm-dashboard__top-panel">
          <h3>Top Tips cao</h3>
          <ul>
            {dashboard.topTips.length === 0 && <li className="crm-dashboard__empty">Chưa có dữ liệu</li>}
            {dashboard.topTips.map((customer, index) => (
              <li key={customer.key}>
                <span>{index + 1}. {customer.name}</span>
                <strong>{formatCurrency(customer.totalTips)}</strong>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <p className="crm-dashboard__hint">
        Phân loại tự động: {CUSTOMER_SEGMENT_BADGES.new} {CUSTOMER_SEGMENT_LABELS.new}
        {' · '}{CUSTOMER_SEGMENT_BADGES.loyal} {CUSTOMER_SEGMENT_LABELS.loyal}
        {' · '}{CUSTOMER_SEGMENT_BADGES.vip} {CUSTOMER_SEGMENT_LABELS.vip}
        {' · '}{CUSTOMER_SEGMENT_BADGES.at_risk} {CUSTOMER_SEGMENT_LABELS.at_risk}
      </p>
    </section>
  )
}
