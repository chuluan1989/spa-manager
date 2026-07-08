function formatDateTime(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('vi-VN')
  } catch {
    return value
  }
}

export default function PayrollAuditHistory({ logs, adjustments }) {
  const items = [
    ...logs.map((log) => ({
      id: log.id,
      kind: 'audit',
      at: log.createdAt,
      title: `${log.action} · ${log.entityType}`,
      editor: log.editorName || log.editorId,
      reason: log.reason,
      detail: JSON.stringify(log.newValue ?? {}, null, 0).slice(0, 120),
    })),
    ...adjustments.map((row) => ({
      id: `adj-${row.id}`,
      kind: 'adjustment',
      at: row.createdAt,
      title: row.type,
      editor: row.createdByName || row.createdBy,
      reason: row.reason,
      detail: `${row.employeeName}: ${row.amount?.toLocaleString('vi-VN')}đ`,
    })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)))

  if (!items.length) {
    return <p className="salary-page__empty">Chưa có lịch sử điều chỉnh.</p>
  }

  return (
    <div className="salary-audit">
      {items.map((item) => (
        <article key={item.id} className="salary-audit__row">
          <time>{formatDateTime(item.at)}</time>
          <div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
            {item.reason && <p className="salary-audit__reason">{item.reason}</p>}
            <small>{item.editor}</small>
          </div>
        </article>
      ))}
    </div>
  )
}
