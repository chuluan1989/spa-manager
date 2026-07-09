import { useMemo } from 'react'
import { useAttendanceData } from '../../hooks/useAttendanceData'

/** Chấm công theo branch_id — memo hóa filters để tránh vòng lặp render. */
export function useBranchAttendance({ branchId, fromDate, toDate }) {
  const filters = useMemo(
    () => ({ branchId: branchId || '', fromDate: fromDate || '', toDate: toDate || '' }),
    [branchId, fromDate, toDate],
  )
  return useAttendanceData(filters)
}
