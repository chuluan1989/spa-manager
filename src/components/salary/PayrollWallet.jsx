import { PAYROLL_ADJUSTMENT_LABELS, PAYROLL_DETAIL_LABELS } from '../../constants/payrollTypes'
import { formatCurrency } from '../../utils/invoice'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

export default function PayrollWallet({ entries, employee, stats }) {
  if (!employee) {
    return <p className="salary-page__empty">Chọn nhân viên để xem ví lương.</p>
  }

  return (
    <section className="salary-wallet">
      <header className="salary-wallet__profile">
        {employee.avatar ? (
          <img src={employee.avatar} alt="" className="salary-wallet__avatar" />
        ) : (
          <div className="salary-wallet__avatar salary-wallet__avatar--placeholder">
            {(employee.employeeName ?? employee.name ?? '?').charAt(0)}
          </div>
        )}
        <div>
          <h3>{employee.employeeName ?? employee.name}</h3>
          <p>{employee.branchName} · {employee.position || 'Nhân viên'}</p>
        </div>
      </header>

      {stats && (
        <div className="salary-wallet__stats">
          {[
            ['ticketRevenue', stats.ticketRevenue],
            ['commission', stats.commission],
            ['tips', stats.tips],
            ['bonus', stats.bonus],
            ['penalty', stats.penalty],
            ['reduction', stats.reduction],
            ['advance', stats.advance],
            ['otherAdjustment', stats.otherAdjustment],
            ['netSalary', stats.netSalary],
          ].map(([key, value]) => (
            <article key={key}>
              <span>{PAYROLL_DETAIL_LABELS[key]}</span>
              <strong>{formatCurrency(value ?? 0)}</strong>
            </article>
          ))}
        </div>
      )}

      {!entries.length ? (
        <p className="salary-page__empty">Chưa có phát sinh trong kỳ.</p>
      ) : (
        <ol className="salary-wallet__timeline">
          {entries.map((entry) => {
            const positive = entry.amount >= 0
            return (
              <li key={entry.id} className="salary-wallet__item">
                <div className="salary-wallet__date">{formatDate(entry.date)}</div>
                <div className="salary-wallet__body">
                  <strong>{entry.label ?? PAYROLL_ADJUSTMENT_LABELS[entry.type] ?? entry.type}</strong>
                  <span className={`salary-wallet__amount ${positive ? 'is-plus' : 'is-minus'}`}>
                    {positive ? '+' : ''}{formatCurrency(entry.amount)}
                  </span>
                  {entry.reason && <p className="salary-wallet__reason">{entry.reason}</p>}
                  {entry.createdBy && <small>{entry.createdBy}</small>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
