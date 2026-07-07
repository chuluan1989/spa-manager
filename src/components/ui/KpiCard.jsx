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
  trend = null,
  size = 'default',
}) {
  const tone = VARIANTS[variant] ?? VARIANTS.gold
  const Tag = onClick ? 'button' : 'div'

  const trendLabel = trend?.direction === 'up'
    ? `+${trend.percent}%`
    : trend?.direction === 'down'
      ? `−${trend.percent}%`
      : '—'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={[
        'kpi-card',
        onClick ? 'kpi-card--clickable' : '',
        active ? 'kpi-card--active' : '',
        size === 'lg' ? 'kpi-card--lg' : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="kpi-card__icon" style={{ background: tone.iconBg, color: tone.iconColor }}>
        {Icon && <Icon size={size === 'lg' ? 24 : 20} strokeWidth={2} />}
      </div>
      <div className="kpi-card__content">
        <span className="kpi-card__label">{label}</span>
        <strong className="kpi-card__value">{value}</strong>
        {trend && (
          <span className={`kpi-card__trend kpi-card__trend--${trend.direction}`}>
            {trendLabel}
            <span className="kpi-card__trend-note">so với kỳ trước</span>
          </span>
        )}
        {onClick && hint && <span className="kpi-card__hint">{hint}</span>}
      </div>
    </Tag>
  )
}
