import { useEffect, useState } from 'react'
import { isEmployee, getCurrentUserEmployeeId } from '../../constants/auth'
import { getEmployeeById } from '../../utils/employeeStorage'
import { isEmployeeProfileLocked } from '../../utils/employeeProfilePolicy'
import { getTodayDate } from '../../utils/invoiceStorage'
import AttendanceCheckInModal from './AttendanceCheckInModal'
import {
  fetchAttendanceByEmployeeAndDate,
  fetchAttendanceServerDate,
} from '../../repositories/attendanceRepository'

export default function EmployeeAttendanceGate({ children }) {
  const [state, setState] = useState('loading')
  const [serverDate, setServerDate] = useState('')
  const [warning, setWarning] = useState('')

  useEffect(() => {
    if (!isEmployee()) {
      setState('ready')
      return
    }

    let cancelled = false

    async function checkAttendance() {
      const employee = getEmployeeById(getCurrentUserEmployeeId())
      if (isEmployeeProfileLocked(employee)) {
        if (!cancelled) setState('ready')
        return
      }

      let date = getTodayDate()
      try {
        const server = await fetchAttendanceServerDate()
        if (server?.date) date = server.date
      } catch {
        if (!cancelled) {
          setWarning('Không lấy được ngày server — dùng ngày máy cục bộ.')
        }
      }

      let existing = null
      try {
        existing = await fetchAttendanceByEmployeeAndDate(getCurrentUserEmployeeId(), date)
      } catch {
        if (!cancelled) {
          setWarning('Không kiểm tra được điểm danh — vui lòng chấm công ngay.')
        }
      }

      if (cancelled) return
      setServerDate(date)
      setState(existing ? 'ready' : 'required')
    }

    checkAttendance()
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'loading') {
    return (
      <div className="app-loading" style={{ padding: 24, textAlign: 'center', color: '#6b7280', minHeight: '100vh' }}>
        Đang kiểm tra điểm danh...
      </div>
    )
  }

  return (
    <>
      {warning && (
        <div className="attendance-gate-warning" role="status">
          {warning}
        </div>
      )}
      {children}
      {state === 'required' && (
        <AttendanceCheckInModal
          serverDate={serverDate}
          onCompleted={() => setState('ready')}
        />
      )}
    </>
  )
}
