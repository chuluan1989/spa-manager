import { formatCurrency } from '../../utils/invoice'
import CostShareChart from '../expenses/CostShareChart'
import './BranchProfitBreakdown.css'

export default function BranchProfitBreakdown({ breakdown, branchName = '' }) {
  if (!breakdown) return null

  return (
    <section className="branch-profit">
      <div className="branch-profit__head">
        <h3>Báo cáo lợi nhuận{branchName ? ` — ${branchName}` : ''}</h3>
        <p>
          Lợi nhuận = (Doanh thu + Tips) − (Lương + Chi phí mặt bằng + Chi phí phát sinh)
        </p>
      </div>

      <div className="branch-profit__kpi-grid">
        <div className="branch-profit__kpi">
          <span>Doanh thu</span>
          <strong>{formatCurrency(breakdown.ticketRevenue)}</strong>
        </div>
        <div className="branch-profit__kpi">
          <span>Tips</span>
          <strong>{formatCurrency(breakdown.tips)}</strong>
        </div>
        <div className="branch-profit__kpi">
          <span>Tổng doanh thu</span>
          <strong>{formatCurrency(breakdown.actualRevenue)}</strong>
        </div>
        <div className="branch-profit__kpi">
          <span>Lương</span>
          <strong>{formatCurrency(breakdown.totalSalary)}</strong>
        </div>
        <div className="branch-profit__kpi">
          <span>Chi phí mặt bằng</span>
          <strong>{formatCurrency(breakdown.rent)}</strong>
        </div>
        <div className="branch-profit__kpi">
          <span>Chi phí phát sinh</span>
          <strong>{formatCurrency(breakdown.variableTotal)}</strong>
        </div>
        <div className="branch-profit__kpi">
          <span>Tổng chi phí</span>
          <strong>{formatCurrency(breakdown.totalCosts)}</strong>
        </div>
        <div className={`branch-profit__kpi ${breakdown.profit >= 0 ? 'is-profit' : 'is-loss'}`}>
          <span>Lợi nhuận</span>
          <strong>{formatCurrency(breakdown.profit)}</strong>
        </div>
      </div>

      <div className="branch-profit__panels">
        <div className="branch-profit__panel">
          <h4>Chi tiết chi phí</h4>
          <table className="branch-profit__table">
            <thead>
              <tr>
                <th>Khoản mục</th>
                <th className="is-money">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.label}</td>
                  <td className="is-money">{formatCurrency(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CostShareChart
          lines={breakdown.costShareLines}
          title="Biểu đồ tỷ trọng chi phí"
        />
      </div>
    </section>
  )
}
