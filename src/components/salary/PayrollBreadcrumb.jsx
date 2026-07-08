export default function PayrollBreadcrumb({ items, onNavigate }) {
  if (!items?.length) return null

  return (
    <nav className="salary-breadcrumb" aria-label="Điều hướng lương">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={item.id} className="salary-breadcrumb__item">
            {index > 0 && <span className="salary-breadcrumb__sep">›</span>}
            {isLast || !item.level ? (
              <span className="salary-breadcrumb__current">{item.label}</span>
            ) : (
              <button type="button" onClick={() => onNavigate?.(item.level, item.meta)}>
                {item.label}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
