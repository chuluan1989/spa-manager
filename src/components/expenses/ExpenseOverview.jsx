import {
  Building2,
  Calendar,
  Layers,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import KpiCard from '../ui/KpiCard'
import { formatCurrency } from '../../utils/invoice'
import './ExpenseModules.css'

export default function ExpenseOverview({
  overview,
  onDrillTotal,
  onDrillToday,
  onDrillMonth,
  onDrillTopBranch,
  onDrillTopType,
  onDrillRatio,
}) {
  return (
    <section className="exp-mod__overview">
      <div className="exp-mod__kpi-grid">
        <KpiCard
          label="Tổng chi phí toàn hệ thống"
          value={formatCurrency(overview.total)}
          icon={Wallet}
          variant="gold"
          onClick={onDrillTotal}
          size="lg"
        />
        <KpiCard
          label="Chi phí hôm nay"
          value={formatCurrency(overview.today)}
          icon={Calendar}
          variant="blue"
          onClick={onDrillToday}
        />
        <KpiCard
          label="Chi phí tháng này"
          value={formatCurrency(overview.month)}
          icon={TrendingUp}
          variant="orange"
          onClick={onDrillMonth}
        />
        <KpiCard
          label="Tỷ trọng chi phí / doanh thu"
          value={overview.expenseRatio != null ? `${overview.expenseRatio.toFixed(1)}%` : '—'}
          icon={Layers}
          variant="purple"
          onClick={onDrillRatio}
          hint="Tháng hiện tại"
        />
        <KpiCard
          label="Chi nhánh CP cao nhất"
          value={overview.topBranch ? overview.topBranch.branchName : '—'}
          icon={Building2}
          variant="slate"
          onClick={onDrillTopBranch}
          hint={overview.topBranch ? formatCurrency(overview.topBranch.total) : ''}
        />
        <KpiCard
          label="Nhóm chi phí cao nhất"
          value={overview.topType ? overview.topType.label : '—'}
          icon={Wallet}
          variant="green"
          onClick={onDrillTopType}
          hint={overview.topType ? formatCurrency(overview.topType.total) : ''}
        />
      </div>
    </section>
  )
}
