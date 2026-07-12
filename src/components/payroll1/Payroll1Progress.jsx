import './payroll1.css'

/** Thanh tiến độ + checklist 3 mục kỳ lương 1. */
export default function Payroll1Progress({ status, compact = false }) {
  if (!status) return null

  const percent = Number(status.progressPercent ?? 0)
  const items = [
    { id: 'profile', label: 'Hồ sơ', done: status.profileComplete },
    { id: 'attendance', label: 'Chấm công', done: status.attendanceComplete },
    { id: 'invoices', label: 'Hóa đơn', done: status.invoiceReviewComplete },
  ]

  return (
    <div className={`payroll1-progress${compact ? ' payroll1-progress--compact' : ''}`}>
      <div className="payroll1-progress__head">
        <span>Hoàn thành dữ liệu kỳ lương 1</span>
        <strong>{percent}%</strong>
      </div>
      <div
        className="payroll1-progress__bar"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="payroll1-progress__fill" style={{ width: `${percent}%` }} />
      </div>
      <ul className="payroll1-progress__checklist">
        {items.map((item) => (
          <li key={item.id} className={item.done ? 'is-done' : 'is-pending'}>
            <span aria-hidden="true">{item.done ? '✓' : '○'}</span>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
