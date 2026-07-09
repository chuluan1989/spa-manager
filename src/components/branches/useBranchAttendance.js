import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAttendanceFiltered } from '../../repositories/attendanceRepository'

/** Chấm công theo branch_id — fetch trực tiếp, không subscribe realtime (tránh crash trên Production). */
export function useBranchAttendance({ branchId, fromDate, toDate }) {
  const filters = useMemo(
    () => ({ branchId: branchId || '', fromDate: fromDate || '', toDate: toDate || '' }),
    [branchId, fromDate, toDate],
  )

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchAttendanceFiltered(filters)
      setRecords(rows ?? [])
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

  return { records, loading, error, reload }
}
