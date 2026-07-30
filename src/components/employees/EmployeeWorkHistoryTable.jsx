import { getBranchName } from '../../utils/branchStorage'
import { buildWorkAssignmentHistoryRows } from '../../utils/employeeBranchTimeline'
import './EmployeeWorkHistoryTable.css'

function formatDisplayDate(value) {
  if (!value) return '—'
  const [y, m, d] = String(value).slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export default function EmployeeWorkHistoryTable({ employee, title = 'Lịch sử công tác' }) {
  const rows = buildWorkAssignmentHistoryRows(employee, { getBranchName })

  return (
    <div className="employee-work-history">
      <h4 className="employee-work-history__title">{title}</h4>
      {rows.length === 0 ? (
        <p className="employee-work-history__empty">Chưa có lịch sử công tác.</p>
      ) : (
        <div className="employee-work-history__scroll">
          <table className="employee-work-history__table">
            <thead>
              <tr>
                <th>Từ ngày</th>
                <th>Đến ngày</th>
                <th>Chi nhánh</th>
                <th>Chức vụ</th>
                <th>Lý do chuyển</th>
                <th>Ghi chú</th>
                <th>Người thực hiện</th>
                <th>Ngày tạo</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.branchId}-${row.fromDate || 'start'}-${row.toDate || 'current'}`}>
                  <td>{formatDisplayDate(row.fromDate)}</td>
                  <td>{row.toDate ? formatDisplayDate(row.toDate) : 'Hiện tại'}</td>
                  <td>{row.branchName || '—'}</td>
                  <td>{row.roleTitle || '—'}</td>
                  <td>{row.reason || '—'}</td>
                  <td>{row.note || '—'}</td>
                  <td>{row.createdBy || '—'}</td>
                  <td>{row.createdAt ? formatDisplayDate(row.createdAt) : '—'}</td>
                  <td>
                    <span className={`employee-work-history__status employee-work-history__status--${row.status}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
