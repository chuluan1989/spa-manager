import './MiniBarChart.css'

export default function MiniBarChart({ items = [], valueKey = 'value', labelKey = 'label', formatValue }) {
  if (!items.length) {
    return <p className="mini-chart__empty">Chưa có dữ liệu biểu đồ</p>
  }

  const max = Math.max(...items.map((item) => Number(item[valueKey] ?? 0)), 1)

  return (
    <div className="mini-chart">
      <div className="mini-chart__bars">
        {items.map((item, index) => {
          const value = Number(item[valueKey] ?? 0)
          const height = Math.max(4, (value / max) * 100)
          return (
            <div key={item.id ?? item[labelKey] ?? index} className="mini-chart__col ks-animate-in" style={{ animationDelay: `${index * 60}ms` }}>
              <div className="mini-chart__bar-wrap">
                <div className="mini-chart__bar" style={{ height: `${height}%` }} title={formatValue ? formatValue(value) : String(value)} />
              </div>
              <span className="mini-chart__label">{item[labelKey]}</span>
              <span className="mini-chart__value">{formatValue ? formatValue(value) : value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
