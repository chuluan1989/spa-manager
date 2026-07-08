import { Building2, ChevronRight, Users } from 'lucide-react'
import { formatCurrency } from '../../utils/invoice'

const STAT_ROWS = [
  { key: 'ticketRevenue', label: 'Doanh thu tiền vé', tone: 'neutral' },
  { key: 'commission', label: 'Hoa hồng', tone: 'commission' },
  { key: 'tips', label: 'Tips', tone: 'tips' },
  { key: 'bonus', label: 'Thưởng', tone: 'bonus' },
  { key: 'penalty', label: 'Phạt', tone: 'penalty' },
  { key: 'reduction', label: 'Giảm lương', tone: 'reduction' },
  { key: 'advance', label: 'Ứng lương', tone: 'advance' },
  { key: 'netSalary', label: 'Lương phải trả', tone: 'net' },
]

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
                {branch.payrollCount > 0 && ` · ${branch.payrollCount} có phát sinh lương`}
              </p>
            </div>
          </header>

          <dl className="salary-branch-card__stats">
            {STAT_ROWS.map((stat) => (
              <div key={stat.key} className={`salary-branch-card__stat salary-branch-card__stat--${stat.tone}`}>
                <dt>{stat.label}</dt>
                <dd>{formatCurrency(branch[stat.key] ?? 0)}</dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            className="salary-branch-card__cta"
            onClick={() => onSelectBranch?.(branch.branchId)}
          >
            Xem chi tiết
            <ChevronRight size={18} />
          </button>
        </article>
      ))}
    </div>
  )
}
