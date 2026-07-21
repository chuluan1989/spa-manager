import { formatCurrency } from '../../utils/invoice'
import { getCustomerInitials } from '../../utils/customerAnalytics'
import {
  CUSTOMER_SEGMENT_BADGES,
  CUSTOMER_SEGMENT_LABELS,
} from '../../constants/customerTypes'

function formatDate(value) {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

export default function CustomerList({ customers, selectedKey, onSelect }) {
  if (customers.length === 0) {
    return (
      <div className="crm-list crm-list--empty">
        <p>Không tìm thấy khách hàng phù hợp.</p>
      </div>
    )
  }

  return (
    <div className="crm-list">
      <table className="crm-list__table">
        <thead>
          <tr>
            <th>Khách hàng</th>
            <th>Chi nhánh</th>
            <th>NV gần nhất</th>
            <th>Lần đến</th>
            <th>Doanh thu vé</th>
            <th>Tips</th>
            <th>Lần gần nhất</th>
            <th>Phân loại</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => {
            const isSelected = customer.key === selectedKey
            const segmentLabel = CUSTOMER_SEGMENT_LABELS[customer.segment] ?? '—'
            const badge = CUSTOMER_SEGMENT_BADGES[customer.segment] ?? ''
            return (
              <tr
                key={customer.key}
                className={isSelected ? 'crm-list__row--active' : ''}
                onClick={() => onSelect(customer.key)}
              >
                <td>
                  <div className="crm-list__customer">
                    <span className="crm-avatar" aria-hidden="true">{getCustomerInitials(customer.name)}</span>
                    <div>
                      <strong>{customer.name}</strong>
                      <span className="crm-list__phone">
                        {customer.phone || 'Thiếu SĐT'}
                        {customer.missingPhone && <em className="crm-tag crm-tag--warn">Thiếu SĐT</em>}
                      </span>
                    </div>
                  </div>
                </td>
                <td>{customer.primaryBranchName}</td>
                <td>{customer.latestEmployeeName}</td>
                <td>{customer.visitCount}</td>
                <td>{formatCurrency(customer.totalTicketRevenue)}</td>
                <td>{formatCurrency(customer.totalTips)}</td>
                <td>{formatDate(customer.lastVisitDate)}</td>
                <td>
                  <span className={`crm-segment crm-segment--${customer.segment}`}>
                    {badge} {segmentLabel}
                    {customer.isVip && <span className="crm-vip-badge">VIP</span>}
                  </span>
                </td>
                <td>
                  {customer.segment === 'dormant' || customer.segment === 'at_risk' ? (
                    <span className="crm-status crm-status--danger">Cần chăm sóc</span>
                  ) : customer.daysSinceLastVisit >= 30 ? (
                    <span className="crm-status crm-status--warn">Lâu chưa quay lại</span>
                  ) : (
                    <span className="crm-status crm-status--ok">Hoạt động</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
