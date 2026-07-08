import { useMemo, useState } from 'react'
import { usePayrollData } from '../../hooks/usePayrollData'
import { getCurrentMonthValue } from '../../utils/salaryReport'
import { formatCurrency } from '../../utils/invoice'

export default function BranchSalaryTab({ branchId }) {
  const [month, setMonth] = useState(getCurrentMonthValue())
  const { report, loading, error } = usePayrollData({ month, branchId })

  const rows = useMemo(() => report?.rows ?? [], [report])

  return (
    <div className="admin-branches__salary">
      <div className="admin-branches__filters">
        <label>
          <span>Tháng lương</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>

      {loading && <p className="admin-branches__hint">Đang tải bảng lương...</p>}
      {error && <p className="admin-branches__hint admin-branches__hint--error">{error}</p>}

      {!loading && (
        <div className="admin-branches__table-wrap">
          <table className="admin-branches__table">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Ngày công</th>
                <th>Doanh thu</th>
                <th>Hoa hồng</th>
                <th>Tips</th>
                <th>Phạt</th>
                <th>Lương thực nhận</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7}>Chưa có dữ liệu lương.</td></tr>
              )}
              {rows.map((row) => (
                <tr key={row.employeeId}>
                  <td>{row.employeeName}</td>
                  <td>{row.workDays ?? 0}</td>
                  <td>{formatCurrency(row.ticketRevenue ?? 0)}</td>
                  <td>{formatCurrency(row.commission ?? 0)}</td>
                  <td>{formatCurrency(row.tips ?? 0)}</td>
                  <td>{formatCurrency(row.penalty ?? 0)}</td>
                  <td>{formatCurrency(row.netSalary ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
