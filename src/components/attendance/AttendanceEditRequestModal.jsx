import { ATTENDANCE_STATUS, ATTENDANCE_STATUS_OPTIONS } from '../../constants/attendanceTypes'
import { useEffect, useState } from 'react'
import { submitAttendanceEditRequest } from '../../utils/attendanceEditRequestService'
import './AttendanceCheckInModal.css'

/**
 * Modal gửi yêu cầu sửa / bổ sung chấm công (chờ Quản lý duyệt).
 * Hệ thống dùng trạng thái điểm danh — không có giờ vào/ra riêng.
 */
export default function AttendanceEditRequestModal({
  record = null,
  date = '',
  onClose,
  onSubmitted,
  showToast,
}) {
  const [status, setStatus] = useState(record?.status ?? '')
  const [reason, setReason] = useState(record?.reason ?? '')
  const [note, setNote] = useState(record?.note ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setStatus(record?.status ?? '')
    setReason(record?.reason ?? '')
    setNote(record?.note ?? '')
    setError('')
  }, [record, date])

  const isOnTime = status === ATTENDANCE_STATUS.ON_TIME
  const needsReason = Boolean(status) && !isOnTime

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    if (!status) {
      setError('Vui lòng chọn trạng thái.')
      return
    }
    if (needsReason && !reason.trim()) {
      setError('Vui lòng nhập lý do.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await submitAttendanceEditRequest({
        record,
        date: record?.date || date,
        newStatus: status,
        newReason: needsReason ? reason.trim() : '',
        newNote: note.trim(),
      })
      showToast?.('Đã gửi yêu cầu chỉnh sửa chấm công. Quản lý sẽ xem xét.')
      onSubmitted?.()
      onClose?.()
    } catch (err) {
      setError(err?.message ?? 'Không gửi được yêu cầu.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="attendance-checkin" role="presentation">
      <div className="attendance-checkin__backdrop" onClick={onClose} />
      <form className="attendance-checkin__panel" onSubmit={handleSubmit}>
        <header className="attendance-checkin__header">
          <h2>{record ? 'Yêu cầu sửa chấm công' : 'Yêu cầu bổ sung chấm công'}</h2>
          <p>Ngày {record?.date || date} · Chờ Quản lý duyệt trước khi áp dụng</p>
        </header>

        <div className="attendance-checkin__options">
          {ATTENDANCE_STATUS_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={`attendance-checkin__option${status === option.id ? ' attendance-checkin__option--active' : ''}`}
            >
              <input
                type="radio"
                name="attendance-edit-status"
                value={option.id}
                checked={status === option.id}
                onChange={() => {
                  setStatus(option.id)
                  setError('')
                  if (option.id === ATTENDANCE_STATUS.ON_TIME) setReason('')
                }}
                disabled={saving}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>

        <div className="attendance-checkin__extra">
          {needsReason && (
            <label>
              <span>Lý do *</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                disabled={saving}
              />
            </label>
          )}
          <label>
            <span>Ghi chú (tuỳ chọn)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              disabled={saving}
            />
          </label>
        </div>

        {error && (
          <div className="attendance-checkin__error-block" role="alert">
            <p className="attendance-checkin__error">{error}</p>
          </div>
        )}

        <footer className="attendance-checkin__footer attendance-checkin__footer--row">
          <button
            type="button"
            className="attendance-checkin__cancel"
            onClick={onClose}
            disabled={saving}
          >
            Hủy
          </button>
          <button
            type="submit"
            className="attendance-checkin__submit"
            disabled={saving || !status}
          >
            {saving ? 'Đang gửi...' : 'Gửi yêu cầu'}
          </button>
        </footer>
      </form>
    </div>
  )
}
