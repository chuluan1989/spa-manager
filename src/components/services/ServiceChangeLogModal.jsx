import { useEffect, useState } from 'react'
import { fetchServiceChangeLogs } from '../../utils/serviceChangeLogStorage'
import { STATS_ERROR_MESSAGE } from '../../utils/serviceManagementHelpers'

function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('vi-VN')
}

export default function ServiceChangeLogModal({ open, branchId, row, onClose }) {
  const [logs, setLogs] = useState([])
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    if (!open || !row?.durationId || !branchId) return

    let cancelled = false
    setStatus('loading')
    setLogs([])

    fetchServiceChangeLogs({ branchId, durationId: row.durationId, limit: 100 })
      .then((data) => {
        if (cancelled) return
        setLogs(data)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setLogs([])
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [open, branchId, row?.durationId])

  if (!open || !row) return null

  const oldValues = (log) => log.oldValues ?? {}
  const newValues = (log) => log.newValues ?? {}

  return (
    <div className="svc-mgmt-modal" role="dialog" aria-modal="true">
      <div className="svc-mgmt-modal__backdrop" onClick={onClose} />
      <div className="svc-mgmt-modal__panel svc-mgmt-modal__panel--log">
        <header className="svc-mgmt-modal__head">
          <h3>Nhật ký · {row.serviceName} {row.durationLabel}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>
        <div className="svc-mgmt-modal__body svc-mgmt-modal__body--log">
          {status === 'loading' && (
            <p className="svc-mgmt__empty">Đang tải nhật ký…</p>
          )}
          {status === 'error' && (
            <p className="svc-mgmt__empty svc-mgmt__error">{STATS_ERROR_MESSAGE}</p>
          )}
          {status === 'ready' && !logs.length && (
            <p className="svc-mgmt__empty">— Chưa có nhật ký thay đổi.</p>
          )}
          {status === 'ready' && logs.map((log) => (
            <article key={log.id} className="svc-mgmt-log__item">
              <header>
                <strong>{formatWhen(log.createdAt)}</strong>
                <span>{log.changedByName || log.changedBy || '—'}</span>
              </header>
              {oldValues(log).price != null && newValues(log).price != null && (
                <p>Giá: {Number(oldValues(log).price).toLocaleString('vi-VN')} → {Number(newValues(log).price).toLocaleString('vi-VN')}</p>
              )}
              {oldValues(log).commissionPercent != null && newValues(log).commissionPercent != null && (
                <p>% HH: {oldValues(log).commissionPercent}% → {newValues(log).commissionPercent}%</p>
              )}
              {log.action === 'create' && <p>Khởi tạo dịch vụ</p>}
            </article>
          ))}
        </div>
        <footer className="svc-mgmt-modal__foot">
          <button type="button" className="settings__btn" onClick={onClose}>Đóng</button>
        </footer>
      </div>
    </div>
  )
}
