function PanelSkeleton({ rows = 3 }) {
  return (
    <ul className="ops-center__stat-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="ops-center__stat-row ops-center__stat-row--skeleton">
          <span className="ops-center__skeleton ops-center__skeleton--label" />
          <span className="ops-center__skeleton ops-center__skeleton--num" />
        </li>
      ))}
    </ul>
  )
}

function HealthRow({ label, value, onClick }) {
  return (
    <li>
      <button type="button" className="ops-center__stat-row" onClick={onClick}>
        <span>{label}</span>
        <strong>{value}</strong>
      </button>
    </li>
  )
}

export default function OpsTodayHealth({ health, loading, refreshing = false, error, onNavigate }) {
  const openAttendance = () => onNavigate?.('attendance')

  return (
    <section className={`ops-center__panel ${refreshing ? 'is-refreshing' : ''}`}>
      <h2>Sức khỏe hôm nay</h2>

      {loading ? (
        <PanelSkeleton rows={3} />
      ) : error ? (
        <p className="ops-center__state ops-center__state--error">{error}</p>
      ) : !health ? (
        <p className="ops-center__state">Chưa có dữ liệu</p>
      ) : (
        <>
          <p className="ops-center__panel-sub">Ngày {health.date}</p>
          <ul className="ops-center__stat-list">
            <HealthRow
              label="Nhân viên đang làm"
              value={health.activeCount}
              onClick={openAttendance}
            />
            <HealthRow
              label="Đã chấm công"
              value={health.checkedInCount}
              onClick={openAttendance}
            />
            <HealthRow
              label="Chưa chấm công"
              value={health.notCheckedInCount}
              onClick={openAttendance}
            />
          </ul>
          <button type="button" className="ops-center__link-btn" onClick={openAttendance}>
            Mở Chấm công →
          </button>
        </>
      )}
    </section>
  )
}
