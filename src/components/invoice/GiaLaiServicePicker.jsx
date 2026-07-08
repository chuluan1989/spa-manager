import { useMemo, useState } from 'react'
import { formatCurrency } from '../../utils/invoice'
import { formatGiaLaiServiceName, getGiaLaiCatalogGroups } from '../../utils/giaLaiCatalog'
import './GiaLaiServicePicker.css'

function DurationChip({ minutes, price, serviceId, count, onAdd, onRemove }) {
  return (
    <div className={`gl-picker__duration${count > 0 ? ' gl-picker__duration--selected' : ''}`}>
      <button
        type="button"
        className="gl-picker__duration-btn"
        onClick={() => onAdd(serviceId)}
      >
        <span className="gl-picker__duration-time">{minutes}'</span>
        <span className="gl-picker__duration-price">{formatCurrency(price)}</span>
      </button>
      {count > 0 && (
        <div className="gl-picker__qty">
          <button type="button" onClick={() => onRemove(serviceId)} aria-label="Giảm">−</button>
          <span>{count}</span>
          <button type="button" onClick={() => onAdd(serviceId)} aria-label="Thêm">+</button>
        </div>
      )}
    </div>
  )
}

function SingleServiceRow({ id, name, durationMinutes, price, count, onAdd, onRemove }) {
  const label = formatGiaLaiServiceName(name, durationMinutes)
  return (
    <div className={`gl-picker__single${count > 0 ? ' gl-picker__single--selected' : ''}`}>
      <button type="button" className="gl-picker__single-btn" onClick={() => onAdd(id)}>
        <span>{label}</span>
        <strong>{formatCurrency(price)}</strong>
      </button>
      {count > 0 && (
        <div className="gl-picker__qty">
          <button type="button" onClick={() => onRemove(id)} aria-label="Giảm">−</button>
          <span>{count}</span>
          <button type="button" onClick={() => onAdd(id)} aria-label="Thêm">+</button>
        </div>
      )}
    </div>
  )
}

function ServiceFamily({ family, groupId, getCount, onAdd, onRemove }) {
  return (
    <div className="gl-picker__family">
      <div className="gl-picker__family-name">{family.name}</div>
      <div className="gl-picker__durations">
        {(family.variants ?? []).map((variant) => (
          <DurationChip
            key={variant.id}
            minutes={variant.durationMinutes}
            price={variant.price}
            serviceId={variant.id}
            count={getCount(variant.id)}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  )
}

function ServiceEntry({ entry, groupId, getCount, onAdd, onRemove }) {
  if (Array.isArray(entry.variants) && entry.variants.length > 0) {
    return (
      <ServiceFamily
        family={entry}
        groupId={groupId}
        getCount={getCount}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    )
  }

  return (
    <SingleServiceRow
      id={entry.id}
      name={entry.name}
      durationMinutes={entry.durationMinutes}
      price={entry.price}
      count={getCount(entry.id)}
      onAdd={onAdd}
      onRemove={onRemove}
    />
  )
}

export default function GiaLaiServicePicker({
  getCount,
  onAdd,
  onRemove,
}) {
  const groups = useMemo(() => getGiaLaiCatalogGroups(), [])
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(groups.map((group) => [group.id, group.id === 'combo'])),
  )

  const toggleGroup = (groupId) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  return (
    <div className="gl-picker">
      {groups.map((group) => {
        const isOpen = openGroups[group.id]
        return (
          <section key={group.id} className="gl-picker__group">
            <button
              type="button"
              className={`gl-picker__group-header${isOpen ? ' gl-picker__group-header--open' : ''}`}
              onClick={() => toggleGroup(group.id)}
              aria-expanded={isOpen}
            >
              <span className="gl-picker__group-chevron">{isOpen ? '▼' : '▶'}</span>
              <span>{group.name}</span>
            </button>

            {isOpen && (
              <div className="gl-picker__group-body">
                {(group.families ?? []).map((family) => (
                  <ServiceFamily
                    key={family.id}
                    family={family}
                    groupId={group.id}
                    getCount={getCount}
                    onAdd={onAdd}
                    onRemove={onRemove}
                  />
                ))}
                {(group.services ?? []).map((service) => (
                  <ServiceEntry
                    key={service.id ?? service.name}
                    entry={service}
                    groupId={group.id}
                    getCount={getCount}
                    onAdd={onAdd}
                    onRemove={onRemove}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
