import { useMemo, useState } from 'react'
import { COMMISSION } from '../../constants/services'
import { getPriceGroupsWithBranchLabels } from '../../constants/priceGroups'
import { formatCurrency } from '../../utils/invoice'
import {
  addService,
  disableService,
  enableService,
  getServicesForPriceList,
  getStatusLabel,
  loadServices,
  SERVICE_STATUS,
  softDeleteService,
  updateService,
} from '../../utils/serviceStorage'

const COMMISSION_OPTIONS = [
  { value: COMMISSION.NONE, label: '0%' },
  { value: COMMISSION.TEN, label: '10%' },
  { value: COMMISSION.TWENTY, label: '20%' },
]

const EMPTY_FORM = {
  name: '',
  price: '',
  commissionPercent: COMMISSION.NONE,
  status: SERVICE_STATUS.ACTIVE,
}

export default function SettingsServicesTab({ showToast }) {
  const [catalog, setCatalog] = useState(() => loadServices())
  const [activePriceListId, setActivePriceListId] = useState('standard')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  const priceGroups = useMemo(() => getPriceGroupsWithBranchLabels(), [catalog])
  const activePriceList = priceGroups.find((group) => group.id === activePriceListId) ?? priceGroups[0]
  const pricedServices = useMemo(
    () => getServicesForPriceList(activePriceListId),
    [activePriceListId, catalog],
  )

  const refresh = () => setCatalog(loadServices())

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setErrors({})
    setModal({ mode: 'add', priceListId: activePriceListId })
  }

  const openEdit = (service) => {
    setForm({
      name: service.name,
      price: String(service.price),
      commissionPercent: service.commissionPercent,
      status: service.status,
    })
    setErrors({})
    setModal({ mode: 'edit', id: service.id, priceListId: activePriceListId })
  }

  const closeModal = () => {
    setModal(null)
    setForm(EMPTY_FORM)
    setErrors({})
  }

  const save = () => {
    const next = {}
    if (!form.name?.trim()) next.name = 'Vui lòng nhập tên dịch vụ'
    if (!form.price || Number(form.price) < 0) next.price = 'Vui lòng nhập giá hợp lệ'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const payload = {
      name: form.name,
      price: Number(form.price),
      commissionPercent: Number(form.commissionPercent),
      status: form.status,
      priceListId: modal.priceListId,
    }

    if (modal.mode === 'add') {
      addService(payload)
      showToast('Thêm dịch vụ thành công')
    } else {
      updateService(modal.id, payload)
      showToast(`Cập nhật dịch vụ (${activePriceList?.name}) thành công`)
    }
    closeModal()
    refresh()
  }

  const handleDisable = (service) => {
    disableService(service.id)
    showToast('Đã tạm tắt dịch vụ')
    refresh()
  }

  const handleEnable = (service) => {
    enableService(service.id)
    showToast('Đã bật lại dịch vụ')
    refresh()
  }

  const handleSoftDelete = (service) => {
    if (!window.confirm(`Xóa mềm dịch vụ "${service.name}"?`)) return
    softDeleteService(service.id)
    showToast('Đã xóa mềm dịch vụ')
    refresh()
  }

  return (
    <section className="settings__card">
      <div className="settings__card-header">
        <div>
          <h3 className="settings__card-title">Quản lý dịch vụ & bảng giá nhóm</h3>
          <p className="settings__hint settings__hint--inline">
            Thêm dịch vụ vào nhóm đang xem; giá mặc định được sao chép sang các nhóm bảng giá khác.
          </p>
        </div>
        <button type="button" className="settings__btn settings__btn--primary" onClick={openAdd}>
          + Thêm dịch vụ
        </button>
      </div>

      <div className="settings__price-tabs">
        {priceGroups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={`settings__price-tab${activePriceListId === group.id ? ' settings__price-tab--active' : ''}`}
            onClick={() => setActivePriceListId(group.id)}
          >
            {group.name}
          </button>
        ))}
      </div>
      <p className="settings__price-list-note">Áp dụng cho: {activePriceList?.branchLabel}</p>

      <div className="settings__table-wrap">
        <table className="settings__table">
          <thead>
            <tr>
              <th>Tên dịch vụ</th>
              <th>Giá vé</th>
              <th>% Hoa hồng</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {pricedServices.map((service) => (
              <tr key={service.id}>
                <td>{service.name}</td>
                <td className="settings__money">{formatCurrency(service.price)}</td>
                <td>{service.commissionPercent}%</td>
                <td>
                  <span className={`settings__status settings__status--${service.status === SERVICE_STATUS.ACTIVE ? 'active' : 'inactive'}`}>
                    {getStatusLabel(service.status)}
                  </span>
                </td>
                <td className="settings__actions-cell">
                  <button type="button" className="settings__btn settings__btn--small settings__btn--secondary" onClick={() => openEdit(service)}>
                    Sửa
                  </button>
                  {service.status === SERVICE_STATUS.ACTIVE ? (
                    <button type="button" className="settings__btn settings__btn--small" onClick={() => handleDisable(service)}>
                      Tạm tắt
                    </button>
                  ) : service.status === SERVICE_STATUS.INACTIVE ? (
                    <button type="button" className="settings__btn settings__btn--small" onClick={() => handleEnable(service)}>
                      Bật lại
                    </button>
                  ) : null}
                  {service.status !== SERVICE_STATUS.DELETED && (
                    <button type="button" className="settings__btn settings__btn--small settings__btn--danger" onClick={() => handleSoftDelete(service)}>
                      Xóa mềm
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="settings__modal-backdrop" onClick={closeModal}>
          <div className="settings__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">
              {modal.mode === 'add'
                ? `Thêm dịch vụ — ${activePriceList?.name}`
                : `Sửa dịch vụ — ${activePriceList?.name}`}
            </h3>
            <div className="settings__form-grid">
              <label className="settings__field settings__field--full">
                <span>Tên dịch vụ</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={errors.name ? 'settings__input--error' : ''}
                />
                {errors.name && <span className="settings__error">{errors.name}</span>}
              </label>
              <label className="settings__field">
                <span>Giá vé</span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className={errors.price ? 'settings__input--error' : ''}
                />
                {errors.price && <span className="settings__error">{errors.price}</span>}
              </label>
              <label className="settings__field">
                <span>% Hoa hồng</span>
                <select
                  value={form.commissionPercent}
                  onChange={(e) => setForm({ ...form, commissionPercent: Number(e.target.value) })}
                >
                  {COMMISSION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="settings__field">
                <span>Trạng thái</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value={SERVICE_STATUS.ACTIVE}>Đang dùng</option>
                  <option value={SERVICE_STATUS.INACTIVE}>Tạm tắt</option>
                </select>
              </label>
            </div>
            <div className="settings__modal-actions">
              <button type="button" className="settings__btn settings__btn--primary" onClick={save}>Lưu</button>
              <button type="button" className="settings__btn" onClick={closeModal}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
