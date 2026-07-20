export default function ServiceConfirmSaveModal({
  open,
  oldPrice,
  newPrice,
  oldPercent,
  newPercent,
  onCancel,
  onConfirm,
}) {
  if (!open) return null

  const priceChanged = oldPrice !== newPrice
  const percentChanged = oldPercent !== newPercent

  return (
    <div className="svc-mgmt-modal svc-mgmt-modal--confirm" role="dialog" aria-modal="true">
      <div className="svc-mgmt-modal__backdrop" onClick={onCancel} />
      <div className="svc-mgmt-modal__panel svc-mgmt-modal__panel--sm">
        <header className="svc-mgmt-modal__head">
          <h3>Xác nhận thay đổi</h3>
          <button type="button" onClick={onCancel} aria-label="Đóng">×</button>
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
        </div>
        <footer className="svc-mgmt-modal__foot">
          <button type="button" className="settings__btn" onClick={onCancel}>Huỷ</button>
          <button type="button" className="settings__btn settings__btn--primary" onClick={onConfirm}>
            Lưu thay đổi
          </button>
        </footer>
      </div>
    </div>
  )
}
