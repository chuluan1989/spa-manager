import { Building2, ChevronRight, Users } from 'lucide-react'
import { formatCurrency } from '../../utils/invoice'

const STAT_ROWS = [
  { key: 'employeeCount', label: 'Tổng nhân viên', format: 'count' },
  { key: 'provisionalSalary', label: 'Tổng lương tạm tính', format: 'currency' },
  { key: 'ticketRevenue', label: 'Tổng doanh thu', format: 'currency' },
  { key: 'tips', label: 'Tổng Tips', format: 'currency', tone: 'tips' },
]

function formatStatValue(key, format, value) {
  if (format === 'count') return String(value ?? 0)
  return formatCurrency(value ?? 0)
}

export default function PayrollBranchGrid({ branches, onSelectBranch }) {
  if (!branches.length) {
    return <p className="salary-page__empty">Không có chi nhánh trong phạm vi.</p>
  }

  return (
    <div className="salary-branch-grid">
      {branches.map((branch) => (
        <article key={branch.branchId} className="salary-branch-card">
          <header className="salary-branch-card__head">
            <div className="salary-branch-card__icon">
              <Building2 size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h3>{branch.branchName}</h3>
              <p>
                <Users size={14} />
                {branch.employeeCount} nhân viên
              </p>
            </div>
          </header>

          <dl className="salary-branch-card__stats salary-branch-card__stats--compact">
            {STAT_ROWS.map((stat) => (
              <div
                key={stat.key}
                className={`salary-branch-card__stat${stat.tone ? ` salary-branch-card__stat--${stat.tone}` : ''}`}
              >
                <dt>{stat.label}</dt>
                <dd>{formatStatValue(stat.key, stat.format, branch[stat.key])}</dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            className="salary-branch-card__cta"
            onClick={() => onSelectBranch?.(branch.branchId)}
          >
            Xem nhân viên
            <ChevronRight size={18} />
          </button>
        </article>
      ))}
    </div>
  )
}
