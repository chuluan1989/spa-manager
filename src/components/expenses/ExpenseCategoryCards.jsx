import { formatCurrency } from '../../utils/invoice'
import './ExpenseModules.css'

export default function ExpenseCategoryCards({ cards, activeCategoryId = '', onSelectCategory }) {
  return (
    <section className="exp-mod__section">
      <div className="exp-mod__section-head">
        <h3 className="exp-mod__section-title">Phân loại chi phí</h3>
      </div>
      <div className="exp-mod__category-grid">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className={`exp-mod__category-card ${activeCategoryId === card.id ? 'is-active' : ''}`}
            onClick={() => onSelectCategory(card.id)}
          >
            <span className="exp-mod__category-label">{card.label}</span>
            <strong className="exp-mod__category-value">{formatCurrency(card.total)}</strong>
          </button>
        ))}
      </div>
    </section>
  )
}
