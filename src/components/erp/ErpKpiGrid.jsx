export default function ErpKpiGrid({ items = [] }) {
  if (!items.length) return null

  return (
    <div className="erp-kpi-grid">
      {items.map((item) => {
        const className = `erp-kpi erp-kpi--${item.tone ?? 'neutral'}${item.onClick ? ' erp-kpi--clickable' : ''}`
        const body = (
          <>
            <span className="erp-kpi__label">{item.label}</span>
            <strong className="erp-kpi__value">{item.value}</strong>
          </>
        )

        if (item.onClick) {
          return (
            <button key={item.id ?? item.label} type="button" className={className} onClick={item.onClick}>
              {body}
            </button>
          )
        }

        return (
          <article key={item.id ?? item.label} className={className}>
            {body}
          </article>
        )
      })}
    </div>
  )
}
