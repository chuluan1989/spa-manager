import { useMemo, useState } from 'react'
import { formatCurrency } from '../../utils/invoice'
import { formatCatalogServiceName } from '../../utils/serviceCatalog'
import { isBranchSupportServiceId } from '../../constants/branchSupportService'
import './GroupedServicePicker.css'

function DurationChip({ minutes, price, serviceId, count, onAdd, onRemove }) {
  return (
    <div className={`svc-picker__duration${count > 0 ? ' svc-picker__duration--selected' : ''}`}>
      <button
        type="button"
        className="svc-picker__duration-btn"
        onClick={() => onAdd(serviceId)}
      >
        <span className="svc-picker__duration-time">{minutes}'</span>
        <span className="svc-picker__duration-price">{formatCurrency(price)}</span>
      </button>
      {count > 0 && (
        <div className="svc-picker__qty">
          <button type="button" onClick={() => onRemove(serviceId)} aria-label="Giảm">−</button>
          <span>{count}</span>
          <button type="button" onClick={() => onAdd(serviceId)} aria-label="Thêm">+</button>
        </div>
      )}
    </div>
  )
}

function SingleServiceRow({ id, name, durationMinutes, price, isSupportService, count, onAdd, onRemove }) {
  const label = formatCatalogServiceName(name, durationMinutes)
  const priceLabel = isSupportService || isBranchSupportServiceId(id) ? 'Tự nhập' : formatCurrency(price)
  return (
    <div className={`svc-picker__single${count > 0 ? ' svc-picker__single--selected' : ''}`}>
      <button type="button" className="svc-picker__single-btn" onClick={() => onAdd(id)}>
        <span>{label}</span>
        <strong>{priceLabel}</strong>
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

function ServiceFamily({ family, getCount, onAdd, onRemove }) {
  return (
    <div className="svc-picker__family">
      <div className="svc-picker__family-name">{family.name}</div>
      <div className="svc-picker__durations">
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

function ServiceEntry({ entry, getCount, onAdd, onRemove }) {
  if (Array.isArray(entry.variants) && entry.variants.length > 0) {
    return (
      <ServiceFamily
        family={entry}
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
      isSupportService={entry.isSupportService}
      count={getCount(entry.id)}
      onAdd={onAdd}
      onRemove={onRemove}
    />
  )
}

export default function GroupedServicePicker({
  groups = [],
  getCount,
  onAdd,
  onRemove,
}) {
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(groups.map((group) => [group.id, group.id === 'combo'])),
  )

  const openState = useMemo(() => {
    const next = { ...openGroups }
    for (const group of groups) {
      if (next[group.id] === undefined) next[group.id] = group.id === 'combo'
    }
    return next
  }, [groups, openGroups])

  const toggleGroup = (groupId) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  if (!groups.length) {
    return <p className="svc-picker__empty">Không có danh mục dịch vụ cho chi nhánh này.</p>
  }

  return (
    <div className="svc-picker">
      {groups.map((group) => {
        const isOpen = openState[group.id]
        return (
          <section key={group.id} className="svc-picker__group">
            <button
              type="button"
              className={`svc-picker__group-header${isOpen ? ' svc-picker__group-header--open' : ''}`}
              onClick={() => toggleGroup(group.id)}
              aria-expanded={isOpen}
            >
              <span className="svc-picker__group-chevron">{isOpen ? '▼' : '▶'}</span>
              <span>{group.name}</span>
            </button>

            {isOpen && (
              <div className="svc-picker__group-body">
                {(group.families ?? []).map((family) => (
                  <ServiceFamily
                    key={family.id}
                    family={family}
                    getCount={getCount}
                    onAdd={onAdd}
                    onRemove={onRemove}
                  />
                ))}
                {(group.services ?? []).map((service) => (
                  <ServiceEntry
                    key={service.id ?? service.name}
                    entry={service}
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
