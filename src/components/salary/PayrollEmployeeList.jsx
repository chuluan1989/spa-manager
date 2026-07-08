import { formatCurrency } from '../../utils/invoice'
import { getEmployeeStatusLabel } from '../../utils/payrollViewHelpers'

export default function PayrollEmployeeList({ rows, onSelectEmployee }) {
  if (!rows.length) {
    return <p className="salary-page__empty">Không tìm thấy nhân viên phù hợp.</p>
  }

  return (
    <div className="salary-emp-table-wrap">
      <table className="salary-emp-table">
        <thead>
          <tr>
            <th>Avatar</th>
            <th>Tên nhân viên</th>
            <th>Chức vụ</th>
            <th>Doanh thu tiền vé</th>
            <th>Hoa hồng</th>
            <th>Tips</th>
            <th>Thưởng</th>
            <th>Phạt</th>
            <th>Ứng lương</th>
            <th>Lương thực nhận</th>
            <th>Trạng thái</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employeeId}>
              <td>
                {row.avatar ? (
                  <img src={row.avatar} alt="" className="salary-emp-table__avatar" />
                ) : (
                  <span className="salary-emp-table__avatar salary-emp-table__avatar--ph">
                    {row.employeeName.charAt(0)}
                  </span>
                )}
              </td>
              <td>
                <button
                  type="button"
                  className="salary-emp-table__name"
                  onClick={() => onSelectEmployee?.(row)}
                >
                  {row.employeeName}
                </button>
                {row.phone && <small className="salary-emp-table__phone">{row.phone}</small>}
              </td>
              <td>{row.position || '—'}</td>
              <td className="salary-emp-table__money">{formatCurrency(row.ticketRevenue)}</td>
              <td className="salary-emp-table__money salary-emp-table__money--commission">
                {formatCurrency(row.commission)}
              </td>
              <td className="salary-emp-table__money salary-emp-table__money--tips">
                {formatCurrency(row.tips)}
              </td>
              <td className="salary-emp-table__money salary-emp-table__money--bonus">
                {formatCurrency(row.bonus)}
              </td>
              <td className="salary-emp-table__money salary-emp-table__money--penalty">
                {formatCurrency(row.penalty)}
              </td>
              <td className="salary-emp-table__money salary-emp-table__money--advance">
                {formatCurrency(row.advance)}
              </td>
              <td className="salary-emp-table__net">{formatCurrency(row.netSalary)}</td>
              <td>
                <span className={`salary-emp-table__status salary-emp-table__status--${row.status}`}>
                  {getEmployeeStatusLabel(row.status)}
                </span>
              </td>
              <td>
                <button type="button" className="salary-emp-table__action" onClick={() => onSelectEmployee?.(row)}>
                  Chi tiết →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
