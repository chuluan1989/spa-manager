import StatCard from '../components/dashboard/StatCard'
import { formatCurrency } from '../utils/invoice'
import { loadInvoices } from '../utils/invoiceStorage'
import { loadExpenses } from '../utils/expenseStorage'
import { computeDashboardStats } from '../utils/dashboardStats'
import { getCurrentUserName, isAdmin, isEmployee } from '../constants/auth'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import './Dashboard.css'

export default function Dashboard() {
  // Chỉ dùng để kích hoạt re-render khi có dữ liệu mới từ Supabase — dữ
  // liệu hiển thị vẫn luôn đọc trực tiếp từ LocalStorage bên dưới.
  useDataSyncVersion()
  const invoices = loadInvoices()
  const expenses = loadExpenses()
  const stats = computeDashboardStats(invoices, expenses)

  const cards = [
    {
      title: 'Doanh thu hôm nay',
      value: formatCurrency(stats.todayRevenue),
      variant: 'blue',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      title: 'Doanh thu tháng',
      value: formatCurrency(stats.monthRevenue),
      variant: 'green',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      title: 'Chi phí tháng',
      value: formatCurrency(stats.monthExpenses),
      variant: 'orange',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="4" width="22" height="16" rx="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      ),
    },
    {
      title: 'Hoa hồng tháng',
      value: formatCurrency(stats.monthCommission),
      variant: 'purple',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      title: 'Lợi nhuận tháng',
      value: formatCurrency(stats.monthProfit),
      variant: 'purple',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      ),
    },
    {
      title: 'Hóa đơn hôm nay',
      value: String(stats.todayInvoiceCount),
      variant: 'slate',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
  ]

  const visibleCards = isEmployee()
    ? cards.filter((card) => card.title !== 'Chi phí tháng' && card.title !== 'Lợi nhuận tháng')
    : cards

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <h2 className="dashboard__title">Dashboard</h2>
          <p className="dashboard__subtitle">
            {isEmployee()
              ? `Tổng quan doanh số — ${getCurrentUserName()}`
              : 'Tổng quan hoạt động spa'}
          </p>
        </div>
      </header>

      <div className="dashboard__stats">
        {visibleCards.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {!isEmployee() && (stats.topService || stats.topEmployee || stats.topBranch) && (
        <section className="dashboard__highlights">
          {stats.topService && (
            <div className="dashboard__highlight">
              <p className="dashboard__highlight-label">Dịch vụ bán chạy</p>
              <p className="dashboard__highlight-value">
                {stats.topService.serviceName} — {stats.topService.count} lượt
              </p>
            </div>
          )}
          {stats.topEmployee && (
            <div className="dashboard__highlight">
              <p className="dashboard__highlight-label">Nhân viên doanh thu cao nhất</p>
              <p className="dashboard__highlight-value">
                {stats.topEmployee.employeeName} — {formatCurrency(stats.topEmployee.revenue)}
              </p>
            </div>
          )}
          {isAdmin() && stats.topBranch && (
            <div className="dashboard__highlight">
              <p className="dashboard__highlight-label">Chi nhánh doanh thu cao nhất</p>
              <p className="dashboard__highlight-value">
                {stats.topBranch.branchName} — {formatCurrency(stats.topBranch.revenue)}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
