import { useMemo, useState } from 'react'
import { usePayrollData } from '../../hooks/usePayrollData'
import { getCurrentMonthValue } from '../../utils/salaryReport'
import { formatCurrency } from '../../utils/invoice'
import { mergeEmployeePayrollRows } from '../../utils/payrollViewHelpers'

export default function BranchSalaryTab({ branchId }) {
  const [month, setMonth] = useState(getCurrentMonthValue())
  const { employees, report, loading, error } = usePayrollData({ month, branchId })

  const rows = useMemo(
    () => mergeEmployeePayrollRows(employees, report?.rows ?? [], { branchId }),
    [employees, report, branchId],
  )

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
        <div className="admin-branches__table-wrap admin-branches__table-wrap--wide">
          <table className="admin-branches__table admin-branches__table--compact">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Chức vụ</th>
                <th>Ngày công</th>
                <th>Doanh thu tiền vé</th>
                <th>Hoa hồng</th>
                <th>Tips</th>
                <th>Thưởng</th>
                <th>Phạt</th>
                <th>Giảm lương</th>
                <th>Ứng lương</th>
                <th>Đã thanh toán</th>
                <th>Còn phải trả</th>
                <th>Lương thực nhận</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={13}>Chưa có nhân viên tại chi nhánh này.</td></tr>
              )}
              {rows.map((row) => (
                <tr key={row.employeeId}>
                  <td>{row.employeeName}</td>
                  <td>{row.position || '—'}</td>
                  <td>{row.workDays ?? 0}</td>
                  <td>{formatCurrency(row.ticketRevenue ?? 0)}</td>
                  <td>{formatCurrency(row.commission ?? 0)}</td>
                  <td>{formatCurrency(row.tips ?? 0)}</td>
                  <td>{formatCurrency(row.bonus ?? 0)}</td>
                  <td>{formatCurrency(row.penalty ?? 0)}</td>
                  <td>{formatCurrency(row.reduction ?? 0)}</td>
                  <td>{formatCurrency(row.advance ?? 0)}</td>
                  <td>{formatCurrency(row.paidAmount ?? 0)}</td>
                  <td>{formatCurrency(row.remainingAmount ?? 0)}</td>
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
