import { useMemo, useState } from 'react'
import AttendanceMonthMatrix from '../attendance/AttendanceMonthMatrix'
import { getCurrentMonthValue } from '../../utils/salaryReport'
import { buildAttendanceMonthMatrix } from '../../utils/attendanceViewHelpers'
import { buildAttendanceStats } from '../../utils/attendancePenalties'
import { employeeBelongsToBranch } from '../../utils/branchEmployeeMatch'
import { formatCurrency } from '../../utils/invoice'
import { getAttendanceStatusLabel } from '../../constants/attendanceTypes'
import { useBranchHubData } from './useBranchHubData'
import { useBranchAttendance } from './useBranchAttendance'
import BranchEmptyState from './BranchEmptyState'

export default function BranchAttendanceTab({ branchId }) {
  const [month, setMonth] = useState(getCurrentMonthValue())
  const monthRange = useMemo(() => {
    const [yearStr, monthStr] = month.split('-')
    const year = Number(yearStr)
    const monthNum = Number(monthStr)
    const lastDay = new Date(year, monthNum, 0).getDate()
    return {
      fromDate: `${month}-01`,
      toDate: `${month}-${String(lastDay).padStart(2, '0')}`,
    }
  }, [month])

  const { records, loading, error } = useBranchAttendance({
    branchId,
    fromDate: monthRange.fromDate,
    toDate: monthRange.toDate,
  })
  const { employees: hubEmployees } = useBranchHubData({ branchId, month })

  const employees = useMemo(
    () => hubEmployees.filter((emp) => employeeBelongsToBranch(emp, branchId)),
    [hubEmployees, branchId],
  )

  const matrix = useMemo(
    () => buildAttendanceMonthMatrix(employees, records, month),
    [records, employees, month],
  )

  const stats = useMemo(() => buildAttendanceStats(records), [records])

  return (
    <div className="admin-branches__attendance">
      <div className="admin-branches__filters">
        <label>
          <span>Tháng</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <p className="admin-branches__hint">branch_id: {branchId}</p>
      </div>

      {loading && <p className="admin-branches__hint">Đang tải chấm công...</p>}
      {error && <p className="admin-branches__hint admin-branches__hint--error">{error}</p>}

      {!loading && !error && records.length === 0 && employees.length === 0 && (
        <BranchEmptyState />
      )}

      {!loading && (
        <>
          <div className="admin-branches__info-grid admin-branches__info-grid--compact">
            <div><span>Bản ghi</span><strong>{stats.total}</strong></div>
            <div><span>Đúng giờ</span><strong>{stats.onTime}</strong></div>
            <div><span>Tổng phạt</span><strong>{formatCurrency(stats.totalPenalty)}</strong></div>
          </div>

          {employees.length > 0 && (
            <AttendanceMonthMatrix days={matrix.days} rows={matrix.rows} />
          )}

          <div className="admin-branches__table-wrap">
            <table className="admin-branches__table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>employee_id</th>
                  <th>Nhân viên</th>
                  <th>Trạng thái</th>
                  <th>Phạt</th>
                  <th>Lý do</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && (
                  <tr><td colSpan={6}>Chưa có dữ liệu chấm công trong tháng này.</td></tr>
                )}
                {records.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td className="admin-branches__mono">{row.employeeId || '—'}</td>
                    <td>{row.employeeName}</td>
                    <td>{getAttendanceStatusLabel(row.status)}</td>
                    <td>{formatCurrency(row.penaltyAmount ?? 0)}</td>
                    <td>{row.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
