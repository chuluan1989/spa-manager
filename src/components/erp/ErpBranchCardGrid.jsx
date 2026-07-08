import { Building2, ChevronRight, Users } from 'lucide-react'

export default function ErpBranchCardGrid({ branches = [], onSelectBranch, renderStat }) {
  if (!branches.length) {
    return <p className="erp-empty">Không có chi nhánh trong phạm vi.</p>
  }

  const defaultStats = (branch) => [
    { label: 'Doanh thu tiền vé', value: branch.ticketRevenue, tone: 'neutral' },
    { label: 'Tips', value: branch.tips, tone: 'tips' },
    { label: 'Hoa hồng', value: branch.commission, tone: 'commission' },
    { label: 'Thực nhận / Tổng', value: branch.netSalary ?? branch.total, tone: 'net' },
  ]

  return (
    <div className="erp-branch-grid">
      {branches.map((branch) => {
        const stats = renderStat ? renderStat(branch) : defaultStats(branch)
        return (
          <article key={branch.branchId ?? branch.id} className="erp-branch-card">
            <header className="erp-branch-card__head">
              <div className="erp-branch-card__icon">
                <Building2 size={20} strokeWidth={1.75} />
              </div>
              <div>
                <h3>{branch.branchName ?? branch.name}</h3>
                <p>
                  <Users size={14} />
                  {branch.employeeCount ?? branch.count ?? 0} {branch.countLabel ?? 'nhân viên'}
                </p>
              </div>
            </header>

            <dl className="erp-branch-card__stats">
              {stats.map((stat) => (
                <div key={stat.label} className={`erp-branch-card__stat erp-branch-card__stat--${stat.tone ?? 'neutral'}`}>
                  <dt>{stat.label}</dt>
                  <dd>{stat.formatted ?? stat.value}</dd>
                </div>
              ))}
            </dl>

            <button
              type="button"
              className="erp-branch-card__cta"
              onClick={() => onSelectBranch?.(branch.branchId ?? branch.id)}
            >
              Xem chi tiết
              <ChevronRight size={18} />
            </button>
          </article>
        )
      })}
    </div>
  )
}
