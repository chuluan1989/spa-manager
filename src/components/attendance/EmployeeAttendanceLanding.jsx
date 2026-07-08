import { useState } from 'react'
import KhoeSpaLogo from '../brand/KhoeSpaLogo'
import { getCurrentUserEmployeeId, getCurrentUserName } from '../../constants/auth'
import { hasCheckedInToday } from '../../utils/attendanceService'
import { getEmployeeById } from '../../utils/employeeStorage'
import AttendanceCheckInForm from './AttendanceCheckInForm'
import './EmployeeAttendanceLanding.css'

export default function EmployeeAttendanceLanding({ onComplete }) {
  const employeeId = getCurrentUserEmployeeId()
  const employee = getEmployeeById(employeeId)
  const displayName = employee?.name ?? getCurrentUserName()

  const [view, setView] = useState('choice')
  const [message, setMessage] = useState('')
  const [checking, setChecking] = useState(false)

  const handleAlreadyCheckedIn = async () => {
    setChecking(true)
    setMessage('')
    try {
      const checkedIn = await hasCheckedInToday(employeeId)
      if (checkedIn) {
        onComplete?.()
        return
      }
      setMessage('Bạn chưa điểm danh hôm nay. Vui lòng vào điểm danh trước.')
    } catch (err) {
      setMessage(err?.message ?? 'Không kiểm tra được điểm danh. Vui lòng thử lại.')
    } finally {
      setChecking(false)
    }
  }

  if (view === 'checkin') {
    return (
      <div className="employee-attendance-landing">
        <div className="employee-attendance-landing__card employee-attendance-landing__card--wide">
          <div className="employee-attendance-landing__checkin-wrap">
            <button
              type="button"
              className="attendance-checkin__back"
              onClick={() => {
                setView('choice')
                setMessage('')
              }}
            >
              ← Quay lại
            </button>
            <AttendanceCheckInForm onSuccess={onComplete} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="employee-attendance-landing">
      <div className="employee-attendance-landing__card">
        <KhoeSpaLogo size={96} className="employee-attendance-landing__logo" />
        <h1 className="employee-attendance-landing__title">Xin chào, {displayName}</h1>
        <p className="employee-attendance-landing__subtitle">Vui lòng điểm danh trước khi vào Hóa đơn</p>

        {message && (
          <p className="employee-attendance-landing__message" role="alert">
            {message}
          </p>
        )}

        <div className="employee-attendance-landing__actions">
          <button
            type="button"
            className="employee-attendance-landing__btn employee-attendance-landing__btn--primary"
            onClick={handleAlreadyCheckedIn}
            disabled={checking}
          >
            {checking ? 'Đang kiểm tra...' : 'Đã điểm danh'}
          </button>
          <button
            type="button"
            className="employee-attendance-landing__btn employee-attendance-landing__btn--secondary"
            onClick={() => {
              setMessage('')
              setView('checkin')
            }}
          >
            Vào điểm danh
          </button>
        </div>
      </div>
    </div>
  )
}
