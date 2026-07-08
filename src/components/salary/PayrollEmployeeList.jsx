import { formatCurrency } from '../../utils/invoice'
import { formatWorkDays } from '../../utils/payrollViewHelpers'

const COLUMNS = [
  { key: 'avatar', label: 'Avatar', type: 'avatar' },
  { key: 'employeeName', label: 'Tên nhân viên', type: 'name' },
  { key: 'position', label: 'Chức vụ', type: 'text' },
  { key: 'workDays', label: 'Ngày công', type: 'days' },
  { key: 'ticketRevenue', label: 'Doanh thu tiền vé', type: 'money' },
  { key: 'commission', label: 'Hoa hồng', type: 'money', tone: 'commission' },
  { key: 'tips', label: 'Tips', type: 'money', tone: 'tips' },
  { key: 'bonus', label: 'Thưởng', type: 'money', tone: 'bonus' },
  { key: 'penalty', label: 'Phạt', type: 'money', tone: 'penalty' },
  { key: 'reduction', label: 'Giảm lương', type: 'money', tone: 'reduction' },
  { key: 'advance', label: 'Ứng lương', type: 'money', tone: 'advance' },
  { key: 'paidAmount', label: 'Đã thanh toán', type: 'money' },
  { key: 'remainingAmount', label: 'Còn phải trả', type: 'money' },
  { key: 'netSalary', label: 'Lương thực nhận', type: 'net' },
]

function renderCell(row, column, onSelectEmployee) {
  const value = row[column.key]

  switch (column.type) {
    case 'avatar':
      return row.avatar ? (
        <img src={row.avatar} alt="" className="salary-emp-table__avatar" />
      ) : (
        <span className="salary-emp-table__avatar salary-emp-table__avatar--ph">
          {row.employeeName.charAt(0)}
        </span>
      )
    case 'name':
      return (
        <>
          <button
            type="button"
            className="salary-emp-table__name"
            onClick={() => onSelectEmployee?.(row)}
          >
            {row.employeeName}
          </button>
          {row.phone && <small className="salary-emp-table__phone">{row.phone}</small>}
        </>
      )
    case 'text':
      return value || '—'
    case 'days':
      return formatWorkDays(value)
    case 'money':
      return formatCurrency(value ?? 0)
    case 'net':
      return formatCurrency(value ?? 0)
    default:
      return value ?? '—'
  }
}

export default function PayrollEmployeeList({ rows, onSelectEmployee }) {
  if (!rows.length) {
    return <p className="salary-page__empty">Không tìm thấy nhân viên phù hợp.</p>
  }

  return (
    <div className="salary-emp-table-wrap">
      <table className="salary-emp-table salary-emp-table--fixed">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.employeeId}
              className="salary-emp-table__row"
              onClick={() => onSelectEmployee?.(row)}
            >
              {COLUMNS.map((column) => (
                <td
                  key={column.key}
                  className={[
                    column.type === 'money' ? 'salary-emp-table__money' : '',
                    column.tone ? `salary-emp-table__money--${column.tone}` : '',
                    column.type === 'net' ? 'salary-emp-table__net' : '',
                    column.type === 'days' ? 'salary-emp-table__days' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {renderCell(row, column, onSelectEmployee)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
