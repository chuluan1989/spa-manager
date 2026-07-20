function PanelSkeleton({ rows = 3 }) {
  return (
    <ul className="ops-center__alert-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <div className="ops-center__alert-row ops-center__alert-row--skeleton">
            <span className="ops-center__skeleton ops-center__skeleton--label" />
            <span className="ops-center__skeleton ops-center__skeleton--num" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function AlertRow({ label, value, unavailable, onClick }) {
  const display = unavailable || value == null
    ? 'Chưa có dữ liệu'
    : String(value)

  return (
    <li>
      <button
        type="button"
        className="ops-center__alert-row"
        onClick={onClick}
        disabled={!onClick}
      >
        <span>{label}</span>
        <strong className={unavailable || value == null ? 'is-muted' : ''}>{display}</strong>
      </button>
    </li>
  )
}

export default function OpsAlertsPanel({ alerts, loading, refreshing = false, error, onNavigate }) {
  const kl1Unavailable = !alerts || alerts.kl1Incomplete == null
  const kl1Label = alerts?.kl1UnavailableReason
    ? `KL1 chưa hoàn thiện`
    : 'KL1 chưa hoàn thiện'

  return (
    <section className={`ops-center__panel ${refreshing ? 'is-refreshing' : ''}`}>
      <h2>Cần xử lý</h2>

      {loading ? (
        <PanelSkeleton rows={3} />
      ) : error ? (
        <p className="ops-center__state ops-center__state--error">{error}</p>
      ) : !alerts ? (
        <p className="ops-center__state">Chưa có dữ liệu</p>
      ) : (
        <ul className="ops-center__alert-list">
          <AlertRow
            label="Yêu cầu sửa chấm công (pending)"
            value={alerts.pendingAttendanceEdits}
            onClick={() => onNavigate?.('attendance')}
          />
          <AlertRow
            label={alerts.lockedMonthLabel
              ? `Kỳ lương đang khóa (${alerts.lockedMonthLabel})`
              : 'Kỳ lương đang khóa (tháng hiện tại)'}
            value={alerts.lockedPayrollMonths}
            onClick={() => onNavigate?.('salary')}
          />
          <AlertRow
            label={kl1Label}
            value={alerts.kl1Incomplete}
            unavailable={kl1Unavailable}
            onClick={() => onNavigate?.('payroll1-admin')}
          />
          {kl1Unavailable && alerts.kl1UnavailableReason ? (
            <li className="ops-center__hint">{alerts.kl1UnavailableReason}</li>
          ) : null}
        </ul>
      )}
    </section>
  )
}
