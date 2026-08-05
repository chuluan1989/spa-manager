import { PAYROLL_ADJUSTMENT_LABELS, PAYROLL_DETAIL_LABELS, PAYROLL_WALLET_SOURCE } from '../../constants/payrollTypes'
import { formatCurrency } from '../../utils/invoice'
import { formatPayrollTime } from '../../utils/payrollLiveHelpers'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Gộp Tips + Hoa hồng cùng một hóa đơn thành 1 nhóm,
 * tránh hiểu nhầm mỗi dòng Tips/HH là một hóa đơn riêng.
 */
export function groupWalletTimelineEntries(entries = []) {
  const groups = []
  const invoiceBuckets = new Map()

  for (const entry of entries) {
    const invoiceId = entry?.meta?.invoiceId
    const isInvoicePart = entry?.source === PAYROLL_WALLET_SOURCE.INVOICE && invoiceId

    if (!isInvoicePart) {
      groups.push({
        key: entry.id || `${entry.date}-${entry.type}-${groups.length}`,
        kind: 'single',
        date: entry.date,
        time: entry.time,
        entry,
      })
      continue
    }

    const bucketKey = `${entry.date || ''}::${invoiceId}`
    if (!invoiceBuckets.has(bucketKey)) {
      const group = {
        key: bucketKey,
        kind: 'invoice',
        date: entry.date,
        time: entry.time,
        invoiceId,
        reason: entry.reason || '',
        createdBy: entry.createdBy || '',
        parts: [],
        amount: 0,
      }
      invoiceBuckets.set(bucketKey, group)
      groups.push(group)
    }
    const group = invoiceBuckets.get(bucketKey)
    group.parts.push(entry)
    group.amount += Number(entry.amount ?? 0)
    if (!group.time && entry.time) group.time = entry.time
    if (!group.reason && entry.reason) group.reason = entry.reason
  }

  return groups
}

function partLabel(entry) {
  const raw = String(entry.label ?? '')
  if (raw.startsWith('Hoa hồng')) return 'Hoa hồng'
  if (raw.startsWith('Tips')) return 'Tips'
  return PAYROLL_ADJUSTMENT_LABELS[entry.type] ?? entry.type
}

function invoiceTitle(group) {
  const first = group.parts[0]
  const raw = String(first?.label ?? '')
  const services = raw.includes('·') ? raw.split('·').slice(1).join('·').trim() : ''
  return services ? `Hóa đơn · ${services}` : 'Hóa đơn'
}

export default function PayrollWallet({ entries, employee, stats, mode = 'full' }) {
  if (mode !== 'timeline' && !employee) {
    return <p className="salary-page__empty">Chọn nhân viên để xem ví lương.</p>
  }

  const showHeader = mode === 'full' || mode === 'header'
  const showStats = showHeader && stats
  const showTimeline = mode === 'full' || mode === 'timeline'
  const groups = showTimeline ? groupWalletTimelineEntries(entries) : []

  return (
    <section className="salary-wallet">
      {showHeader && employee && (
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
      )}

      {showStats && (
        <div className="salary-wallet__stats">
          {[
            ['ticketRevenue', stats.ticketRevenue],
            ['commission', stats.commission],
            ['tips', stats.tips],
            ['bonus', stats.bonus],
            ['kpi', stats.kpi],
            ['penalty', stats.penalty],
            ['reduction', stats.reduction],
            ['advance', stats.advance],
            ['netSalary', stats.netSalary],
          ].map(([key, value]) => (
            <article key={key}>
              <span>{PAYROLL_DETAIL_LABELS[key]}</span>
              <strong>{formatCurrency(value ?? 0)}</strong>
            </article>
          ))}
        </div>
      )}

      {showTimeline && !entries.length ? (
        <p className="salary-page__empty">Chưa có phát sinh trong kỳ.</p>
      ) : showTimeline ? (
        <>
          <p className="salary-wallet__timeline-hint">
            Một hóa đơn có thể gồm nhiều khoản. Đây không phải số lượng hóa đơn.
          </p>
          <ol className="salary-wallet__timeline">
            {groups.map((group) => {
              if (group.kind === 'single') {
                const entry = group.entry
                const positive = entry.amount >= 0
                return (
                  <li key={group.key} className="salary-wallet__item">
                    <div className="salary-wallet__date">
                      {formatDate(entry.date)}
                      {entry.time && <small>{formatPayrollTime(entry.time)}</small>}
                    </div>
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
              }

              const positive = group.amount >= 0
              return (
                <li key={group.key} className="salary-wallet__item salary-wallet__item--invoice">
                  <div className="salary-wallet__date">
                    {formatDate(group.date)}
                    {group.time && <small>{formatPayrollTime(group.time)}</small>}
                  </div>
                  <div className="salary-wallet__body">
                    <div className="salary-wallet__invoice-head">
                      <strong>{invoiceTitle(group)}</strong>
                      <span className={`salary-wallet__amount ${positive ? 'is-plus' : 'is-minus'}`}>
                        {positive ? '+' : ''}{formatCurrency(group.amount)}
                      </span>
                    </div>
                    {group.reason && <p className="salary-wallet__reason">{group.reason}</p>}
                    <ul className="salary-wallet__parts">
                      {group.parts.map((part) => {
                        const partPositive = part.amount >= 0
                        return (
                          <li key={part.id}>
                            <span>{partLabel(part)}</span>
                            <span className={partPositive ? 'is-plus' : 'is-minus'}>
                              {partPositive ? '+' : ''}{formatCurrency(part.amount)}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                    {group.createdBy && <small>{group.createdBy}</small>}
                  </div>
                </li>
              )
            })}
          </ol>
        </>
      ) : null}
    </section>
  )
}
