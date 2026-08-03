import { useEffect, useMemo, useState } from 'react'
import { COMMISSION } from '../../constants/services'
import { getPayrollBranchDisplayTitle } from '../../constants/branchPayrollDisplay'
import {
  canEditBranchServicePricing,
  canViewBranchServicePricing,
  getCurrentUserBranch,
  isAdmin,
} from '../../constants/auth'
import { getActiveBranches } from '../../constants/branches'
import { formatCurrency } from '../../utils/invoice'
import {
  getBranchPricingMatrix,
  setBranchDurationPrice,
} from '../../utils/serviceCatalogV2Storage'
import {
  getServicePricingEditBlockReason,
  isServicePricingEditable,
} from '../../utils/servicePricingGuard'
import './ServiceCatalogTab.css'

const COMMISSION_OPTIONS = [
  { value: COMMISSION.NONE, label: '0%' },
  { value: COMMISSION.TEN, label: '10%' },
  { value: COMMISSION.TWENTY, label: '20%' },
]

export default function BranchServicePricingTab({ showToast, readOnly = false, fixedBranchId = '' }) {
  const branches = useMemo(() => {
    const all = getActiveBranches()
    if (fixedBranchId) return all.filter((branch) => branch.id === fixedBranchId)
    if (isAdmin()) return all
    return all.filter((branch) => canViewBranchServicePricing(branch.id))
  }, [fixedBranchId])

  const [branchId, setBranchId] = useState(() => {
    if (fixedBranchId) return fixedBranchId
    if (isAdmin()) return branches[0]?.id ?? ''
    return getCurrentUserBranch()
  })
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [onlineEditable, setOnlineEditable] = useState(() => isServicePricingEditable())
  const blockReason = getServicePricingEditBlockReason()

  const canEdit = !readOnly && canEditBranchServicePricing(branchId) && onlineEditable
  const rows = useMemo(() => (branchId ? getBranchPricingMatrix(branchId) : []), [branchId, revision])

  useEffect(() => {
    const syncOnline = () => setOnlineEditable(isServicePricingEditable())
    window.addEventListener('online', syncOnline)
    window.addEventListener('offline', syncOnline)
    return () => {
      window.removeEventListener('online', syncOnline)
      window.removeEventListener('offline', syncOnline)
    }
  }, [])

  const refresh = () => setRevision((value) => value + 1)

  const groupedRows = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      if (!map.has(row.categoryId)) {
        map.set(row.categoryId, { categoryName: row.categoryName, services: new Map() })
      }
      const category = map.get(row.categoryId)
      if (!category.services.has(row.serviceId)) {
        category.services.set(row.serviceId, { serviceName: row.serviceName, serviceStatus: row.serviceStatus, durations: [] })
      }
      category.services.get(row.serviceId).durations.push(row)
    }
    return [...map.values()]
  }, [rows])

  const saveEdit = async () => {
    if (!editing || !canEdit) return
    const reason = String(editing.reason ?? '').trim()
    if (!reason) {
      showToast('Vui lòng nhập lý do thay đổi.')
      return
    }
    setSaving(true)
    try {
      await setBranchDurationPrice(branchId, editing.durationId, {
        price: Number(editing.price),
        commissionPercent: Number(editing.commissionPercent),
      }, { reason })
      setEditing(null)
      showToast('Đã cập nhật giá chi nhánh')
      refresh()
    } catch (error) {
      showToast(error?.message || 'Không thể lưu bảng giá.')
    } finally {
      setSaving(false)
    }
  }

  if (!branches.length) {
    return <p className="svc-catalog__empty">Bạn không có quyền xem bảng giá.</p>
  }

  return (
    <section className="settings__card">
      <div className="settings__card-header">
        <div>
          <h3 className="settings__card-title">Bảng giá theo chi nhánh</h3>
          <p className="settings__hint settings__hint--inline">
            {canEdit
              ? 'Chọn chi nhánh và nhập giá cho từng thời lượng. Hóa đơn đọc trực tiếp từ đây.'
              : 'Chế độ xem — chỉ xem bảng giá chi nhánh của bạn.'}
          </p>
          {blockReason ? <p className="settings__hint" role="status">{blockReason}</p> : null}
        </div>
      </div>

      <div className="settings__branch-pricing-toolbar">
        {!fixedBranchId && (
          <label className="settings__field">
            <span>Chi nhánh</span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={!isAdmin()}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {getPayrollBranchDisplayTitle(branch.id, branch.name)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {groupedRows.map((category) => (
        <div key={category.categoryName}>
          <h4 className="svc-pricing__category">{category.categoryName}</h4>
          {[...category.services.values()].map((service) => (
            <div key={service.serviceName}>
              <div className={`svc-pricing__service${service.serviceStatus === 'inactive' ? ' is-muted' : ''}`}>{service.serviceName}</div>
              <div className="settings__table-wrap">
                <table className="settings__table">
                  <thead>
                    <tr>
                      <th>Thời lượng</th>
                      <th>Giá</th>
                      <th>% Hoa hồng</th>
                      {canEdit && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {service.durations.map((row) => (
                      <tr key={row.durationId} className={row.durationStatus === 'inactive' ? 'is-muted' : ''}>
                        <td>{row.durationMinutes ? `${row.durationMinutes}'` : '—'}</td>
                        <td className="settings__money">{formatCurrency(row.price)}</td>
                        <td>{row.commissionPercent}%</td>
                        {canEdit && (
                          <td>
                            <button
                              type="button"
                              className="settings__btn settings__btn--small settings__btn--secondary"
                              onClick={() => setEditing({
                                durationId: row.durationId,
                                label: `${service.serviceName} ${row.durationMinutes ? `${row.durationMinutes}'` : ''}`.trim(),
                                price: String(row.price),
                                commissionPercent: row.commissionPercent,
                                reason: '',
                              })}
                            >
                              Sửa giá
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
        <div className="settings__modal-backdrop" onClick={() => !saving && setEditing(null)}>
          <div className="settings__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">Sửa giá — {editing.label}</h3>
            <div className="settings__form-grid">
              <label className="settings__field">
                <span>Giá</span>
                <input type="number" min="0" step="1000" value={editing.price} disabled={saving} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </label>
              <label className="settings__field">
                <span>% Hoa hồng</span>
                <select value={editing.commissionPercent} disabled={saving} onChange={(e) => setEditing({ ...editing, commissionPercent: Number(e.target.value) })}>
                  {COMMISSION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="settings__field">
                <span>Lý do (bắt buộc)</span>
                <input value={editing.reason} disabled={saving} onChange={(e) => setEditing({ ...editing, reason: e.target.value })} />
              </label>
            </div>
            <div className="settings__modal-actions">
              <button type="button" className="settings__btn settings__btn--primary" onClick={saveEdit} disabled={saving || !String(editing.reason ?? '').trim()}>
                {saving ? 'Đang lưu…' : 'Lưu'}
              </button>
              <button type="button" className="settings__btn" onClick={() => setEditing(null)} disabled={saving}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
