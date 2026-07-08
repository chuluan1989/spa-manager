import { formatCurrency } from '../../utils/invoice'
import { formatPayrollTime } from '../../utils/payrollLiveHelpers'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

export default function PayrollAttendanceStats({ stats }) {
  if (!stats) return null

  const rows = [
    { label: 'Đi làm', value: stats.onTime },
    { label: 'Đi trễ', value: stats.late },
    { label: 'Về sớm', value: stats.early },
    { label: 'Nghỉ có phép', value: stats.permittedLeave },
    { label: 'Nghỉ không phép', value: stats.unpermittedLeave },
    { label: 'Nghỉ T7-CN-Lễ', value: stats.weekendHoliday },
    { label: 'Tiền phạt phát sinh', value: formatCurrency(stats.penaltyAmount ?? 0), isMoney: true },
  ]

  return (
    <section className="salary-panel">
      <header className="salary-panel__head">
        <h4>Thống kê ngày công</h4>
        <span className="salary-panel__live">Realtime</span>
      </header>
      <dl className="salary-attendance-stats">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.isMoney ? row.value : row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function PayrollRevenuePanel({ rows, onSelectInvoice }) {
  return (
    <section className="salary-panel">
      <header className="salary-panel__head">
        <h4>Doanh thu tiền vé</h4>
        <span>{rows.length} hóa đơn</span>
      </header>
      {!rows.length ? (
        <p className="salary-page__empty">Chưa có hóa đơn trong kỳ.</p>
      ) : (
        <div className="salary-detail-table-wrap">
          <table className="salary-detail-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Khách</th>
                <th>Dịch vụ</th>
                <th>Giá vé</th>
                <th>HH</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={onSelectInvoice ? 'is-clickable' : ''}
                  onClick={() => onSelectInvoice?.(row)}
                >
                  <td>
                    {formatDate(row.date)}
                    {row.time && <small>{formatPayrollTime(row.time)}</small>}
                  </td>
                  <td>{row.customerName}</td>
                  <td>{row.services}</td>
                  <td>{formatCurrency(row.ticketRevenue)}</td>
                  <td>{formatCurrency(row.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function PayrollTipsPanel({ rows }) {
  return (
    <section className="salary-panel">
      <header className="salary-panel__head">
        <h4>Tips theo khách</h4>
        <span>{rows.length} lượt</span>
      </header>
      {!rows.length ? (
        <p className="salary-page__empty">Chưa có tips trong kỳ.</p>
      ) : (
        <ol className="salary-tips-list">
          {rows.map((row) => (
            <li key={row.id} className="salary-tips-list__item">
              <div className="salary-tips-list__time">
                {formatPayrollTime(row.time) || formatDate(row.date)}
              </div>
              <div className="salary-tips-list__body">
                <strong>{row.customerName}</strong>
                <span>{row.services}</span>
                <em>Tips {formatCurrency(row.tips)}</em>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function PayrollAdjustmentHistory({ title, rows, showCreator = true }) {
  return (
    <section className="salary-panel">
      <header className="salary-panel__head">
        <h4>{title}</h4>
        <span>{rows.length} khoản</span>
      </header>
      {!rows.length ? (
        <p className="salary-page__empty">Chưa có phát sinh.</p>
      ) : (
        <div className="salary-detail-table-wrap">
          <table className="salary-detail-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Lý do</th>
                {showCreator && <th>Người tạo</th>}
                <th>Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.reason || '—'}</td>
                  {showCreator && <td>{row.createdBy || '—'}</td>}
                  <td>{formatCurrency(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
