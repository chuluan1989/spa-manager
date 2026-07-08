import ErpBreadcrumb from '../erp/ErpBreadcrumb'

/** @deprecated Use ErpBreadcrumb — kept for backward compatibility */
export default function PayrollBreadcrumb(props) {
  const items = (props.items ?? []).map((item) => ({
    id: item.id,
    label: item.label,
    onClick: item.level
      ? () => props.onNavigate?.(item.level, item.meta)
      : undefined,
  }))
  return <ErpBreadcrumb items={items} onNavigate={(item) => item.onClick?.()} />
}
