import { useEffect, useState } from 'react'
import { ATTENDANCE_STATUS_OPTIONS } from '../../constants/attendanceTypes'
import { getCurrentUserEmployeeId, getCurrentUserName } from '../../constants/auth'
import { getEmployeeById } from '../../utils/employeeStorage'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { submitEmployeeAttendance } from '../../utils/attendanceService'
import './AttendanceCheckInModal.css'

export default function AttendanceCheckInModal({ serverDate, onCompleted }) {
  const employeeId = getCurrentUserEmployeeId()
  const employee = getEmployeeById(employeeId)
  const [status, setStatus] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    document.body.classList.add('attendance-modal-open')
    return () => document.body.classList.remove('attendance-modal-open')
  }, [])

  const handleSubmit = async () => {
    if (!status) {
      setError('Vui lòng chọn trạng thái điểm danh.')
      return
    }
    if (!isSupabaseConfigured) {
      setError('Hệ thống chấm công cần Supabase. Liên hệ quản trị viên.')
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
      onCompleted?.()
    } catch (err) {
      setError(err?.message ?? 'Không thể điểm danh. Vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="attendance-checkin" role="dialog" aria-modal="true" aria-labelledby="attendance-checkin-title">
      <div className="attendance-checkin__backdrop" />
      <div className="attendance-checkin__panel">
        <header className="attendance-checkin__header">
          <h2 id="attendance-checkin-title">Điểm danh hôm nay</h2>
          <p>Ngày {serverDate} · {employee?.name ?? getCurrentUserName()}</p>
          <span className="attendance-checkin__required">Bắt buộc chọn trạng thái trước khi sử dụng hệ thống</span>
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

        {error && <p className="attendance-checkin__error" role="alert">{error}</p>}

        <footer className="attendance-checkin__footer">
          <button
            type="button"
            className="attendance-checkin__submit"
            disabled={submitting || !status}
            onClick={handleSubmit}
          >
            {submitting ? 'Đang lưu...' : 'Xác nhận điểm danh'}
          </button>
        </footer>
      </div>
    </div>
  )
}
