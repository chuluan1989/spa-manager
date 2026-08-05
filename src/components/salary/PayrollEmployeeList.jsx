import { useMemo } from 'react'
import { formatCurrency } from '../../utils/invoice'
import { formatWorkDays, sumEmployeePayrollTableTotals } from '../../utils/payrollViewHelpers'

/** Cột màn hình tổng lương — vừa 1 viewport desktop, net cuối cùng nổi bật. */
const COLUMNS = [
  { key: 'stt', label: 'STT', type: 'stt', align: 'center' },
  { key: 'employeeName', label: 'Tên nhân viên', type: 'name', align: 'left' },
  { key: 'workDays', label: 'Ngày công', type: 'days', align: 'right' },
  { key: 'ticketRevenue', label: 'Doanh thu tiền vé', type: 'money', align: 'right' },
  { key: 'tips', label: 'Tips', type: 'money', tone: 'tips', align: 'right' },
  { key: 'commission', label: 'Hoa hồng', type: 'money', tone: 'commission', align: 'right' },
  { key: 'bonus', label: 'Thưởng', type: 'money', tone: 'bonus', align: 'right' },
  { key: 'penalty', label: 'Phạt', type: 'money', tone: 'penalty', align: 'right' },
  { key: 'advance', label: 'Ứng lương', type: 'money', tone: 'advance', align: 'right' },
  { key: 'netSalary', label: 'Lương thực nhận', type: 'net', align: 'right' },
]

function cellClass(column) {
  return [
    column.align === 'right' ? 'salary-emp-table__cell--right' : '',
    column.align === 'left' ? 'salary-emp-table__cell--left' : '',
    column.align === 'center' ? 'salary-emp-table__cell--center' : '',
    column.type === 'money' || column.type === 'net' ? 'salary-emp-table__money' : '',
    column.tone ? `salary-emp-table__money--${column.tone}` : '',
    column.type === 'net' ? 'salary-emp-table__net' : '',
    column.type === 'days' ? 'salary-emp-table__days' : '',
    column.type === 'name' ? 'salary-emp-table__cell--name' : '',
  ].filter(Boolean).join(' ')
}

function renderCell(row, column, index, onSelectEmployee) {
  const value = row[column.key]

  switch (column.type) {
    case 'stt':
      return index + 1
    case 'name':
      return (
        <button
          type="button"
          className="salary-emp-table__name"
          onClick={(event) => {
            event.stopPropagation()
            onSelectEmployee?.(row)
          }}
        >
          {row.employeeName}
        </button>
      )
    case 'days':
      return formatWorkDays(value)
    case 'money':
    case 'net':
      return formatCurrency(value ?? 0)
    default:
      return value ?? '—'
  }
}

function renderTotalCell(column, totals) {
  switch (column.type) {
    case 'stt':
      return ''
    case 'name':
      return 'Tổng'
    case 'days':
      return formatWorkDays(totals.workDays)
    case 'money':
    case 'net':
      return formatCurrency(totals[column.key] ?? 0)
    default:
      return ''
  }
}

export default function PayrollEmployeeList({ rows, onSelectEmployee }) {
  const totals = useMemo(() => sumEmployeePayrollTableTotals(rows), [rows])

  if (!rows.length) {
    return <p className="salary-page__empty">Không tìm thấy nhân viên phù hợp.</p>
  }

  return (
    <div className="salary-emp-table-wrap">
      <table className="salary-emp-table salary-emp-table--summary">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} className={cellClass(column)}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.employeeId}
              className="salary-emp-table__row"
              onClick={() => onSelectEmployee?.(row)}
            >
              {COLUMNS.map((column) => (
                <td key={column.key} className={cellClass(column)}>
                  {renderCell(row, column, index, onSelectEmployee)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="salary-emp-table__totals">
            {COLUMNS.map((column) => (
              <td key={column.key} className={cellClass(column)}>
                {renderTotalCell(column, totals)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
