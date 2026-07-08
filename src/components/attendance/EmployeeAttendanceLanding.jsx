import { useState } from 'react'
import KhoeSpaLogo from '../brand/KhoeSpaLogo'
import { getCurrentUserEmployeeId, getCurrentUserName } from '../../constants/auth'
import { getEmployeeById } from '../../utils/employeeStorage'
import AttendanceCheckInForm from './AttendanceCheckInForm'
import './EmployeeAttendanceLanding.css'

export default function EmployeeAttendanceLanding({ onComplete }) {
  const employeeId = getCurrentUserEmployeeId()
  const employee = getEmployeeById(employeeId)
  const displayName = employee?.name ?? getCurrentUserName()

  return (
    <div className="employee-attendance-landing">
      <div className="employee-attendance-landing__card employee-attendance-landing__card--wide">
        <div className="employee-attendance-landing__intro">
          <KhoeSpaLogo size={96} className="employee-attendance-landing__logo" />
          <h1 className="employee-attendance-landing__title">Xin chào, {displayName}</h1>
          <p className="employee-attendance-landing__subtitle">Vui lòng điểm danh trước khi vào Hóa đơn</p>
        </div>
        <AttendanceCheckInForm onSuccess={onComplete} onSkip={onComplete} />
      </div>
    </div>
  )
}
