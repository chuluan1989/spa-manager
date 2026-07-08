import { useState } from 'react'
import { ATTENDANCE_STATUS_OPTIONS } from '../../constants/attendanceTypes'
import { getCurrentUserEmployeeId, getCurrentUserName } from '../../constants/auth'
import { getEmployeeById } from '../../utils/employeeStorage'
import { getTodayDate } from '../../utils/invoiceStorage'
import { submitEmployeeAttendance } from '../../utils/attendanceService'
import './AttendanceCheckInModal.css'

export default function AttendanceCheckInForm({ onSuccess, onSkip, onBack }) {
  const employeeId = getCurrentUserEmployeeId()
  const employee = getEmployeeById(employeeId)
  const [status, setStatus] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const today = getTodayDate()

  const handleSubmit = async () => {
    if (!status) {
      setError('Vui lòng chọn trạng thái điểm danh.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await submitEmployeeAttendance({
        employeeId,
        employeeName: employee?.name ?? getCurrentUserName(),
        branchId: employee?.branchId ?? '',
        status,
        reason,
        note,
        submittedBy: getCurrentUserName(),
      })
      onSuccess?.()
    } catch (err) {
      setError(err?.message ?? 'Không thể lưu điểm danh. Vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="attendance-checkin__panel attendance-checkin__panel--inline">
      <header className="attendance-checkin__header">
        {onBack && (
          <button type="button" className="attendance-checkin__back" onClick={onBack}>
            ← Quay lại
          </button>
        )}
        <h2 id="attendance-checkin-title">Điểm danh hôm nay</h2>
        <p>Ngày {today} · {employee?.name ?? getCurrentUserName()}</p>
      </header>

      <div className="attendance-checkin__options">
        {ATTENDANCE_STATUS_OPTIONS.map((option) => (
          <label
            key={option.id}
            className={`attendance-checkin__option${status === option.id ? ' attendance-checkin__option--active' : ''}`}
          >
            <input
              type="radio"
              name="attendance-status"
              value={option.id}
              checked={status === option.id}
              onChange={() => setStatus(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>

      <div className="attendance-checkin__extra">
        <label>
          <span>Lý do (nếu có)</span>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do nghỉ / đi trễ..." />
        </label>
        <label>
          <span>Ghi chú</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú thêm..." />
        </label>
      </div>

      {error && (
        <div className="attendance-checkin__error-block" role="alert">
          <p className="attendance-checkin__error">{error}</p>
          <button
            type="button"
            className="attendance-checkin__skip"
            onClick={() => onSkip?.()}
          >
            Bỏ qua và vào Hóa đơn
          </button>
        </div>
      )}

      <footer className="attendance-checkin__footer">
        <button
          type="button"
          className="attendance-checkin__submit"
          disabled={submitting || !status}
          onClick={handleSubmit}
        >
          {submitting ? 'Đang lưu...' : 'Lưu điểm danh'}
        </button>
      </footer>
    </div>
  )
}
