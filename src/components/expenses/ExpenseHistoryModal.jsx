import { useEffect, useState } from 'react'
import { fetchExpenseChangeLogs } from '../../repositories/expenseChangeLogsRepository'
import { formatCurrency } from '../../utils/invoice'
import './ExpenseModules.css'

function formatValue(key, value) {
  if (value == null || value === '') return '—'
  if (key === 'amount') return formatCurrency(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function ExpenseHistoryModal({ open, expense, onClose, entityType = 'expense' }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !expense?.id) return undefined
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        // Ưu tiên entityId; entityType lọc thêm khi có kết quả trùng.
        let rows = await Promise.race([
          fetchExpenseChangeLogs({ entityId: expense.id, limit: 50 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Hết thời gian tải lịch sử')), 20000)),
        ])
        if (Array.isArray(rows) && entityType) {
          const scoped = rows.filter((row) => !row.entityType || row.entityType === entityType)
          if (scoped.length > 0) rows = scoped
        }
        if (!cancelled) setLogs(rows ?? [])
      } catch (err) {
        if (!cancelled) {
          setLogs([])
          setError(err?.message ?? 'Không tải được lịch sử')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [open, expense?.id, entityType])

  if (!open || !expense) return null

  return (
    <div className="salary-modal" role="dialog" aria-modal="true">
      <div className="salary-modal__backdrop" onClick={onClose} />
      <div className="salary-modal__panel exp-history-modal">
        <header>
          <h3>Lịch sử · {expense.content}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>
        <div className="exp-history-modal__body">
          {loading && <p>Đang tải…</p>}
          {error && <p className="exp-mod__inline-error">{error}</p>}
          {!loading && logs.length === 0 && <p className="exp-mod__empty">Chưa có nhật ký thay đổi.</p>}
          <ul className="exp-history-modal__list">
            {logs.map((log) => (
              <li key={log.id}>
                <div className="exp-history-modal__meta">
                  <strong>{log.action}</strong>
                  <span>{log.changedBy} · {log.changedByRole}</span>
                  <time>{log.changedAt ? new Date(log.changedAt).toLocaleString('vi-VN') : '—'}</time>
                </div>
                {log.newValues?.changeReason && (
                  <p className="exp-history-modal__reason">Lý do: {log.newValues.changeReason}</p>
                )}
                <div className="exp-history-modal__diff">
                  <div>
                    <small>Trước</small>
                    <pre>{Object.entries(log.oldValues || {}).map(([k, v]) => `${k}: ${formatValue(k, v)}`).join('\n') || '—'}</pre>
                  </div>
                  <div>
                    <small>Sau</small>
                    <pre>{Object.entries(log.newValues || {}).filter(([k]) => k !== 'changeReason').map(([k, v]) => `${k}: ${formatValue(k, v)}`).join('\n') || '—'}</pre>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
