import { canDeletePayroll, isAdmin } from '../../constants/auth'
import { removePayrollAdjustment } from '../../utils/payrollService'

function formatDateTime(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('vi-VN')
  } catch {
    return value
  }
}

export default function PayrollAuditHistory({ logs, adjustments, locks, onReload }) {
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

  const handleDelete = async (adjustmentId) => {
    const record = adjustments.find((row) => row.id === adjustmentId)
    if (!record || !canDeletePayroll()) return
    const reason = window.prompt('Lý do xóa khoản lương:')
    if (!reason?.trim()) return
    try {
      await removePayrollAdjustment(record, reason, locks)
      onReload?.()
    } catch (err) {
      window.alert(err?.message ?? 'Không thể xóa.')
    }
  }

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
            {item.kind === 'adjustment' && isAdmin() && (
              <button
                type="button"
                className="salary-audit__delete"
                onClick={() => handleDelete(item.id.replace(/^adj-/, ''))}
              >
                Xóa
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
