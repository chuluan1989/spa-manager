import { useCallback, useEffect, useState } from 'react'
import { ATTENDANCE_BACKEND_ERROR_MESSAGE } from '../constants/attendanceUi'
import { fetchAttendanceFiltered, subscribeAttendanceChanges } from '../repositories/attendanceRepository'
import { subscribeToDataSync } from '../utils/supabaseSync'
import { changedEntitiesInclude, createDebouncedLiveReload } from '../utils/liveDataReload'

export function useAttendanceData(filters) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchAttendanceFiltered(filters)
      setRecords(rows)
    } catch (err) {
      setError(err?.message || ATTENDANCE_BACKEND_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    const debounced = createDebouncedLiveReload(reload)
    const unsubAttendance = subscribeAttendanceChanges(() => debounced())
    const unsubSync = subscribeToDataSync((detail) => {
      if (changedEntitiesInclude(detail, ['attendance'])) debounced()
    })
    return () => {
      debounced.cancel()
      unsubAttendance()
      unsubSync()
    }
  }, [reload])

  return { records, loading, error, reload }
}
