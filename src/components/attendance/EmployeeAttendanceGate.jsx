import { useEffect, useState } from 'react'
import { isEmployee, getCurrentUserEmployeeId } from '../../constants/auth'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import AttendanceCheckInModal from './AttendanceCheckInModal'
import {
  fetchAttendanceByEmployeeAndDate,
  fetchAttendanceServerDate,
} from '../../repositories/attendanceRepository'

export default function EmployeeAttendanceGate({ children }) {
  const [state, setState] = useState('loading')
  const [serverDate, setServerDate] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEmployee()) {
      setState('ready')
      return
    }

    let cancelled = false

    async function checkAttendance() {
      if (!isSupabaseConfigured) {
        if (!cancelled) {
          setError('Chấm công yêu cầu Supabase. Liên hệ quản trị viên.')
          setState('error')
        }
        return
      }

      try {
        const server = await fetchAttendanceServerDate()
        const employeeId = getCurrentUserEmployeeId()
        const existing = await fetchAttendanceByEmployeeAndDate(employeeId, server.date)
        if (cancelled) return
        setServerDate(server.date)
        setState(existing ? 'ready' : 'required')
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể kiểm tra điểm danh.')
          setState('error')
        }
      }
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

  if (state === 'error') {
    return (
      <div className="app-loading" style={{ padding: 24, textAlign: 'center', color: '#b91c1c', minHeight: '100vh' }}>
        {error}
      </div>
    )
  }

  if (state === 'required') {
    return (
      <AttendanceCheckInModal
        serverDate={serverDate}
        onCompleted={() => setState('ready')}
      />
    )
  }

  return children
}
