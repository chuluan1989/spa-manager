import { formatCurrency } from '../../utils/invoice'
import './ExpenseModules.css'

const COLORS = [
  '#0f766e',
  '#b45309',
  '#1d4ed8',
  '#be123c',
  '#7c3aed',
  '#047857',
  '#c2410c',
  '#0369a1',
  '#4b5563',
]

function buildConicGradient(segments) {
  if (!segments.length) return '#e5e7eb'
  let cursor = 0
  const parts = segments.map((seg) => {
    const start = cursor
    cursor += seg.percent
    return `${seg.color} ${start}% ${cursor}%`
  })
  return `conic-gradient(${parts.join(', ')})`
}

export default function CostShareChart({ lines = [], title = 'Tỷ trọng chi phí' }) {
  const total = lines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0)
  const segments = lines
    .filter((line) => Number(line.amount) > 0)
    .map((line, index) => ({
      ...line,
      amount: Number(line.amount),
      percent: total > 0 ? (Number(line.amount) / total) * 100 : 0,
      color: COLORS[index % COLORS.length],
    }))

  return (
    <div className="exp-mod__chart-panel">
      <h4>{title}</h4>
      <div className="exp-mod__chart-body">
        <div
          className="exp-mod__donut"
          style={{ background: buildConicGradient(segments) }}
          aria-hidden
        >
          <div className="exp-mod__donut-hole">
            <strong>{formatCurrency(total)}</strong>
            <span>Tổng</span>
          </div>
        </div>
        <ul className="exp-mod__chart-legend">
          {segments.length === 0 ? (
            <li>Chưa có chi phí trong kỳ</li>
          ) : segments.map((seg) => (
            <li key={seg.id}>
              <span className="exp-mod__swatch" style={{ background: seg.color }} />
              <span className="exp-mod__legend-label">{seg.label}</span>
              <strong>{formatCurrency(seg.amount)}</strong>
              <em>{seg.percent.toFixed(1)}%</em>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
