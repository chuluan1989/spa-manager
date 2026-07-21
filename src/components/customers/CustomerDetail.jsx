import { useMemo, useState } from 'react'
import InvoiceDetailModal from '../invoice/InvoiceDetailModal'
import CustomerCareTab from './CustomerCareTab'
import { canEditCustomerProfile, canManageCustomerCare } from '../../constants/auth'
import { formatCurrency } from '../../utils/invoice'
import { getCustomerInitials } from '../../utils/customerAnalytics'
import { saveCustomerProfileOverride } from '../../utils/customerProfileStorage'
import {
  CUSTOMER_SEGMENT_BADGES,
  CUSTOMER_SEGMENT_LABELS,
} from '../../constants/customerTypes'
import { TIMELINE_EVENT_TYPES } from '../../utils/crmGrowth/crmGrowthConstants'
import { HealthBadge, formatDate } from '../crmGrowth/CrmGrowthPanels'
import '../crmGrowth/CrmGrowth.css'

export default function CustomerDetail({ customer, onUpdated, onClose }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => ({
    name: customer.name,
    phone: customer.phone,
    gender: customer.gender,
    dateOfBirth: customer.dateOfBirth,
    occupation: customer.occupation,
    address: customer.address,
    note: customer.note,
  }))
  const [viewInvoice, setViewInvoice] = useState(null)

  const canEdit = canEditCustomerProfile()
  const canCare = canManageCustomerCare()

  const segmentLabel = CUSTOMER_SEGMENT_LABELS[customer.segment] ?? '—'
  const badge = CUSTOMER_SEGMENT_BADGES[customer.segment] ?? ''
  const value = customer.valueAnalysis || {}
  const timeline = customer.fullTimeline?.length
    ? customer.fullTimeline
    : (customer.timeline || []).map((entry) => ({
      ...entry,
      type: TIMELINE_EVENT_TYPES.INVOICE,
      typeLabel: 'Hóa đơn',
      title: entry.employeeName,
      customerRequested: Boolean(entry.invoice?.customerRequested),
      note: entry.invoice?.note || '',
    }))

  const tabs = useMemo(() => {
    const list = [
      { id: 'overview', label: 'Tổng quan' },
      { id: 'timeline', label: 'Timeline' },
      { id: 'value', label: 'Giá trị khách' },
      { id: 'services', label: 'Thống kê dịch vụ' },
      { id: 'employees', label: 'Nhân viên phục vụ' },
    ]
    if (canCare) list.push({ id: 'care', label: 'Chăm sóc khách' })
    return list
  }, [canCare])

  const handleSaveProfile = () => {
    saveCustomerProfileOverride(customer.key, form)
    setEditing(false)
    onUpdated?.()
  }

  return (
    <aside className="crm-detail">
      <header className="crm-detail__header">
        <button type="button" className="crm-detail__close" onClick={onClose} aria-label="Đóng hồ sơ">×</button>
        <div className="crm-detail__hero">
          <span className="crm-avatar crm-avatar--lg">{getCustomerInitials(customer.name)}</span>
          <div>
            <h2>{customer.name}</h2>
            <p>{customer.phone || 'Thiếu SĐT'}</p>
            <span className={`crm-segment crm-segment--${customer.segment}`}>
              {badge} {segmentLabel}
              {customer.isVip && <span className="crm-vip-badge">VIP</span>}
            </span>
            {customer.healthScore != null && (
              <div className="crmg-health-wrap">
                <HealthBadge
                  score={customer.healthScore}
                  gradeLabel={customer.healthGradeLabel}
                  gradeId={customer.healthGradeId}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="crm-detail__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'crm-detail__tab--active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="crm-detail__body">
        {activeTab === 'overview' && (
          <>
            <section className="crm-detail__section">
              <div className="crm-detail__section-head">
                <h3>Thông tin cơ bản</h3>
                {canEdit && !editing && (
                  <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setEditing(true)}>Chỉnh sửa</button>
                )}
              </div>
              {editing ? (
                <div className="crm-detail__form">
                  <label><span>Họ tên</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                  <label><span>SĐT</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                  <label>
                    <span>Giới tính</span>
                    <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                      <option value="">—</option>
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                      <option value="Khác">Khác</option>
                    </select>
                  </label>
                  <label><span>Ngày sinh</span><input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></label>
                  <label><span>Nghề nghiệp</span><input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} /></label>
                  <label><span>Địa chỉ</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
                  <label className="crm-detail__form-full"><span>Ghi chú</span><textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
                  <div className="crm-detail__form-actions">
                    <button type="button" className="crm-btn crm-btn--primary" onClick={handleSaveProfile}>Lưu</button>
                    <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setEditing(false)}>Hủy</button>
                  </div>
                </div>
              ) : (
                <dl className="crm-detail__info">
                  <div><dt>Họ tên</dt><dd>{customer.name}</dd></div>
                  <div><dt>SĐT</dt><dd>{customer.phone || 'Thiếu SĐT'}</dd></div>
                  <div><dt>Giới tính</dt><dd>{customer.gender || '—'}</dd></div>
                  <div><dt>Ngày sinh</dt><dd>{formatDate(customer.dateOfBirth)}</dd></div>
                  <div><dt>Nghề nghiệp</dt><dd>{customer.occupation || '—'}</dd></div>
                  <div><dt>Địa chỉ</dt><dd>{customer.address || '—'}</dd></div>
                  <div className="crm-detail__info-full"><dt>Ghi chú</dt><dd>{customer.note || '—'}</dd></div>
                </dl>
              )}
            </section>

            <section className="crm-detail__section">
              <h3>Hồ sơ 360°</h3>
              <div className="crmg-360">
                <article><span>Health Score</span><strong>{customer.healthScore ?? '—'} · {customer.healthGradeLabel || '—'}</strong></article>
                <article><span>Tổng chi tiêu (LTV)</span><strong>{formatCurrency(customer.ltv ?? customer.totalSpend)}</strong></article>
                <article><span>Tần suất quay lại</span><strong>{Number(customer.avgVisitsPerMonth ?? 0).toFixed(1)} lần/tháng</strong></article>
                <article><span>Chu kỳ quay lại TB</span><strong>{customer.avgReturnCycleDays != null ? `${customer.avgReturnCycleDays} ngày` : '—'}</strong></article>
                <article><span>NV phục vụ chính</span><strong>{customer.primaryEmployeeName || customer.latestEmployeeName || '—'}</strong></article>
                <article><span>Dịch vụ yêu thích</span><strong>{customer.favoriteServiceName || '—'}</strong></article>
                <article><span>Khách yêu cầu</span><strong>{customer.requestedCount ?? 0} lần</strong></article>
                <article><span>Ghi chú chăm sóc</span><strong>{customer.note || '—'}</strong></article>
              </div>
            </section>

            <section className="crm-detail__section">
              <h3>Thống kê khách hàng</h3>
              <div className="crm-stats-grid">
                <article><span>Tổng lần sử dụng</span><strong>{customer.visitCount}</strong></article>
                <article><span>Doanh thu vé</span><strong>{formatCurrency(customer.totalTicketRevenue)}</strong></article>
                <article><span>Tổng Tips</span><strong>{formatCurrency(customer.totalTips)}</strong></article>
                <article><span>Tổng thanh toán</span><strong>{formatCurrency(customer.totalSpend)}</strong></article>
                <article><span>TB mỗi lần</span><strong>{formatCurrency(customer.avgSpendPerVisit)}</strong></article>
                <article><span>Lần đầu đến</span><strong>{formatDate(customer.firstVisitDate)}</strong></article>
                <article><span>Lần gần nhất</span><strong>{formatDate(customer.lastVisitDate)}</strong></article>
                <article><span>Ngày chưa quay lại</span><strong>{customer.daysSinceLastVisit} ngày</strong></article>
              </div>
            </section>
          </>
        )}

        {activeTab === 'value' && (
          <section className="crm-detail__section">
            <h3>Phân tích giá trị khách hàng</h3>
            <div className="crmg-360">
              <article><span>Tổng doanh thu theo khách</span><strong>{formatCurrency(value.totalRevenue ?? customer.totalTicketRevenue)}</strong></article>
              <article><span>DT trung bình / lần</span><strong>{formatCurrency(value.avgSpendPerVisit ?? customer.avgSpendPerVisit)}</strong></article>
              <article><span>Chu kỳ quay lại</span><strong>{value.avgReturnCycleDays != null ? `${value.avgReturnCycleDays} ngày` : '—'}</strong></article>
              <article><span>Dịch vụ mang nhiều DT nhất</span><strong>{value.topRevenueServiceName || '—'} · {formatCurrency(value.topRevenueServiceAmount ?? 0)}</strong></article>
              <article><span>NV phục vụ nhiều nhất</span><strong>{value.topEmployeeName || '—'} · {value.topEmployeeVisitCount ?? 0} lần</strong></article>
              <article><span>Tổng chi tiêu (LTV)</span><strong>{formatCurrency(value.totalSpend ?? customer.ltv)}</strong></article>
            </div>
          </section>
        )}

        {activeTab === 'timeline' && (
          <section className="crm-detail__section">
            <h3>Timeline khách hàng</h3>
            <p className="crmg-muted">Lần đầu · Hóa đơn · NV · Dịch vụ · Tips · Yêu cầu · Chăm sóc · Liên hệ lại</p>
            <ol className="crm-timeline">
              {timeline.map((entry) => (
                <li key={entry.id} className={`crm-timeline__item crm-timeline__item--${entry.type || 'invoice'}`}>
                  <div className="crm-timeline__dot" />
                  <div className="crm-timeline__card">
                    <header>
                      <strong>
                        {formatDate(entry.date)}
                        {entry.time ? ` · ${entry.time}` : ''}
                        {' · '}
                        {entry.typeLabel || 'Sự kiện'}
                      </strong>
                      {entry.invoice && (
                        <button type="button" className="crm-link" onClick={() => setViewInvoice(entry.invoice)}>Xem HĐ</button>
                      )}
                    </header>
                    <p>{entry.title || entry.employeeName}</p>
                    <p>{entry.branchName} · NV: {entry.employeeName || '—'}</p>
                    {entry.services ? <p className="crm-timeline__services">DV: {entry.services}</p> : null}
                    {(entry.type === TIMELINE_EVENT_TYPES.INVOICE || entry.type === TIMELINE_EVENT_TYPES.FIRST_VISIT) && (
                      <div className="crm-timeline__amounts">
                        <span>Vé: {formatCurrency(entry.ticketRevenue)}</span>
                        <span>Tips: {formatCurrency(entry.tips)}</span>
                        {entry.customerRequested && <span className="crmg-chip crmg-chip--info">Khách yêu cầu</span>}
                      </div>
                    )}
                    {entry.note ? <p className="crmg-muted">{entry.note}</p> : null}
                    {entry.followUpDate ? <p className="crmg-muted">Follow-up: {formatDate(entry.followUpDate)}</p> : null}
                  </div>
                </li>
              ))}
              {timeline.length === 0 && <li className="crm-ranking__empty">Chưa có sự kiện</li>}
            </ol>
          </section>
        )}

        {activeTab === 'services' && (
          <section className="crm-detail__section">
            <h3>Dịch vụ đã sử dụng</h3>
            <ul className="crm-ranking">
              {(customer.serviceStats || []).map((row) => (
                <li key={row.id}>
                  <span>{row.name}</span>
                  <strong>{row.count} lần · {formatCurrency(row.revenue ?? 0)}</strong>
                </li>
              ))}
              {(customer.serviceStats || []).length === 0 && <li className="crm-ranking__empty">Chưa có dịch vụ</li>}
            </ul>
          </section>
        )}

        {activeTab === 'employees' && (
          <section className="crm-detail__section">
            <h3>Nhân viên đã phục vụ</h3>
            <ul className="crm-ranking">
              {(customer.employeeStats || []).map((row) => (
                <li key={row.id || row.name}>
                  <span>{row.name}</span>
                  <strong>{row.count} lần</strong>
                </li>
              ))}
            </ul>
          </section>
        )}

        {activeTab === 'care' && canCare && (
          <CustomerCareTab customerKey={customer.key} onUpdated={onUpdated} />
        )}
      </div>

      {viewInvoice && (
        <InvoiceDetailModal
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
          canEdit={false}
        />
      )}
    </aside>
  )
}
