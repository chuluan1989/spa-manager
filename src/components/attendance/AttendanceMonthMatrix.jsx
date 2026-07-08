import { getAttendanceStatusLabel } from '../../constants/attendanceTypes'
import { formatCurrency } from '../../utils/invoice'

function formatDay(value) {
  if (!value) return '—'
  const [, , day] = value.split('-')
  return day
}

export default function AttendanceMonthMatrix({ days, rows }) {
  if (!rows.length) {
    return <p className="attendance-page__empty">Không có nhân viên trong phạm vi.</p>
  }

  return (
    <div className="attendance-page__matrix-wrap">
      <table className="attendance-page__matrix">
        <thead>
          <tr>
            <th>Nhân viên</th>
            {days.map((date) => (
              <th key={date}>{formatDay(date)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employeeId}>
              <td className="attendance-page__matrix-name">{row.employeeName}</td>
              {row.cells.map((record, index) => (
                <td
                  key={`${row.employeeId}-${days[index]}`}
                  className={`attendance-page__matrix-cell${record ? ' has-data' : ''}`}
                  title={record ? getAttendanceStatusLabel(record.status) : 'Chưa chấm công'}
                >
                  {record ? (
                    <>
                      <span>{getAttendanceStatusLabel(record.status).split(' ')[0]}</span>
                      {record.penaltyAmount > 0 && (
                        <small>{formatCurrency(record.penaltyAmount)}</small>
                      )}
                    </>
                  ) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
