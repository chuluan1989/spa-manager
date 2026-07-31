import { ATTENDANCE_STATUS, ATTENDANCE_STATUS_OPTIONS } from '../../constants/attendanceTypes'
import { useEffect, useState } from 'react'
import {
  cancelAttendanceEditRequest,
  submitAttendanceEditRequest,
} from '../../utils/attendanceEditRequestService'
import './AttendanceCheckInModal.css'

/**
 * Modal gửi yêu cầu bổ sung / sửa chấm công (chờ Admin/QL duyệt).
 * Hệ thống chưa hỗ trợ upload ảnh — có thể ghi link bằng chứng vào ghi chú bằng chứng.
 */
export default function AttendanceEditRequestModal({
  record = null,
  date = '',
  existingRequest = null,
  onClose,
  onSubmitted,
  showToast,
}) {
  const isCreate = !record?.id
  const [status, setStatus] = useState(
    existingRequest?.proposedStatus
      || existingRequest?.newStatus
      || record?.status
      || ATTENDANCE_STATUS.ON_TIME,
  )
  const [reason, setReason] = useState(
    existingRequest?.proposedReason || existingRequest?.newReason || record?.reason || '',
  )
  const [note, setNote] = useState(
    existingRequest?.proposedNote || existingRequest?.newNote || record?.note || '',
  )
  const [checkInTime, setCheckInTime] = useState(existingRequest?.proposedCheckIn || '08:00')
  const [checkOutTime, setCheckOutTime] = useState(existingRequest?.proposedCheckOut || '17:00')
  const [evidenceNote, setEvidenceNote] = useState(existingRequest?.evidenceNote || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setStatus(
      existingRequest?.proposedStatus
        || existingRequest?.newStatus
        || record?.status
        || ATTENDANCE_STATUS.ON_TIME,
    )
    setReason(existingRequest?.proposedReason || existingRequest?.newReason || record?.reason || '')
    setNote(existingRequest?.proposedNote || existingRequest?.newNote || record?.note || '')
    setCheckInTime(existingRequest?.proposedCheckIn || '08:00')
    setCheckOutTime(existingRequest?.proposedCheckOut || '17:00')
    setEvidenceNote(existingRequest?.evidenceNote || '')
    setError('')
  }, [record, date, existingRequest])

  const targetDate = record?.date || date
  const isOnTime = status === ATTENDANCE_STATUS.ON_TIME
  const needsReason = isCreate || (Boolean(status) && !isOnTime)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    if (!status) {
      setError('Vui lòng chọn trạng thái.')
      return
    }
    if (isCreate && (!checkInTime || !checkOutTime)) {
      setError('Vui lòng nhập giờ vào và giờ ra.')
      return
    }
    if (needsReason && !reason.trim()) {
      setError(isCreate ? 'Vui lòng nhập lý do quên chấm công.' : 'Vui lòng nhập lý do.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await submitAttendanceEditRequest({
        record,
        date: targetDate,
        newStatus: status,
        newReason: reason.trim(),
        newNote: note.trim(),
        checkInTime,
        checkOutTime,
        evidenceNote: evidenceNote.trim(),
        requestId: existingRequest?.id || '',
      })
      showToast?.(existingRequest ? 'Đã cập nhật yêu cầu.' : 'Đã gửi yêu cầu bổ sung tới Quản lý.')
      onSubmitted?.()
      onClose?.()
    } catch (err) {
      setError(err?.message ?? 'Không gửi được yêu cầu.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelRequest = async () => {
    if (!existingRequest?.id || saving) return
    setSaving(true)
    setError('')
    try {
      await cancelAttendanceEditRequest(existingRequest.id)
      showToast?.('Đã rút yêu cầu.')
      onSubmitted?.()
      onClose?.()
    } catch (err) {
      setError(err?.message ?? 'Không rút được yêu cầu.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="attendance-checkin" role="presentation">
      <div className="attendance-checkin__backdrop" onClick={onClose} />
      <form className="attendance-checkin__panel" onSubmit={handleSubmit}>
        <header className="attendance-checkin__header">
          <h2>
            {existingRequest
              ? 'Sửa yêu cầu bổ sung'
              : (record ? 'Yêu cầu sửa chấm công' : 'Yêu cầu chấm công bổ sung')}
          </h2>
          <p>Ngày {targetDate} · Chờ Admin/Quản lý duyệt trước khi áp dụng</p>
        </header>

        <div className="attendance-checkin__extra" style={{ marginBottom: '0.75rem' }}>
          <label>
            <span>Ngày cần bổ sung</span>
            <input type="date" value={targetDate} disabled readOnly />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label>
              <span>Giờ vào *</span>
              <input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                disabled={saving}
                required={isCreate}
              />
            </label>
            <label>
              <span>Giờ ra *</span>
              <input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                disabled={saving}
                required={isCreate}
              />
            </label>
          </div>
        </div>

        <div className="attendance-checkin__options">
          {ATTENDANCE_STATUS_OPTIONS.filter((option) => (
            option.id !== ATTENDANCE_STATUS.CANCELLED
            && option.id !== ATTENDANCE_STATUS.INVALID
          )).map((option) => (
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
                  if (option.id === ATTENDANCE_STATUS.ON_TIME && !isCreate) setReason('')
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
              <span>{isCreate ? 'Lý do quên chấm công *' : 'Lý do *'}</span>
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
          <label>
            <span>Bằng chứng / link ảnh (tuỳ chọn — hệ thống chưa hỗ trợ upload file)</span>
            <textarea
              value={evidenceNote}
              onChange={(e) => setEvidenceNote(e.target.value)}
              rows={2}
              disabled={saving}
              placeholder="Dán link ảnh hoặc mô tả bằng chứng…"
            />
          </label>
        </div>

        {error && (
          <div className="attendance-checkin__error-block" role="alert">
            <p className="attendance-checkin__error">{error}</p>
          </div>
        )}

        <footer className="attendance-checkin__footer attendance-checkin__footer--row">
          {existingRequest?.status === 'pending' && (
            <button
              type="button"
              className="attendance-checkin__cancel"
              onClick={handleCancelRequest}
              disabled={saving}
            >
              Rút yêu cầu
            </button>
          )}
          <button
            type="button"
            className="attendance-checkin__cancel"
            onClick={onClose}
            disabled={saving}
          >
            Đóng
          </button>
          <button
            type="submit"
            className="attendance-checkin__submit"
            disabled={saving || !status}
          >
            {saving ? 'Đang gửi...' : (existingRequest ? 'Cập nhật yêu cầu' : 'Gửi yêu cầu')}
          </button>
        </footer>
      </form>
    </div>
  )
}
