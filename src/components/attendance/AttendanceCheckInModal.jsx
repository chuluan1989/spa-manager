import AttendanceCheckInForm from './AttendanceCheckInForm'
import './AttendanceCheckInModal.css'

/** @deprecated Dùng EmployeeAttendanceLanding + AttendanceCheckInForm */
export default function AttendanceCheckInModal({ serverDate, onCompleted }) {
  return (
    <div className="attendance-checkin" role="dialog" aria-modal="true" aria-labelledby="attendance-checkin-title">
      <div className="attendance-checkin__backdrop" />
      <AttendanceCheckInForm
        onSuccess={onCompleted}
        onSkip={onCompleted}
      />
    </div>
  )
}
