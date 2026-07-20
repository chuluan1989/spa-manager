export default function OpsTodayHealth({ health, loading, error, onNavigate }) {
  if (loading) {
    return (
      <section className="ops-center__panel">
        <h2>Sức khỏe hôm nay</h2>
        <p className="ops-center__state">Đang tải…</p>
      </section>
    )
  }
  if (error) {
    return (
      <section className="ops-center__panel">
        <h2>Sức khỏe hôm nay</h2>
        <p className="ops-center__state ops-center__state--error">{error}</p>
      </section>
    )
  }
  if (!health) {
    return (
      <section className="ops-center__panel">
        <h2>Sức khỏe hôm nay</h2>
        <p className="ops-center__state">Chưa đủ dữ liệu</p>
      </section>
    )
  }

  return (
    <section className="ops-center__panel">
      <h2>Sức khỏe hôm nay</h2>
      <p className="ops-center__panel-sub">Ngày {health.date}</p>
      <ul className="ops-center__stat-list">
        <li>
          <span>Nhân viên đang làm</span>
          <strong>{health.activeCount}</strong>
        </li>
        <li>
          <span>Đã chấm công</span>
          <strong>{health.checkedInCount}</strong>
        </li>
        <li>
          <span>Chưa chấm công</span>
          <strong>{health.notCheckedInCount}</strong>
        </li>
      </ul>
      <button type="button" className="ops-center__link-btn" onClick={() => onNavigate?.('attendance')}>
        Mở Chấm công →
      </button>
    </section>
  )
}
