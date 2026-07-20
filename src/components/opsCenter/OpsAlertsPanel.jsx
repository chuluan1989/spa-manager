function AlertRow({ label, value, unavailable, onClick }) {
  const display = unavailable
    ? 'Chưa đủ dữ liệu'
    : value == null
      ? 'Chưa đủ dữ liệu'
      : String(value)

  return (
    <li>
      <button type="button" className="ops-center__alert-row" onClick={onClick} disabled={!onClick}>
        <span>{label}</span>
        <strong className={unavailable || value == null ? 'is-muted' : ''}>{display}</strong>
      </button>
    </li>
  )
}

export default function OpsAlertsPanel({ alerts, loading, error, onNavigate }) {
  if (loading) {
    return (
      <section className="ops-center__panel">
        <h2>Cần xử lý</h2>
        <p className="ops-center__state">Đang tải…</p>
      </section>
    )
  }
  if (error) {
    return (
      <section className="ops-center__panel">
        <h2>Cần xử lý</h2>
        <p className="ops-center__state ops-center__state--error">{error}</p>
      </section>
    )
  }

  const kl1Unavailable = alerts?.kl1Incomplete == null
  const kl1Label = alerts?.kl1UnavailableReason
    ? `KL1 chưa hoàn thiện (${alerts.kl1UnavailableReason})`
    : 'KL1 chưa hoàn thiện'

  return (
    <section className="ops-center__panel">
      <h2>Cần xử lý</h2>
      <ul className="ops-center__alert-list">
        <AlertRow
          label="Yêu cầu sửa chấm công (pending)"
          value={alerts?.pendingAttendanceEdits}
          onClick={() => onNavigate?.('attendance')}
        />
        <AlertRow
          label={alerts?.lockedMonthLabel
            ? `Kỳ lương đang khóa (${alerts.lockedMonthLabel})`
            : 'Kỳ lương đang khóa (tháng hiện tại)'}
          value={alerts?.lockedPayrollMonths}
          onClick={() => onNavigate?.('salary')}
        />
        <AlertRow
          label={kl1Label}
          value={alerts?.kl1Incomplete}
          unavailable={kl1Unavailable}
          onClick={kl1Unavailable ? undefined : () => onNavigate?.('payroll1-admin')}
        />
      </ul>
    </section>
  )
}
