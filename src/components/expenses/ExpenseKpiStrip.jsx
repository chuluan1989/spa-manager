import { formatCurrency } from '../../utils/invoice'
import './ExpenseModules.css'

export default function ExpenseKpiStrip({
  total,
  fixedTotal,
  variableTotal,
  count,
  byType = [],
  activeTypeId = '',
  onSelectTotal,
  onSelectFixed,
  onSelectVariable,
  onSelectType,
}) {
  return (
    <section className="exp-kpi">
      <button type="button" className={`exp-kpi__card ${!activeTypeId ? 'is-active' : ''}`} onClick={onSelectTotal}>
        <span>Tổng chi phí</span>
        <strong>{formatCurrency(total)}</strong>
      </button>
      <button type="button" className="exp-kpi__card" onClick={onSelectFixed}>
        <span>Chi phí cố định</span>
        <strong>{formatCurrency(fixedTotal)}</strong>
      </button>
      <button type="button" className="exp-kpi__card" onClick={onSelectVariable}>
        <span>Chi phí phát sinh</span>
        <strong>{formatCurrency(variableTotal)}</strong>
      </button>
      <button type="button" className="exp-kpi__card" onClick={onSelectTotal}>
        <span>Số khoản chi</span>
        <strong>{count}</strong>
      </button>
      {byType.slice(0, 6).map((row) => (
        <button
          key={row.typeId}
          type="button"
          className={`exp-kpi__chip ${activeTypeId === row.typeId ? 'is-active' : ''}`}
          onClick={() => onSelectType?.(row.typeId)}
          title="Bấm để lọc bảng bên dưới"
        >
          {row.label}: {formatCurrency(row.total)}
        </button>
      ))}
    </section>
  )
}
