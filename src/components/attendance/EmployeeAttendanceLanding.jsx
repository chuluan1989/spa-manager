import { useState } from 'react'
import { ClipboardCheck, LogIn } from 'lucide-react'
import KhoeSpaLogo from '../brand/KhoeSpaLogo'
import { getCurrentUserEmployeeId, getCurrentUserName } from '../../constants/auth'
import { getEmployeeById } from '../../utils/employeeStorage'
import AttendanceCheckInForm from './AttendanceCheckInForm'
import './EmployeeAttendanceLanding.css'

export default function EmployeeAttendanceLanding({ onComplete }) {
  const employeeId = getCurrentUserEmployeeId()
  const employee = getEmployeeById(employeeId)
  const [step, setStep] = useState('choice')

  const displayName = employee?.name ?? getCurrentUserName()

  if (step === 'form') {
    return (
      <div className="employee-attendance-landing">
        <div className="employee-attendance-landing__card employee-attendance-landing__card--wide">
          <AttendanceCheckInForm
            onSuccess={onComplete}
            onSkip={onComplete}
            onBack={() => setStep('choice')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="employee-attendance-landing">
      <div className="employee-attendance-landing__card">
        <KhoeSpaLogo size={120} className="employee-attendance-landing__logo" />
        <h1 className="employee-attendance-landing__title">Xin chào, {displayName}</h1>
        <p className="employee-attendance-landing__subtitle">Chọn một tùy chọn để tiếp tục làm việc</p>

        <div className="employee-attendance-landing__actions">
          <button
            type="button"
            className="employee-attendance-landing__btn employee-attendance-landing__btn--primary"
            onClick={onComplete}
          >
            <ClipboardCheck size={20} aria-hidden="true" />
            Đã điểm danh
          </button>
          <button
            type="button"
            className="employee-attendance-landing__btn employee-attendance-landing__btn--secondary"
            onClick={() => setStep('form')}
          >
            <LogIn size={20} aria-hidden="true" />
            Vào điểm danh
          </button>
        </div>
      </div>
    </div>
  )
}
