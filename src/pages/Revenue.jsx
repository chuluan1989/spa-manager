import { useMemo, useState } from 'react'
import BranchBanner from '../components/common/BranchBanner'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import {
  canSelectBranch,
  getCurrentUserBranch,
  getCurrentUserBranchName,
  isAdmin,
} from '../constants/auth'
import { loadBranches } from '../constants/branches'
import { formatCurrency } from '../utils/invoice'
import { loadInvoices, getTodayDate, getMonthStartDate } from '../utils/invoiceStorage'
import { loadExpenses } from '../utils/expenseStorage'
import { computeReportData } from '../utils/report'
import './Revenue.css'

const INITIAL_FILTERS = () => ({
  fromDate: getMonthStartDate(),
  toDate: getTodayDate(),
  branchId: canSelectBranch() ? '' : getCurrentUserBranch(),
  employeeId: '',
  discountFilter: '',
})

export default function Revenue() {
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const lockedBranch = !canSelectBranch()
  const syncVersion = useDataSyncVersion()

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      branchId: lockedBranch ? getCurrentUserBranch() : filters.branchId,
    }),
    [filters, lockedBranch],
  )

  const report = useMemo(
    () => computeReportData(loadInvoices(), loadExpenses(), effectiveFilters),
    [effectiveFilters, syncVersion],
  )

  const updateFilter = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const summaryCards = [
    { label: 'Tổng doanh thu', value: formatCurrency(report.summary.revenue), variant: 'blue' },
    { label: 'Tổng thanh toán', value: formatCurrency(report.summary.serviceTotal), variant: 'slate' },
    { label: 'Tổng tips', value: formatCurrency(report.summary.tips), variant: 'orange' },
    { label: 'Tổng hoa hồng', value: formatCurrency(report.summary.commission), variant: 'purple' },
    { label: 'Số hóa đơn', value: String(report.summary.invoiceCount), variant: 'slate' },
  ]

  return (
    <div className="revenue-page">
      <header className="revenue-page__header">
        <div>
          <h2 className="revenue-page__title">Doanh thu</h2>
          <p className="revenue-page__subtitle">
            {isAdmin()
              ? 'Theo dõi doanh thu toàn hệ thống theo giá thực thu (sau giảm giá)'
              : 'Theo dõi doanh thu chi nhánh theo giá thực thu (sau giảm giá)'}
          </p>
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
          <input type="date" value={filters.fromDate} onChange={(e) => updateFilter('fromDate', e.target.value)} />
        </label>
        <label className="revenue-page__field">
          <span>Đến ngày</span>
          <input type="date" value={filters.toDate} onChange={(e) => updateFilter('toDate', e.target.value)} />
        </label>
        {canSelectBranch() && (
          <label className="revenue-page__field">
            <span>Chi nhánh</span>
            <select value={filters.branchId} onChange={(e) => updateFilter('branchId', e.target.value)}>
              <option value="">Tất cả chi nhánh</option>
              {loadBranches().map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="revenue-page__field">
          <span>Khuyến mãi</span>
          <select value={filters.discountFilter} onChange={(e) => updateFilter('discountFilter', e.target.value)}>
            <option value="">Tất cả hóa đơn</option>
            <option value="with">Chỉ có giảm giá</option>
            <option value="without">Không giảm giá</option>
          </select>
        </label>
      </section>

      <section className="revenue-page__summary">
        {summaryCards.map((card) => (
          <div key={card.label} className={`revenue-card revenue-card--${card.variant}`}>
            <p className="revenue-card__label">{card.label}</p>
            <p className="revenue-card__value">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="revenue-page__table-card">
        <h3>Doanh thu theo chi nhánh</h3>
        {report.byBranch.length === 0 ? (
          <p className="revenue-page__empty">Không có dữ liệu trong khoảng thời gian đã chọn.</p>
        ) : (
          <div className="revenue-page__table-wrap">
            <table className="revenue-page__table">
              <thead>
                <tr>
                  <th>Chi nhánh</th>
                  <th>Số HĐ</th>
                  <th>Doanh thu</th>
                  <th>Tips</th>
                  <th>Hoa hồng</th>
                  <th>Lợi nhuận</th>
                </tr>
              </thead>
              <tbody>
                {report.byBranch.map((row) => (
                  <tr key={row.branchId || row.branchName}>
                    <td>{row.branchName}</td>
                    <td>{row.invoiceCount}</td>
                    <td>{formatCurrency(row.revenue)}</td>
                    <td>{formatCurrency(row.tips)}</td>
                    <td>{formatCurrency(row.commission)}</td>
                    <td>{formatCurrency(row.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
