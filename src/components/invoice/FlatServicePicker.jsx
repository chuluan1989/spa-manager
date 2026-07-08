import { formatCurrency } from '../../utils/invoice'
import './GroupedServicePicker.css'

function FlatServiceRow({ id, name, price, count, onAdd, onRemove }) {
  return (
    <div className={`svc-picker__single${count > 0 ? ' svc-picker__single--selected' : ''}`}>
      <button type="button" className="svc-picker__single-btn" onClick={() => onAdd(id)}>
        <span>{name}</span>
        <strong>{formatCurrency(price)}</strong>
      </button>
      {count > 0 && (
        <div className="svc-picker__qty">
          <button type="button" onClick={() => onRemove(id)} aria-label="Giảm">−</button>
          <span>{count}</span>
          <button type="button" onClick={() => onAdd(id)} aria-label="Thêm">+</button>
        </div>
      )}
    </div>
  )
}

export default function FlatServicePicker({
  services = [],
  getCount,
  onAdd,
  onRemove,
}) {
  if (!services.length) {
    return <p className="svc-picker__empty">Không có dịch vụ trong bảng giá chi nhánh này.</p>
  }

  return (
    <div className="svc-picker svc-picker--flat">
      <div className="svc-picker__group-body">
        {services.map((service) => (
          <FlatServiceRow
            key={service.id}
            id={service.id}
            name={service.name}
            price={service.price}
            count={getCount(service.id)}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  )
}
