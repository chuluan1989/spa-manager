import { formatCurrency } from '../../utils/invoice'

function formatDateTime(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('vi-VN')
  } catch {
    return value
  }
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return formatCurrency(num)
}

function pickMeta(log) {
  const src = log?.newValue && typeof log.newValue === 'object' && Object.keys(log.newValue).length
    ? log.newValue
    : (log?.oldValue && typeof log.oldValue === 'object' ? log.oldValue : {})
  return src || {}
}

function fieldLabel(field) {
  const map = {
    kpi: 'KPI',
    bonus: 'Thưởng',
    penalty: 'Phạt',
    advance: 'Ứng lương',
    adjustment: 'Điều chỉnh khác',
    note: 'Ghi chú',
  }
  return map[field] || field || '—'
}

/**
 * Lịch sử audit chỉ đọc — không có nút Xóa.
 */
export default function PayrollAuditHistory({ logs }) {
  const items = [...(logs ?? [])].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))

  if (!items.length) {
    return <p className="salary-page__empty">Chưa có lịch sử điều chỉnh.</p>
  }

  return (
    <div className="salary-audit">
      {items.map((log) => {
        const meta = pickMeta(log)
        const oldMeta = log.oldValue && typeof log.oldValue === 'object' ? log.oldValue : {}
        const newMeta = log.newValue && typeof log.newValue === 'object' ? log.newValue : {}
        const oldVal = oldMeta.value !== undefined ? oldMeta.value : null
        const newVal = newMeta.value !== undefined ? newMeta.value : null
        const diff = newMeta.difference !== undefined
          ? newMeta.difference
          : (Number.isFinite(Number(newVal)) && Number.isFinite(Number(oldVal))
            ? Number(newVal) - Number(oldVal)
            : null)
        const hasStructured = Boolean(meta.fieldChanged || meta.employeeId || meta.payrollPeriod)

        return (
          <article key={log.id} className="salary-audit__row">
            <time>{formatDateTime(log.createdAt)}</time>
            <div>
              <strong>{log.action} · {log.entityType}</strong>
              {hasStructured ? (
                <dl className="salary-audit__meta">
                  <div><dt>Nhân viên</dt><dd>{meta.employeeName || meta.employeeId || '—'}</dd></div>
                  <div><dt>Kỳ lương</dt><dd>{meta.payrollPeriod || meta.month || '—'}</dd></div>
                  <div><dt>Chi nhánh</dt><dd>{meta.branchId || '—'}</dd></div>
                  <div><dt>Trường</dt><dd>{fieldLabel(meta.fieldChanged)}</dd></div>
                  <div><dt>Giá trị cũ</dt><dd>{formatMoney(oldVal)}</dd></div>
                  <div><dt>Giá trị mới</dt><dd>{formatMoney(newVal)}</dd></div>
                  <div>
                    <dt>Chênh lệch tác động lương</dt>
                    <dd className={Number(diff) < 0 ? 'is-minus' : 'is-plus'}>
                      {diff === null || diff === undefined
                        ? '—'
                        : `${Number(diff) >= 0 ? '+' : ''}${formatMoney(diff)}`}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="salary-audit__detail">
                  {JSON.stringify(log.newValue ?? log.oldValue ?? {}, null, 0).slice(0, 180)}
                </p>
              )}
              {log.reason && <p className="salary-audit__reason">Lý do: {log.reason}</p>}
              <small>
                Người sửa: {log.editorName || log.editorId || '—'}
                {' · '}
                {formatDateTime(log.createdAt)}
              </small>
            </div>
          </article>
        )
      })}
    </div>
  )
}
