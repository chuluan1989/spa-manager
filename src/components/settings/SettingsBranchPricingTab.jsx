import { useMemo, useState } from 'react'
import { COMMISSION } from '../../constants/services'
import { getPriceGroupById } from '../../constants/priceGroups'
import { loadBranches } from '../../utils/branchStorage'
import {
  enableCustomBranchPricing,
  getServicesForBranch,
  isBranchUsingCustomPricing,
  resetBranchPricingToDefault,
  updateBranchServicePricing,
} from '../../utils/branchPricingStorage'
import { formatCurrency } from '../../utils/invoice'

const COMMISSION_OPTIONS = [
  { value: COMMISSION.NONE, label: '0%' },
  { value: COMMISSION.TEN, label: '10%' },
  { value: COMMISSION.TWENTY, label: '20%' },
]

export default function SettingsBranchPricingTab({ showToast }) {
  const branches = useMemo(() => loadBranches(), [])
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '')
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(null)

  const branch = branches.find((item) => item.id === branchId)
  const useCustom = branchId ? isBranchUsingCustomPricing(branchId) : false
  const services = useMemo(
    () => (branchId ? getServicesForBranch(branchId, { includeInactive: true }) : []),
    [branchId, revision],
  )

  const refresh = () => setRevision((value) => value + 1)

  const handleUseDefault = () => {
    if (!branchId) return
    if (!window.confirm('Chuyển chi nhánh này về bảng giá mặc định của nhóm?')) return
    resetBranchPricingToDefault(branchId)
    showToast('Đã dùng bảng giá mặc định')
    refresh()
  }

  const handleCreateCustom = () => {
    if (!branchId) return
    enableCustomBranchPricing(branchId)
    showToast('Đã tạo bảng giá riêng cho chi nhánh')
    refresh()
  }

  const saveEdit = () => {
    if (!editing) return
    updateBranchServicePricing(branchId, editing.serviceId, {
      price: Number(editing.price),
      commissionPercent: Number(editing.commissionPercent),
    })
    setEditing(null)
    showToast('Đã cập nhật giá chi nhánh')
    refresh()
  }

  const priceGroupName = getPriceGroupById(branch?.priceGroupId)?.name ?? '—'

  return (
    <section className="settings__card">
      <div className="settings__card-header">
        <div>
          <h3 className="settings__card-title">Bảng giá theo chi nhánh</h3>
          <p className="settings__hint settings__hint--inline">
            Sửa giá và hoa hồng riêng từng chi nhánh hoặc dùng bảng giá nhóm mặc định.
          </p>
        </div>
      </div>

      <div className="settings__branch-pricing-toolbar">
        <label className="settings__field">
          <span>Chọn chi nhánh</span>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <div className="settings__actions-row">
          <button type="button" className="settings__btn settings__btn--secondary" onClick={handleUseDefault}>
            Dùng bảng giá mặc định
          </button>
          <button type="button" className="settings__btn settings__btn--primary" onClick={handleCreateCustom}>
            Tạo bảng giá riêng cho chi nhánh này
          </button>
        </div>
      </div>

      {branch && (
        <p className="settings__price-list-note">
          Nhóm bảng giá: <strong>{priceGroupName}</strong> — {useCustom ? 'Đang dùng bảng giá riêng' : 'Đang dùng bảng giá mặc định nhóm'}
        </p>
      )}

      <div className="settings__table-wrap">
        <table className="settings__table">
          <thead>
            <tr>
              <th>Dịch vụ</th>
              <th>Giá</th>
              <th>% Hoa hồng</th>
              <th>Nguồn giá</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id}>
                <td>{service.name}</td>
                <td className="settings__money">{formatCurrency(service.price)}</td>
                <td>{service.commissionPercent}%</td>
                <td>{service.isCustomPrice ? 'Riêng chi nhánh' : 'Mặc định nhóm'}</td>
                <td>
                  <button
                    type="button"
                    className="settings__btn settings__btn--small settings__btn--secondary"
                    onClick={() => setEditing({
                      serviceId: service.id,
                      name: service.name,
                      price: String(service.price),
                      commissionPercent: service.commissionPercent,
                    })}
                  >
                    Sửa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="settings__modal-backdrop" onClick={() => setEditing(null)}>
          <div className="settings__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">Sửa giá — {editing.name}</h3>
            <div className="settings__form-grid">
              <label className="settings__field">
                <span>Giá</span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={editing.price}
                  onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                />
              </label>
              <label className="settings__field">
                <span>% Hoa hồng</span>
                <select
                  value={editing.commissionPercent}
                  onChange={(e) => setEditing({ ...editing, commissionPercent: Number(e.target.value) })}
                >
                  {COMMISSION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="settings__modal-actions">
              <button type="button" className="settings__btn settings__btn--primary" onClick={saveEdit}>Lưu</button>
              <button type="button" className="settings__btn" onClick={() => setEditing(null)}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
