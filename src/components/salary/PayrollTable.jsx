import { PAYROLL_DETAIL_CATEGORIES, PAYROLL_DETAIL_LABELS } from '../../constants/payrollTypes'
import { formatCurrency } from '../../utils/invoice'

const COLUMNS = [
  { key: 'employeeName', label: 'Nhân viên', clickable: false },
  { key: 'branchName', label: 'Chi nhánh', clickable: false },
  { key: PAYROLL_DETAIL_CATEGORIES.BASE, label: PAYROLL_DETAIL_LABELS.baseSalary, clickable: false },
  { key: PAYROLL_DETAIL_CATEGORIES.REVENUE, label: PAYROLL_DETAIL_LABELS.ticketRevenue, clickable: true },
  { key: PAYROLL_DETAIL_CATEGORIES.COMMISSION, label: PAYROLL_DETAIL_LABELS.commission, clickable: true },
  { key: PAYROLL_DETAIL_CATEGORIES.TIPS, label: PAYROLL_DETAIL_LABELS.tips, clickable: true },
  { key: PAYROLL_DETAIL_CATEGORIES.BONUS, label: PAYROLL_DETAIL_LABELS.bonus, clickable: true },
  { key: PAYROLL_DETAIL_CATEGORIES.REDUCTION, label: PAYROLL_DETAIL_LABELS.reduction, clickable: true },
  { key: PAYROLL_DETAIL_CATEGORIES.PENALTY, label: PAYROLL_DETAIL_LABELS.penalty, clickable: true },
  { key: PAYROLL_DETAIL_CATEGORIES.ADVANCE, label: PAYROLL_DETAIL_LABELS.advance, clickable: true },
  { key: PAYROLL_DETAIL_CATEGORIES.ADJUSTMENT, label: PAYROLL_DETAIL_LABELS.otherAdjustment, clickable: true },
  { key: PAYROLL_DETAIL_CATEGORIES.NET, label: PAYROLL_DETAIL_LABELS.netSalary, clickable: true, variant: 'net' },
]

export default function PayrollTable({ rows, onCellClick, onRowSelect, selectedEmployeeId }) {
  if (!rows.length) {
    return <p className="salary-page__empty">Chưa có dữ liệu lương trong kỳ đã chọn.</p>
  }

  return (
    <div className="salary-table-wrap">
      <table className="salary-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.employeeId}
              className={selectedEmployeeId === row.employeeId ? 'is-selected' : ''}
            >
              {COLUMNS.map((col) => {
                const value = row[col.key]
                const isMoney = col.key !== 'employeeName' && col.key !== 'branchName'
                if (!col.clickable) {
                  return (
                    <td key={col.key}>
                      {col.key === 'employeeName' ? (
                        <button
                          type="button"
                          className="salary-table__name"
                          onClick={() => onRowSelect?.(row)}
                        >
                          {value}
                        </button>
                      ) : value}
                    </td>
                  )
                }
                return (
                  <td key={col.key} className={col.variant === 'net' ? 'salary-table__net' : ''}>
                    <button
                      type="button"
                      className={`salary-table__money salary-table__money--${col.key}`}
                      onClick={() => onCellClick?.(row, col.key)}
                      disabled={!value}
                    >
                      {isMoney ? formatCurrency(value) : value}
                    </button>
                  </td>
                )
              })}
              <td>
                <button type="button" className="salary-table__action" onClick={() => onRowSelect?.(row)}>
                  Phiếu lương
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
