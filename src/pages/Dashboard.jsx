import KhoeSpaLogo from '../components/brand/KhoeSpaLogo'
import StatCard from '../components/dashboard/StatCard'
import BranchDashboardCard from '../components/dashboard/BranchDashboardCard'
import { formatCurrency } from '../utils/invoice'
import { loadInvoices } from '../utils/invoiceStorage'
import { loadExpenses } from '../utils/expenseStorage'
import { computeDashboardStats } from '../utils/dashboardStats'
import { computeAdminDashboardStats } from '../utils/adminDashboardStats'
import { getCurrentUserName, isAdmin, isEmployee } from '../constants/auth'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import { setReportPrefill } from '../utils/navigationPrefill'
import './Dashboard.css'

export default function Dashboard({ onNavigate }) {
  useDataSyncVersion()
  const invoices = loadInvoices()
  const expenses = loadExpenses()
  const stats = computeDashboardStats(invoices, expenses)
  const adminStats = isAdmin() ? computeAdminDashboardStats(invoices, expenses) : null

  const handleOpenBranchReport = (branchId) => {
    setReportPrefill({ branchId, fromDate: '', toDate: '' })
    onNavigate?.('reports')
  }

  const employeeCards = [
    {
      title: 'Doanh thu hôm nay',
      value: formatCurrency(stats.todayRevenue),
      variant: 'blue',
    },
    {
      title: 'Doanh thu tháng',
      value: formatCurrency(stats.monthRevenue),
      variant: 'green',
    },
    {
      title: 'Hóa đơn hôm nay',
      value: String(stats.todayInvoiceCount),
      variant: 'slate',
    },
  ]

  const adminCards = adminStats ? [
    { title: 'Doanh thu hôm nay', value: formatCurrency(adminStats.todayRevenue), variant: 'blue' },
    { title: 'Doanh thu tháng', value: formatCurrency(adminStats.monthRevenue), variant: 'green' },
    { title: 'Hóa đơn hôm nay', value: String(adminStats.todayInvoiceCount), variant: 'slate' },
    { title: 'Hóa đơn tháng', value: String(adminStats.monthInvoiceCount), variant: 'slate' },
    { title: 'Tổng Tips tháng', value: formatCurrency(adminStats.monthTips), variant: 'orange' },
    { title: 'Tổng hoa hồng tháng', value: formatCurrency(adminStats.monthCommission), variant: 'purple' },
    { title: 'Tổng lương phải trả', value: formatCurrency(adminStats.monthSalaryDue), variant: 'purple' },
    { title: 'Tổng nhân viên đang làm', value: String(adminStats.totalActiveEmployees), variant: 'slate' },
    { title: 'Tổng khách hôm nay', value: String(adminStats.todayCustomers), variant: 'blue' },
  ] : []

  const managerCards = [
    { title: 'Doanh thu hôm nay', value: formatCurrency(stats.todayRevenue), variant: 'blue' },
    { title: 'Doanh thu tháng', value: formatCurrency(stats.monthRevenue), variant: 'green' },
    { title: 'Chi phí tháng', value: formatCurrency(stats.monthExpenses), variant: 'orange' },
    { title: 'Hoa hồng tháng', value: formatCurrency(stats.monthCommission), variant: 'purple' },
    { title: 'Lợi nhuận tháng', value: formatCurrency(stats.monthProfit), variant: 'purple' },
    { title: 'Hóa đơn hôm nay', value: String(stats.todayInvoiceCount), variant: 'slate' },
  ]

  const cards = isAdmin() ? adminCards : isEmployee() ? employeeCards : managerCards

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__header-main">
          <KhoeSpaLogo size={44} className="dashboard__logo" />
          <div>
            <h2 className="dashboard__title">Dashboard</h2>
            <p className="dashboard__subtitle">
            {isAdmin()
              ? 'Tổng quan quản trị toàn hệ thống — doanh thu theo giá thực thu'
              : isEmployee()
                ? `Tổng quan doanh số — ${getCurrentUserName()}`
                : 'Tổng quan hoạt động chi nhánh'}
            </p>
          </div>
        </div>
      </header>

      <div className="dashboard__stats">
        {cards.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {isAdmin() && adminStats && (
        <section className="dashboard__branches">
          <h3 className="dashboard__branches-title">Doanh thu theo từng chi nhánh</h3>
          <div className="dashboard__branch-grid">
            {adminStats.branchCards.map((branch) => (
              <BranchDashboardCard
                key={branch.branchId}
                branch={branch}
                onOpenReport={handleOpenBranchReport}
              />
            ))}
          </div>
        </section>
      )}

      {!isEmployee() && !isAdmin() && (stats.topService || stats.topEmployee || stats.topBranch) && (
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
          {stats.topBranch && (
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
