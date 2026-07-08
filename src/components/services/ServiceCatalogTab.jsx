import { useMemo, useState } from 'react'
import { getPayrollBranchDisplayTitle } from '../../constants/branchPayrollDisplay'
import { getActiveBranches } from '../../constants/branches'
import {
  addCategory,
  addDuration,
  addService,
  deleteCategory,
  deleteDuration,
  deleteService,
  getCatalogAdminTree,
  ITEM_STATUS,
  reorderCategories,
  reorderDurations,
  reorderServices,
  setDurationVisibility,
  setServiceVisibility,
  updateCategory,
  updateDuration,
  updateService,
} from '../../utils/serviceCatalogV2Storage'
import './ServiceCatalogTab.css'

function MoveButtons({ onUp, onDown, disableUp, disableDown }) {
  return (
    <span className="svc-catalog__move">
      <button type="button" onClick={onUp} disabled={disableUp} aria-label="Lên">↑</button>
      <button type="button" onClick={onDown} disabled={disableDown} aria-label="Xuống">↓</button>
    </span>
  )
}

export default function ServiceCatalogTab({ showToast }) {
  const branches = useMemo(() => getActiveBranches(), [])
  const [branchId, setBranchId] = useState(() => branches[0]?.id ?? '')
  const [revision, setRevision] = useState(0)
  const [modal, setModal] = useState(null)

  const tree = useMemo(() => (branchId ? getCatalogAdminTree(branchId) : []), [branchId, revision])

  const refresh = () => setRevision((value) => value + 1)

  const openModal = (type, payload = {}) => setModal({ type, ...payload })
  const closeModal = () => setModal(null)

  const handleSaveModal = () => {
    if (!modal || !branchId) return
    const name = modal.name?.trim()
    if (!name && modal.type !== 'duration') {
      showToast('Vui lòng nhập tên')
      return
    }

    if (modal.type === 'category-add') {
      addCategory({ branchId, name })
      showToast('Đã thêm nhóm dịch vụ')
    }
    if (modal.type === 'category-edit') {
      updateCategory(branchId, modal.id, { name })
      showToast('Đã cập nhật nhóm')
    }
    if (modal.type === 'service-add') {
      addService({ branchId, categoryId: modal.categoryId, name })
      showToast('Đã thêm dịch vụ')
    }
    if (modal.type === 'service-edit') {
      updateService(branchId, modal.id, { name })
      showToast('Đã cập nhật dịch vụ')
    }
    if (modal.type === 'duration-add') {
      addDuration({ branchId, serviceId: modal.serviceId, durationMinutes: modal.durationMinutes })
      showToast('Đã thêm thời lượng')
    }
    if (modal.type === 'duration-edit') {
      updateDuration(branchId, modal.id, { durationMinutes: modal.durationMinutes })
      showToast('Đã cập nhật thời lượng')
    }

    closeModal()
    refresh()
  }

  const moveCategory = (categoryId, direction) => {
    const ids = tree.map((item) => item.id)
    const index = ids.indexOf(categoryId)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderCategories(branchId, ids)
    refresh()
  }

  const moveService = (categoryId, serviceId, direction) => {
    const category = tree.find((item) => item.id === categoryId)
    if (!category) return
    const ids = category.services.map((item) => item.id)
    const index = ids.indexOf(serviceId)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderServices(branchId, categoryId, ids)
    refresh()
  }

  const moveDuration = (serviceId, durationId, direction, category) => {
    const service = category.services.find((item) => item.id === serviceId)
    if (!service) return
    const ids = service.durations.map((item) => item.id)
    const index = ids.indexOf(durationId)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderDurations(branchId, serviceId, ids)
    refresh()
  }

  return (
    <section className="settings__card svc-catalog">
      <div className="settings__card-header">
        <div>
          <h3 className="settings__card-title">Danh mục dịch vụ theo chi nhánh</h3>
          <p className="settings__hint settings__hint--inline">
            Mỗi chi nhánh có catalog riêng. Thay đổi chỉ áp dụng cho chi nhánh đang chọn.
          </p>
        </div>
        <button type="button" className="settings__btn settings__btn--primary" onClick={() => openModal('category-add', { name: '' })} disabled={!branchId}>
          + Thêm nhóm
        </button>
      </div>

      <div className="settings__branch-pricing-toolbar">
        <label className="settings__field">
          <span>Chi nhánh</span>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {getPayrollBranchDisplayTitle(branch.id, branch.name)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tree.length === 0 && <p className="svc-catalog__empty">Chưa có danh mục dịch vụ cho chi nhánh này.</p>}

      {tree.map((category, categoryIndex) => (
        <article key={category.id} className="svc-catalog__group">
          <header className="svc-catalog__group-header">
            <MoveButtons
              onUp={() => moveCategory(category.id, -1)}
              onDown={() => moveCategory(category.id, 1)}
              disableUp={categoryIndex === 0}
              disableDown={categoryIndex === tree.length - 1}
            />
            <h4>{category.name}</h4>
            <div className="svc-catalog__actions">
              <button type="button" className="settings__btn settings__btn--small" onClick={() => openModal('category-edit', { id: category.id, name: category.name })}>Sửa</button>
              <button type="button" className="settings__btn settings__btn--small" onClick={() => openModal('service-add', { categoryId: category.id, name: '' })}>+ Dịch vụ</button>
              <button
                type="button"
                className="settings__btn settings__btn--small settings__btn--danger"
                onClick={() => {
                  const result = deleteCategory(branchId, category.id)
                  showToast(result.ok ? 'Đã xóa nhóm' : result.error)
                  refresh()
                }}
              >
                Xóa nhóm
              </button>
            </div>
          </header>

          {category.services.map((service, serviceIndex) => (
            <div key={service.id} className="svc-catalog__service">
              <div className="svc-catalog__service-header">
                <MoveButtons
                  onUp={() => moveService(category.id, service.id, -1)}
                  onDown={() => moveService(category.id, service.id, 1)}
                  disableUp={serviceIndex === 0}
                  disableDown={serviceIndex === category.services.length - 1}
                />
                <strong className={service.status === ITEM_STATUS.INACTIVE ? 'is-muted' : ''}>{service.name}</strong>
                <div className="svc-catalog__actions">
                  <button type="button" className="settings__btn settings__btn--small" onClick={() => openModal('service-edit', { id: service.id, name: service.name })}>Sửa</button>
                  <button type="button" className="settings__btn settings__btn--small" onClick={() => openModal('duration-add', { serviceId: service.id, durationMinutes: 60 })}>+ Thời lượng</button>
                  <button
                    type="button"
                    className="settings__btn settings__btn--small"
                    onClick={() => {
                      setServiceVisibility(branchId, service.id, service.status === ITEM_STATUS.ACTIVE ? ITEM_STATUS.INACTIVE : ITEM_STATUS.ACTIVE)
                      refresh()
                    }}
                  >
                    {service.status === ITEM_STATUS.ACTIVE ? 'Ẩn' : 'Hiện'}
                  </button>
                  <button type="button" className="settings__btn settings__btn--small settings__btn--danger" onClick={() => { deleteService(branchId, service.id); refresh() }}>Xóa</button>
                </div>
              </div>

              <ul className="svc-catalog__durations">
                {service.durations.map((duration, durationIndex) => (
                  <li key={duration.id} className={duration.status === ITEM_STATUS.INACTIVE ? 'is-muted' : ''}>
                    <MoveButtons
                      onUp={() => moveDuration(service.id, duration.id, -1, category)}
                      onDown={() => moveDuration(service.id, duration.id, 1, category)}
                      disableUp={durationIndex === 0}
                      disableDown={durationIndex === service.durations.length - 1}
                    />
                    <span>{duration.durationMinutes ? `${duration.durationMinutes}'` : 'Không thời lượng'}</span>
                    <code>{duration.id}</code>
                    <div className="svc-catalog__actions">
                      <button type="button" className="settings__btn settings__btn--small" onClick={() => openModal('duration-edit', { id: duration.id, durationMinutes: duration.durationMinutes ?? '' })}>Sửa</button>
                      <button
                        type="button"
                        className="settings__btn settings__btn--small"
                        onClick={() => {
                          setDurationVisibility(branchId, duration.id, duration.status === ITEM_STATUS.ACTIVE ? ITEM_STATUS.INACTIVE : ITEM_STATUS.ACTIVE)
                          refresh()
                        }}
                      >
                        {duration.status === ITEM_STATUS.ACTIVE ? 'Ẩn' : 'Hiện'}
                      </button>
                      <button type="button" className="settings__btn settings__btn--small settings__btn--danger" onClick={() => { deleteDuration(branchId, duration.id); refresh() }}>Xóa</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </article>
      ))}

      {modal && (
        <div className="settings__modal-backdrop" onClick={closeModal}>
          <div className="settings__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">
              {modal.type === 'category-add' && 'Thêm nhóm dịch vụ'}
              {modal.type === 'category-edit' && 'Sửa nhóm dịch vụ'}
              {modal.type === 'service-add' && 'Thêm dịch vụ'}
              {modal.type === 'service-edit' && 'Sửa dịch vụ'}
              {modal.type === 'duration-add' && 'Thêm thời lượng'}
              {modal.type === 'duration-edit' && 'Sửa thời lượng'}
            </h3>
            <div className="settings__form-grid">
              {(modal.type.includes('category') || modal.type.includes('service')) && (
                <label className="settings__field settings__field--full">
                  <span>Tên</span>
                  <input value={modal.name ?? ''} onChange={(e) => setModal({ ...modal, name: e.target.value })} />
                </label>
              )}
              {(modal.type.includes('duration')) && (
                <label className="settings__field settings__field--full">
                  <span>Thời lượng (phút, để trống nếu không có)</span>
                  <input
                    type="number"
                    min="0"
                    value={modal.durationMinutes ?? ''}
                    onChange={(e) => setModal({ ...modal, durationMinutes: e.target.value })}
                  />
                </label>
              )}
            </div>
            <div className="settings__modal-actions">
              <button type="button" className="settings__btn settings__btn--primary" onClick={handleSaveModal}>Lưu</button>
              <button type="button" className="settings__btn" onClick={closeModal}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
