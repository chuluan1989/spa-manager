import { formatCurrency } from '../../utils/invoice'

const CARDS = [
  { key: 'baseSalary', label: 'Quỹ lương cơ bản', variant: 'neutral' },
  { key: 'tips', label: 'Tổng Tips', variant: 'tips' },
  { key: 'bonus', label: 'Tổng thưởng', variant: 'bonus' },
  { key: 'penalty', label: 'Tổng phạt', variant: 'penalty' },
  { key: 'advance', label: 'Tổng ứng lương', variant: 'advance' },
  { key: 'reduction', label: 'Tổng giảm lương', variant: 'reduction' },
  { key: 'netSalary', label: 'Lương thực nhận', variant: 'net' },
]

export default function PayrollDashboard({ dashboard, employeeCount }) {
  return (
    <section className="salary-dashboard">
      <div className="salary-dashboard__meta">
        <span>{employeeCount} nhân viên trong bảng lương</span>
      </div>
      <div className="salary-dashboard__grid">
        {CARDS.map((card) => (
          <article key={card.key} className={`salary-stat salary-stat--${card.variant}`}>
            <span className="salary-stat__label">{card.label}</span>
            <strong className="salary-stat__value">{formatCurrency(dashboard?.[card.key] ?? 0)}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}
