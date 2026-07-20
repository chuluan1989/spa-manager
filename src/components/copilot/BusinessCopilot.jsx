import './BusinessCopilot.css'

function TrendBadge({ trend }) {
  if (!trend || trend.direction === 'flat') {
    return <span className="copilot-trend is-flat">0%</span>
  }
  const sign = trend.direction === 'up' ? '+' : '−'
  return (
    <span className={`copilot-trend is-${trend.direction}`}>
      {sign}{trend.percent}%
    </span>
  )
}

function BriefBar({ brief }) {
  const slots = [
    { key: 'task', label: 'Việc đầu tiên', value: brief?.firstTask?.text },
    { key: 'call', label: 'Người cần gọi', value: brief?.firstCall?.text },
    { key: 'branch', label: 'Chi nhánh cần xem', value: brief?.firstBranch?.text },
    { key: 'opp', label: 'Cơ hội tận dụng', value: brief?.firstOpportunity?.text },
  ].filter((s) => Boolean(s.value))

  if (slots.length === 0) return null

  return (
    <section className="copilot-brief" aria-label="Tóm tắt 30 giây">
      <header className="copilot-brief__head">
        <h2>Tóm tắt 30 giây</h2>
        <p>Chỉ hiện khi có dữ liệu thật — không suy đoán.</p>
      </header>
      <div className="copilot-brief__grid">
        {slots.map((slot) => (
          <div key={slot.key} className="copilot-brief__slot">
            <span className="copilot-brief__label">{slot.label}</span>
            <strong className="copilot-brief__value">{slot.value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function ActionCard({ item, variant, onAction }) {
  const isRisk = variant === 'risk'
  return (
    <article className={`copilot-card copilot-card--${variant}`}>
      <div className="copilot-card__top">
        {isRisk ? (
          <span className={`copilot-priority copilot-priority--${item.priority}`}>{item.priority}</span>
        ) : (
          <span className="copilot-priority copilot-priority--opp">Cơ hội</span>
        )}
        <h3>{item.title}</h3>
      </div>
      <p className="copilot-card__evidence"><span>Chứng minh:</span> {item.evidence}</p>
      {item.why ? <p className="copilot-card__why"><span>Vì sao:</span> {item.why}</p> : null}
      {item.scaleTo ? <p className="copilot-card__scale"><span>Nhân rộng:</span> {item.scaleTo}</p> : null}
      {Array.isArray(item.actionSteps) && item.actionSteps.length > 0 ? (
        <ol className="copilot-card__steps">
          {item.actionSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {item.cta?.pageId ? (
        <button
          type="button"
          className="copilot-card__cta"
          onClick={() => onAction(item.cta)}
        >
          {item.cta.label || 'Mở màn hình'}
        </button>
      ) : null}
    </article>
  )
}

function RankList({ title, rows }) {
  if (!rows?.length) return null
  return (
    <div className="copilot-rank">
      <h3>{title}</h3>
      <ol>
        {rows.map((row) => (
          <li key={row.id || row.name}>
            <span>{row.name}</span>
            <strong>{row.label}</strong>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function BusinessCopilot({
  loading,
  error,
  brief,
  alerts,
  opportunities,
  performance,
  onAction,
  onReload,
}) {
  return (
    <div className="copilot">
      <header className="copilot-header">
        <div>
          <h1>Tổng quan</h1>
          <p>Business Copilot — trợ lý điều hành (rule-based).</p>
        </div>
        <button type="button" className="copilot-refresh" onClick={onReload} disabled={loading}>
          {loading ? 'Đang tải…' : 'Làm mới'}
        </button>
      </header>

      {error ? <p className="copilot-error">{error}</p> : null}

      {!loading && !error ? <BriefBar brief={brief} /> : null}

      <div className="copilot-columns">
        <section className="copilot-column" aria-label="Cần xử lý">
          <header className="copilot-column__head">
            <h2>Cần xử lý</h2>
            <p>Rủi ro / mất tiền — ưu tiên P0 → P2</p>
          </header>
          {loading ? <p className="copilot-muted">Đang tải cảnh báo…</p> : null}
          {!loading && alerts.length === 0 ? (
            <p className="copilot-muted">Không có vấn đề theo quy tắc hiện tại.</p>
          ) : null}
          <div className="copilot-card-list">
            {alerts.map((alert) => (
              <ActionCard key={alert.id} item={alert} variant="risk" onAction={onAction} />
            ))}
          </div>
        </section>

        <section className="copilot-column" aria-label="Cơ hội hôm nay">
          <header className="copilot-column__head">
            <h2>Cơ hội hôm nay</h2>
            <p>Tín hiệu tăng trưởng có thể hành động</p>
          </header>
          {loading ? <p className="copilot-muted">Đang tải cơ hội…</p> : null}
          {!loading && opportunities.length === 0 ? (
            <p className="copilot-muted">Không có tín hiệu tăng trưởng hôm nay.</p>
          ) : null}
          <div className="copilot-card-list">
            {opportunities.map((opp) => (
              <ActionCard key={opp.id} item={opp} variant="opp" onAction={onAction} />
            ))}
          </div>
        </section>
      </div>

      {performance ? (
        <section className="copilot-performance" aria-label="Performance">
          <header className="copilot-column__head">
            <h2>Performance</h2>
            <p>Doanh thu hôm nay · Lợi nhuận tháng · Top</p>
          </header>
          <div className="copilot-kpi-row">
            <div className="copilot-kpi">
              <span>Doanh thu hôm nay</span>
              <strong>{performance.ticketRevenueTodayLabel}</strong>
              <TrendBadge trend={performance.revenueTrend} />
              <em>vs hôm qua</em>
            </div>
            <div className="copilot-kpi">
              <span>Lợi nhuận tháng</span>
              <strong>{performance.profitMonthLabel}</strong>
              <TrendBadge trend={performance.profitTrend} />
              <em>vs kỳ trước cùng độ dài</em>
            </div>
          </div>
          <div className="copilot-rank-grid">
            <RankList title="Top chi nhánh" rows={performance.topBranches} />
            <RankList title="Top nhân viên" rows={performance.topEmployees} />
            <RankList title="Top dịch vụ" rows={performance.topServices} />
          </div>
        </section>
      ) : null}
    </div>
  )
}
