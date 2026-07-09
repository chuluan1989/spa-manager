import { useMemo, useState } from 'react'
import { COMMISSION } from '../../constants/services'
import { formatCurrency } from '../../utils/invoice'
import { getBranchById } from '../../utils/branchStorage'
import {
  getBranchPricingMatrix,
  setBranchDurationPrice,
} from '../../utils/serviceCatalogV2Storage'
import BranchEmptyState from './BranchEmptyState'

const COMMISSION_OPTIONS = [
  { value: COMMISSION.NONE, label: '0%' },
  { value: COMMISSION.TEN, label: '10%' },
  { value: COMMISSION.TWENTY, label: '20%' },
]

export default function BranchPricingTab({ branchId, showToast, readOnly = false }) {
  const branch = getBranchById(branchId)
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(null)

  const rows = useMemo(
    () => (branchId ? getBranchPricingMatrix(branchId) : []),
    [branchId, revision],
  )

  const groupedRows = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      if (!map.has(row.categoryId)) {
        map.set(row.categoryId, { categoryName: row.categoryName, services: new Map() })
      }
      const category = map.get(row.categoryId)
      if (!category.services.has(row.serviceId)) {
        category.services.set(row.serviceId, {
          serviceId: row.serviceId,
          serviceName: row.serviceName,
          serviceStatus: row.serviceStatus,
          durations: [],
        })
      }
      category.services.get(row.serviceId).durations.push(row)
    }
    return [...map.values()]
  }, [rows])

  const refresh = () => setRevision((value) => value + 1)

  const saveEdit = () => {
    if (!editing || readOnly) return
    setBranchDurationPrice(branchId, editing.durationId, {
      price: Number(editing.price),
      commissionPercent: Number(editing.commissionPercent),
    })
    setEditing(null)
    showToast?.('Đã cập nhật giá chi nhánh')
    refresh()
  }

  if (!branch) {
    return <BranchEmptyState message={`Không tìm thấy chi nhánh (branch_id: ${branchId || '—'}).`} />
  }

  if (rows.length === 0) {
    return (
      <div className="admin-branches__pricing">
        <p className="admin-branches__hint">branch_id: {branchId}</p>
        <BranchEmptyState />
      </div>
    )
  }

  return (
    <div className="admin-branches__pricing">
      <p className="admin-branches__hint">
        Bảng giá — {branch.name} · branch_id: {branchId}
      </p>

      {groupedRows.map((category) => (
        <div key={category.categoryName} className="admin-branches__pricing-category">
          <h4 className="admin-branches__section-title">{category.categoryName}</h4>
          {[...category.services.values()].map((service) => (
            <div key={service.serviceId} className="admin-branches__pricing-service">
              <p className="admin-branches__hint">
                {service.serviceName}
                {service.serviceStatus === 'inactive' ? ' (ngừng)' : ''}
                {' · service_id: '}
                {service.serviceId}
              </p>
              <div className="admin-branches__table-wrap">
                <table className="admin-branches__table admin-branches__table--compact">
                  <thead>
                    <tr>
                      <th>Thời lượng</th>
                      <th>Giá</th>
                      <th>% hoa hồng</th>
                      {!readOnly && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {service.durations.map((row) => (
                      <tr key={row.durationId} className={row.durationStatus === 'inactive' ? 'is-muted' : ''}>
                        <td>{row.durationMinutes ? `${row.durationMinutes}'` : '—'}</td>
                        <td>{formatCurrency(row.price)}</td>
                        <td>{row.commissionPercent}%</td>
                        {!readOnly && (
                          <td>
                            <button
                              type="button"
                              className="admin-branches__btn admin-branches__btn--small"
                              onClick={() => setEditing({
                                durationId: row.durationId,
                                label: `${service.serviceName} ${row.durationMinutes ? `${row.durationMinutes}'` : ''}`.trim(),
                                price: String(row.price),
                                commissionPercent: row.commissionPercent,
                              })}
                            >
                              Sửa
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}

      {editing && (
        <div className="admin-branches__modal-backdrop" onClick={() => setEditing(null)}>
          <div className="admin-branches__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-branches__modal-title">Sửa giá — {editing.label}</h3>
            <div className="admin-branches__form-grid">
              <label className="admin-branches__field">
                <span>Giá</span>
                <input type="number" min="0" step="1000" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </label>
              <label className="admin-branches__field">
                <span>% hoa hồng</span>
                <select value={editing.commissionPercent} onChange={(e) => setEditing({ ...editing, commissionPercent: Number(e.target.value) })}>
                  {COMMISSION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-branches__modal-actions">
              <button type="button" className="admin-branches__btn admin-branches__btn--primary" onClick={saveEdit}>Lưu</button>
              <button type="button" className="admin-branches__btn" onClick={() => setEditing(null)}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
