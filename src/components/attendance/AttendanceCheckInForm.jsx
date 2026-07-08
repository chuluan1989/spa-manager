import { useState } from 'react'
import { ATTENDANCE_STATUS, ATTENDANCE_STATUS_OPTIONS } from '../../constants/attendanceTypes'
import { getCurrentUserEmployeeId, getCurrentUserName } from '../../constants/auth'
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

    setSubmitting(true)
    setError('')
    try {
      await submitEmployeeAttendance({
        employeeId,
        employeeName: employee?.name ?? getCurrentUserName(),
        branchId: employee?.branchId ?? '',
        status,
        reason: needsReason ? reason.trim() : '',
        note: '',
        submittedBy: getCurrentUserName(),
      })
      onSuccess?.()
    } catch (err) {
      setError(err?.message ?? 'Không thể lưu điểm danh. Vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOnTimeSelect = async () => {
    setStatus(ATTENDANCE_STATUS.ON_TIME)
    setReason('')
    setError('')
    setSubmitting(true)
    try {
      await submitEmployeeAttendance({
        employeeId,
        employeeName: employee?.name ?? getCurrentUserName(),
        branchId: employee?.branchId ?? '',
        status: ATTENDANCE_STATUS.ON_TIME,
        reason: '',
        note: '',
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
              onChange={() => {
                if (option.id === ATTENDANCE_STATUS.ON_TIME) {
                  handleOnTimeSelect()
                  return
                }
                handleStatusChange(option.id)
              }}
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
            />
          </label>
        </div>
      )}

      {error && (
        <div className="attendance-checkin__error-block" role="alert">
          <p className="attendance-checkin__error">{error}</p>
        </div>
      )}

      {needsReason && (
        <footer className="attendance-checkin__footer">
          <button
            type="button"
            className="attendance-checkin__submit"
            disabled={submitting || !reason.trim()}
            onClick={saveAttendance}
          >
            {submitting ? 'Đang lưu...' : 'Tiếp theo'}
          </button>
        </footer>
      )}

      {submitting && isOnTime && (
        <p className="attendance-checkin__hint">Đang lưu điểm danh...</p>
      )}
    </div>
  )
}
