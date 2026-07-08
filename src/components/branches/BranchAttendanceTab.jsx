import { useMemo, useState } from 'react'
import AttendanceMonthMatrix from '../attendance/AttendanceMonthMatrix'
import { useAttendanceData } from '../../hooks/useAttendanceData'
import { getCurrentMonthValue } from '../../utils/salaryReport'
import { buildAttendanceMonthMatrix } from '../../utils/attendanceViewHelpers'
import { buildAttendanceStats } from '../../utils/attendancePenalties'
import { loadEmployees } from '../../utils/employeeStorage'
import { formatCurrency } from '../../utils/invoice'
import { getAttendanceStatusLabel } from '../../constants/attendanceTypes'

export default function BranchAttendanceTab({ branchId }) {
  const [month, setMonth] = useState(getCurrentMonthValue())
  const fromDate = `${month}-01`
  const toDate = `${month}-31`

  const { records, loading, error } = useAttendanceData({ branchId, fromDate, toDate })
  const employees = useMemo(
    () => loadEmployees().filter((emp) => emp.branchId === branchId),
    [branchId],
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
      </div>

      {loading && <p className="admin-branches__hint">Đang tải chấm công...</p>}
      {error && <p className="admin-branches__hint admin-branches__hint--error">{error}</p>}

      {!loading && (
        <>
          <div className="admin-branches__info-grid admin-branches__info-grid--compact">
            <div><span>Bản ghi</span><strong>{stats.total}</strong></div>
            <div><span>Đúng giờ</span><strong>{stats.onTime}</strong></div>
            <div><span>Tổng phạt</span><strong>{formatCurrency(stats.totalPenalty)}</strong></div>
          </div>

          <AttendanceMonthMatrix days={matrix.days} rows={matrix.rows} />

          <div className="admin-branches__table-wrap">
            <table className="admin-branches__table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Nhân viên</th>
                  <th>Trạng thái</th>
                  <th>Phạt</th>
                  <th>Lý do</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && (
                  <tr><td colSpan={5}>Chưa có dữ liệu chấm công.</td></tr>
                )}
                {records.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
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
