export default function ErpPageHeader({ title, subtitle, badge, actions }) {
  return (
    <header className="erp-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="erp-header__actions">
        {badge && (
          <div className="erp-header__badge">
            <span>{badge.value}</span>
            <small>{badge.label}</small>
          </div>
        )}
        {actions}
      </div>
    </header>
  )
}
