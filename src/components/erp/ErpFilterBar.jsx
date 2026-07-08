export default function ErpFilterBar({ children, actions }) {
  return (
    <div className="erp-filter-bar">
      {children}
      {actions && <div className="erp-filter-bar__actions">{actions}</div>}
    </div>
  )
}
