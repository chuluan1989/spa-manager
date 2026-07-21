import { formatCurrency } from '../../utils/invoice'
import { PAYROLL_DETAIL_LABELS } from '../../constants/payrollTypes'

const KPI_ROWS = [
  ['grossBeforeDeduction', 'neutral'],
  ['baseSalary', 'neutral'],
  ['workDays', 'neutral'],
  ['ticketRevenue', 'revenue'],
  ['commission', 'commission'],
  ['tips', 'tips'],
  ['bonus', 'bonus'],
  ['penalty', 'penalty'],
  ['reduction', 'reduction'],
  ['advance', 'advance'],
  ['otherAdjustment', 'neutral'],
  ['paidAmount', 'paid'],
  ['remainingAmount', 'remaining'],
  ['provisionalNet', 'net'],
]

function formatWorkDays(value) {
  if (value === undefined || value === null) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export default function PayrollLiveDashboard({ stats, attendanceStats }) {
  if (!stats) return null

  const displayStats = {
    ...stats,
    grossBeforeDeduction: stats.grossBeforeDeduction ?? (
      (stats.baseSalary ?? 0) + (stats.commission ?? 0) + (stats.tips ?? 0) + (stats.bonus ?? 0)
      - (stats.reduction ?? 0) - (stats.penalty ?? 0)
    ),
    workDays: attendanceStats?.workDays ?? 0,
    paidAmount: stats.paidAmount ?? 0,
    remainingAmount: stats.remainingAmount ?? stats.netSalary ?? 0,
    provisionalNet: stats.provisionalNet ?? stats.netSalary ?? 0,
  }

  return (
    <section className="salary-live-dashboard">
      <div className="salary-live-dashboard__grid">
        {KPI_ROWS.map(([key, tone]) => (
          <article key={key} className={`salary-live-dashboard__card salary-live-dashboard__card--${tone}`}>
            <span>{key === 'workDays' ? 'Ngày công' : PAYROLL_DETAIL_LABELS[key] ?? key}</span>
            <strong>
              {key === 'workDays'
                ? formatWorkDays(displayStats.workDays)
                : formatCurrency(displayStats[key] ?? 0)}
            </strong>
          </article>
        ))}
      </div>
    </section>
  )
}
