import { getServiceChangeLogs } from '../../utils/serviceChangeLogStorage'

function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('vi-VN')
}

export default function ServiceChangeLogModal({ open, branchId, row, onClose }) {
  if (!open || !row) return null

  const logs = getServiceChangeLogs(branchId, row.durationId)

  return (
    <div className="svc-mgmt-modal" role="dialog" aria-modal="true">
      <div className="svc-mgmt-modal__backdrop" onClick={onClose} />
      <div className="svc-mgmt-modal__panel svc-mgmt-modal__panel--log">
        <header className="svc-mgmt-modal__head">
          <h3>Nhật ký · {row.serviceName} {row.durationLabel}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>
        <div className="svc-mgmt-modal__body svc-mgmt-modal__body--log">
          {!logs.length ? (
            <p className="svc-mgmt__empty">— Chưa có nhật ký thay đổi.</p>
          ) : (
            logs.map((log) => (
              <article key={log.id} className="svc-mgmt-log__item">
                <header>
                  <strong>{formatWhen(log.at)}</strong>
                  <span>{log.byName || log.by || '—'}</span>
                </header>
                {log.oldPrice != null && log.newPrice != null && (
                  <p>Giá: {Number(log.oldPrice).toLocaleString('vi-VN')} → {Number(log.newPrice).toLocaleString('vi-VN')}</p>
                )}
                {log.oldPercent != null && log.newPercent != null && (
                  <p>% HH: {log.oldPercent}% → {log.newPercent}%</p>
                )}
                {log.action === 'create' && <p>Khởi tạo dịch vụ</p>}
              </article>
            ))
          )}
        </div>
        <footer className="svc-mgmt-modal__foot">
          <button type="button" className="settings__btn" onClick={onClose}>Đóng</button>
        </footer>
      </div>
    </div>
  )
}
