import { formatCurrency } from '../../utils/invoice'
import { getBranchEmployeeCount } from '../../utils/adminDashboardStats'
import './BranchDashboardCard.css'

export default function BranchDashboardCard({ branch, onOpenReport }) {
  const employeeCount = getBranchEmployeeCount(branch.branchId)

  return (
    <button
      type="button"
      className="branch-dashboard-card"
      onClick={() => onOpenReport?.(branch.branchId)}
    >
      <h3 className="branch-dashboard-card__title">{branch.displayName}</h3>
      <div className="branch-dashboard-card__grid">
        <div>
          <span>Doanh thu hôm nay</span>
          <strong>{formatCurrency(branch.todayRevenue)}</strong>
        </div>
        <div>
          <span>Doanh thu tháng</span>
          <strong>{formatCurrency(branch.monthRevenue)}</strong>
        </div>
        <div>
          <span>Số hóa đơn</span>
          <strong>{branch.invoiceCount}</strong>
        </div>
        <div>
          <span>Số NV làm</span>
          <strong>{branch.activeEmployeesMonth || employeeCount}</strong>
        </div>
        <div>
          <span>Tips tháng</span>
          <strong>{formatCurrency(branch.tips)}</strong>
        </div>
        <div>
          <span>Lợi nhuận tạm tính</span>
          <strong className="branch-dashboard-card__profit">{formatCurrency(branch.profit)}</strong>
        </div>
      </div>
      <p className="branch-dashboard-card__hint">Bấm để xem báo cáo chi tiết chi nhánh</p>
    </button>
  )
}
