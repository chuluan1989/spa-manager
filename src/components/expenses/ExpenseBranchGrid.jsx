import { getActiveBranches } from '../../constants/branches'
import { BRANCH_CONTACTS } from '../../constants/branchContacts'
import { formatCurrency } from '../../utils/invoice'
import './ExpenseModules.css'

export function getBranchShortLabel(branch, index) {
  return BRANCH_CONTACTS[index]?.label ?? branch.name
}

export default function ExpenseBranchGrid({ rows, onSelectBranch, activeBranchId = '' }) {
  const branches = getActiveBranches()

  const mergedRows = branches.map((branch, index) => {
    const stats = rows.find((row) => row.branchId === branch.id)
    return {
      branchId: branch.id,
      branchName: branch.name,
      shortLabel: getBranchShortLabel(branch, index),
      total: stats?.total ?? 0,
      count: stats?.count ?? 0,
      todayTotal: stats?.todayTotal ?? 0,
      monthTotal: stats?.total ?? 0,
      expenseRatio: stats?.expenseRatio,
      anomalyNote: stats?.anomalyNote ?? '',
    }
  })

  return (
    <section className="exp-mod__section">
      <div className="exp-mod__section-head">
        <h3 className="exp-mod__section-title">Chi phí theo chi nhánh</h3>
        <p className="exp-mod__section-desc">Bấm vào chi nhánh để xem chi tiết theo ngày và từng khoản chi</p>
      </div>
      <div className="exp-mod__branch-grid">
        {mergedRows.map((row) => (
          <button
            key={row.branchId}
            type="button"
            className={`exp-mod__branch-card ${activeBranchId === row.branchId ? 'is-active' : ''}`}
            onClick={() => onSelectBranch(row.branchId)}
          >
            <div className="exp-mod__branch-card-head">
              <span className="exp-mod__branch-code">{row.shortLabel}</span>
              <span className="exp-mod__branch-name">{row.branchName}</span>
            </div>
            <div className="exp-mod__branch-metrics">
              <div>
                <span>Tổng chi phí tháng</span>
                <strong>{formatCurrency(row.monthTotal)}</strong>
              </div>
              <div>
                <span>Số khoản chi</span>
                <strong>{row.count}</strong>
              </div>
              <div>
                <span>Hôm nay</span>
                <strong>{formatCurrency(row.todayTotal)}</strong>
              </div>
              <div>
                <span>CP / DT</span>
                <strong>{row.expenseRatio != null ? `${row.expenseRatio.toFixed(1)}%` : '—'}</strong>
              </div>
            </div>
            {row.anomalyNote && (
              <p className="exp-mod__branch-alert">{row.anomalyNote}</p>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
