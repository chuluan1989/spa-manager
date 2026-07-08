import { useState } from 'react'
import { ATTENDANCE_STATUS, ATTENDANCE_STATUS_OPTIONS } from '../../constants/attendanceTypes'
import { getCurrentUserBranch, getCurrentUserEmployeeId, getCurrentUserName } from '../../constants/auth'
import { getEmployeeById } from '../../utils/employeeStorage'
import { getTodayDate } from '../../utils/invoiceStorage'
import { submitEmployeeAttendance } from '../../utils/attendanceService'
import './AttendanceCheckInModal.css'

export default function AttendanceCheckInForm({ onSuccess }) {
  const employeeId = getCurrentUserEmployeeId()
  const employee = getEmployeeById(employeeId)
  const [status, setStatus] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const today = getTodayDate()
  const isOnTime = status === ATTENDANCE_STATUS.ON_TIME
  const needsReason = Boolean(status) && !isOnTime
  const canContinue = Boolean(status) && (!needsReason || reason.trim())

  const handleStatusChange = (nextStatus) => {
    setStatus(nextStatus)
    setError('')
    if (nextStatus === ATTENDANCE_STATUS.ON_TIME) {
      setReason('')
    }
  }

  const saveAttendance = async () => {
    if (!status) {
      setError('Vui lòng chọn trạng thái điểm danh.')
      return
    }
    if (needsReason && !reason.trim()) {
      setError('Vui lòng nhập lý do.')
      return
    }
    if (!employeeId) {
      setError('Không xác định được tài khoản nhân viên. Vui lòng đăng nhập lại.')
      return
    }

    const branchId = employee?.branchId || getCurrentUserBranch()

    setSubmitting(true)
    setError('')
    try {
      await submitEmployeeAttendance({
        employeeId,
        employeeName: employee?.name ?? getCurrentUserName(),
        branchId,
        status,
        reason: needsReason ? reason.trim() : '',
        note: '',
        submittedBy: getCurrentUserName(),
      })
      setSubmitting(false)
      onSuccess?.()
    } catch (err) {
      const message = err?.message ?? 'Không thể lưu điểm danh. Vui lòng thử lại.'
      if (/đã điểm danh/i.test(message)) {
        setSubmitting(false)
        onSuccess?.()
        return
      }
      setError(message)
      setSubmitting(false)
    }
  }

  const handleFormSubmit = (event) => {
    event.preventDefault()
    if (canContinue && !submitting) {
      saveAttendance()
    }
  }

  return (
    <form className="attendance-checkin__panel attendance-checkin__panel--inline" onSubmit={handleFormSubmit}>
      <header className="attendance-checkin__header">
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
              onChange={() => handleStatusChange(option.id)}
              disabled={submitting}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>

      {needsReason && (
        <div className="attendance-checkin__extra">
          <label>
            <span>Lý do *</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do đi trễ / nghỉ / về sớm..."
              autoFocus
              disabled={submitting}
            />
          </label>
        </div>
      )}

      {error && (
        <div className="attendance-checkin__error-block" role="alert">
          <p className="attendance-checkin__error">{error}</p>
          <button
            type="button"
            className="attendance-checkin__retry"
            onClick={saveAttendance}
            disabled={submitting || !canContinue}
          >
            Thử lại
          </button>
        </div>
      )}

      {status && (
        <footer className="attendance-checkin__footer">
          <button
            type="submit"
            className="attendance-checkin__submit"
            disabled={submitting || !canContinue}
          >
            {submitting ? 'Đang lưu...' : 'Tiếp tục'}
          </button>
        </footer>
      )}
    </form>
  )
}
