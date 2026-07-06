import './StatCard.css'

export default function StatCard({ title, value, icon, variant = 'blue' }) {
  return (
    <div className={`stat-card stat-card--${variant}`}>
      <div className="stat-card__content">
        <p className="stat-card__title">{title}</p>
        <p className="stat-card__value">{value}</p>
      </div>
      <div className="stat-card__icon">{icon}</div>
    </div>
  )
}
