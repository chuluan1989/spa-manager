import './payroll1.css'

/** Thanh tiến độ: chỉ Hồ sơ + Chấm công (không dùng hóa đơn/tour). */
export default function Payroll1Progress({ status, compact = false }) {
  if (!status) return null

  const percent = Number(status.progressPercent ?? 0)
  const items = [
    { id: 'profile', label: 'Hồ sơ', done: status.profileComplete },
    { id: 'attendance', label: 'Chấm công', done: status.attendanceComplete },
  ]

  return (
    <div className={`payroll1-progress${compact ? ' payroll1-progress--compact' : ''}`}>
      <div className="payroll1-progress__head">
        <span>Hoàn thành hồ sơ & chấm công</span>
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
