import './KpiCard.css'

const VARIANTS = {
  gold: { iconBg: 'rgba(212, 175, 55, 0.12)', iconColor: '#B8962E' },
  blue: { iconBg: 'rgba(37, 99, 235, 0.1)', iconColor: '#2563EB' },
  green: { iconBg: 'rgba(5, 150, 105, 0.1)', iconColor: '#059669' },
  purple: { iconBg: 'rgba(124, 58, 237, 0.1)', iconColor: '#7C3AED' },
  orange: { iconBg: 'rgba(217, 119, 6, 0.1)', iconColor: '#D97706' },
  slate: { iconBg: 'rgba(107, 114, 128, 0.1)', iconColor: '#6B7280' },
}

export default function KpiCard({
  label,
  value,
  icon: Icon,
  variant = 'gold',
  onClick,
  active = false,
  hint = 'Xem chi tiết →',
  delay = 0,
}) {
  const tone = VARIANTS[variant] ?? VARIANTS.gold
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`kpi-card ${onClick ? 'kpi-card--clickable' : ''} ${active ? 'kpi-card--active' : ''}`}
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="kpi-card__icon" style={{ background: tone.iconBg, color: tone.iconColor }}>
        {Icon && <Icon size={20} strokeWidth={2} />}
      </div>
      <div className="kpi-card__content">
        <span className="kpi-card__label">{label}</span>
        <strong className="kpi-card__value">{value}</strong>
        {onClick && hint && <span className="kpi-card__hint">{hint}</span>}
      </div>
    </Tag>
  )
}
