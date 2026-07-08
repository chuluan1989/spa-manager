import { useCallback, useEffect, useState } from 'react'
import { fetchAttendanceFiltered, subscribeAttendanceChanges } from '../repositories/attendanceRepository'

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
      setError(err?.message ?? 'Không thể tải dữ liệu chấm công.')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => subscribeAttendanceChanges(() => {
    reload()
  }), [reload])

  return { records, loading, error, reload }
}
