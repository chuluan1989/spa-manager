import { useState } from 'react'
import './ExpenseModules.css'

const ADMIN_REASON_PRESETS = [
  'Quản lý nhập sai số tiền',
  'Sai nhóm chi phí',
  'Sai ngày phát sinh',
  'Điều chỉnh theo chứng từ',
  'Sai chi nhánh',
]

export default function ExpenseReasonModal({
  open,
  title = 'Nhập lý do',
  confirmLabel = 'Xác nhận',
  onClose,
  onConfirm,
  presets = ADMIN_REASON_PRESETS,
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  if (!open) return null

  const submit = () => {
    const text = reason.trim()
    if (!text) {
      setError('Bắt buộc nhập lý do.')
      return
    }
    onConfirm?.(text)
    setReason('')
    setError('')
  }

  return (
    <div className="salary-modal" role="dialog" aria-modal="true">
      <div className="salary-modal__backdrop" onClick={onClose} />
      <div className="salary-modal__panel exp-reason-modal">
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>
        <div className="exp-reason-modal__body">
          <p>Thay đổi sẽ được ghi nhật ký (trước / sau / người sửa / thời gian / lý do).</p>
          <div className="exp-reason-modal__presets">
            {presets.map((item) => (
              <button key={item} type="button" className="exp-mod__btn exp-mod__btn--small" onClick={() => setReason(item)}>
                {item}
              </button>
            ))}
          </div>
          <label>
            <span>Lý do</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do bắt buộc…"
            />
          </label>
          {error && <p className="exp-mod__inline-error">{error}</p>}
        </div>
        <footer className="exp-reason-modal__footer">
          <button type="button" className="exp-mod__btn" onClick={onClose}>Hủy</button>
          <button type="button" className="exp-mod__btn exp-mod__btn--primary" onClick={submit}>{confirmLabel}</button>
        </footer>
      </div>
    </div>
  )
}
