import { PAYROLL_DETAIL_LABELS } from '../../constants/payrollTypes'
import { formatCurrency } from '../../utils/invoice'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

export default function PayrollDetailModal({ open, onClose, title, entries, total }) {
  if (!open) return null

  return (
    <div className="salary-modal" role="dialog" aria-modal="true">
      <div className="salary-modal__backdrop" onClick={onClose} />
      <div className="salary-modal__panel salary-modal__panel--wide">
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>

        {!entries?.length ? (
          <p className="salary-page__empty">Không có chi tiết.</p>
        ) : (
          <ul className="salary-detail-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong>{entry.label ?? entry.reason ?? '—'}</strong>
                  <small>{formatDate(entry.date)} · {entry.createdBy ?? 'Hệ thống'}</small>
                  {entry.reason && entry.label && <p>{entry.reason}</p>}
                </div>
                <span>{formatCurrency(Math.abs(entry.amount ?? entry.value ?? 0))}</span>
              </li>
            ))}
          </ul>
        )}

        {total !== undefined && (
          <footer className="salary-detail-total">
            <span>{PAYROLL_DETAIL_LABELS.netSalary ?? 'Tổng'}</span>
            <strong>{formatCurrency(total)}</strong>
          </footer>
        )}
      </div>
    </div>
  )
}
