export default function ServiceConfirmSaveModal({
  open,
  oldPrice,
  newPrice,
  oldPercent,
  newPercent,
  reason = '',
  onReasonChange,
  saving = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  if (!open) return null

  const priceChanged = oldPrice !== newPrice
  const percentChanged = oldPercent !== newPercent
  const reasonOk = String(reason ?? '').trim().length > 0

  return (
    <div className="svc-mgmt-modal svc-mgmt-modal--confirm" role="dialog" aria-modal="true">
      <div className="svc-mgmt-modal__backdrop" onClick={onCancel} />
      <div className="svc-mgmt-modal__panel svc-mgmt-modal__panel--sm">
        <header className="svc-mgmt-modal__head">
          <h3>Xác nhận thay đổi</h3>
          <button type="button" onClick={onCancel} aria-label="Đóng" disabled={saving}>×</button>
        </header>
        <div className="svc-mgmt-modal__body">
          <div className="svc-mgmt-modal__preview">
            <p>✔ Hóa đơn cũ giữ nguyên.</p>
            <p>✔ Hóa đơn mới áp dụng giá/% mới.</p>
            <p>✔ Snapshot lịch sử không thay đổi.</p>
            {priceChanged && (
              <p>Giá: {Number(oldPrice).toLocaleString('vi-VN')} → {Number(newPrice).toLocaleString('vi-VN')}</p>
            )}
            {percentChanged && (
              <p>% HH: {oldPercent}% → {newPercent}%</p>
            )}
          </div>
          <label className="svc-mgmt-modal__field" style={{ display: 'block', marginTop: 12 }}>
            <span>Lý do thay đổi (bắt buộc)</span>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange?.(e.target.value)}
              rows={3}
              placeholder="Ví dụ: Điều chỉnh giá theo mùa / Cập nhật hoa hồng chi nhánh…"
              disabled={saving}
              required
              style={{ width: '100%', marginTop: 6 }}
            />
          </label>
          {error ? <p className="invoice__error" style={{ marginTop: 8 }}>{error}</p> : null}
        </div>
        <footer className="svc-mgmt-modal__foot">
          <button type="button" className="settings__btn" onClick={onCancel} disabled={saving}>Huỷ</button>
          <button
            type="button"
            className="settings__btn settings__btn--primary"
            onClick={onConfirm}
            disabled={saving || !reasonOk}
          >
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </footer>
      </div>
    </div>
  )
}
