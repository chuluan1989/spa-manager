export default function ErpBreadcrumb({ items = [], onNavigate }) {
  if (!items.length) return null

  return (
    <nav className="erp-breadcrumb" aria-label="Điều hướng">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={item.id ?? item.label} className="erp-breadcrumb__item">
            {index > 0 && <span className="erp-breadcrumb__sep">›</span>}
            {isLast || !item.onClick ? (
              <span className="erp-breadcrumb__current">{item.label}</span>
            ) : (
              <button type="button" onClick={() => onNavigate?.(item) ?? item.onClick?.()}>
                {item.label}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
