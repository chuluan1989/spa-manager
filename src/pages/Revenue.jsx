import { useMemo, useState } from 'react'
import BranchBanner from '../components/common/BranchBanner'
import { useDrillDownData, buildDefaultDrillFilters } from '../hooks/useDrillDownData'
import {
  canSelectBranch,
  getCurrentUserBranch,
  getCurrentUserBranchName,
} from '../constants/auth'
import { loadBranches } from '../constants/branches'
import { formatCurrency } from '../utils/invoice'
import { buildDrillDownSummary } from '../utils/drillDownReport'
import './Revenue.css'

export default function Revenue() {
  const [filters, setFilters] = useState(() => buildDefaultDrillFilters())
  const lockedBranch = !canSelectBranch()

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      branchId: lockedBranch ? getCurrentUserBranch() : filters.branchId,
    }),
    [filters, lockedBranch],
  )

  const { invoices, expenses, loading, error } = useDrillDownData(effectiveFilters)

  const report = useMemo(
    () => buildDrillDownSummary(invoices, expenses, effectiveFilters),
    [invoices, expenses, effectiveFilters],
  )

  const updateFilter = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const summaryCards = [
    { label: 'Doanh thu tiền vé', value: formatCurrency(report.ticketRevenue ?? 0), variant: 'blue' },
    { label: 'Tips', value: formatCurrency(report.tips ?? 0), variant: 'orange' },
    { label: 'Tổng khách thanh toán', value: formatCurrency(report.customerTotal ?? 0), variant: 'slate' },
    { label: 'Hoa hồng', value: formatCurrency(report.commission ?? 0), variant: 'purple' },
    { label: 'Chi phí', value: formatCurrency(report.expenses ?? 0), variant: 'orange' },
    { label: 'Lợi nhuận dự kiến', value: formatCurrency(report.profit ?? 0), variant: 'green' },
  ]

  return (
    <div className="revenue-page">
      <header className="revenue-page__header">
        <div>
          <h2 className="revenue-page__title">Doanh thu</h2>
          <p className="revenue-page__subtitle">Cùng nguồn dữ liệu với Dashboard và Báo cáo (Supabase + đồng bộ).</p>
        </div>
      </header>

      <section className="revenue-page__filters">
        {lockedBranch && (
          <div className="revenue-page__field revenue-page__field--banner">
            <BranchBanner branchName={getCurrentUserBranchName()} />
          </div>
        )}

        <label className="revenue-page__field">
          <span>Từ ngày</span>
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => updateFilter('fromDate', e.target.value)}
          />
        </label>

        <label className="revenue-page__field">
          <span>Đến ngày</span>
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => updateFilter('toDate', e.target.value)}
          />
        </label>

        {!lockedBranch && (
          <label className="revenue-page__field">
            <span>Chi nhánh</span>
            <select
              value={filters.branchId}
              onChange={(e) => updateFilter('branchId', e.target.value)}
            >
              <option value="">Tất cả</option>
              {loadBranches().map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}
      </section>

      {loading && <p className="revenue-page__loading">Đang tải dữ liệu…</p>}
      {error && <p className="revenue-page__error">{error}</p>}

      {!loading && (
        <section className="revenue-page__cards">
          {summaryCards.map((card) => (
            <article key={card.label} className={`revenue-card revenue-card--${card.variant}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
