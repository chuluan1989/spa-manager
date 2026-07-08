import { useMemo, useState } from 'react'
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
  const [revision, setRevision] = useState(0)
  const [modal, setModal] = useState(null)

  const tree = useMemo(() => getCatalogAdminTree(), [revision])

  const refresh = () => setRevision((value) => value + 1)

  const openModal = (type, payload = {}) => setModal({ type, ...payload })
  const closeModal = () => setModal(null)

  const handleSaveModal = () => {
    if (!modal) return
    const name = modal.name?.trim()
    if (!name && modal.type !== 'duration') {
      showToast('Vui lòng nhập tên')
      return
    }

    if (modal.type === 'category-add') {
      addCategory({ name })
      showToast('Đã thêm nhóm dịch vụ')
    }
    if (modal.type === 'category-edit') {
      updateCategory(modal.id, { name })
      showToast('Đã cập nhật nhóm')
    }
    if (modal.type === 'service-add') {
      addService({ categoryId: modal.categoryId, name })
      showToast('Đã thêm dịch vụ')
    }
    if (modal.type === 'service-edit') {
      updateService(modal.id, { name })
      showToast('Đã cập nhật dịch vụ')
    }
    if (modal.type === 'duration-add') {
      addDuration({ serviceId: modal.serviceId, durationMinutes: modal.durationMinutes })
      showToast('Đã thêm thời lượng')
    }
    if (modal.type === 'duration-edit') {
      updateDuration(modal.id, { durationMinutes: modal.durationMinutes })
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
    reorderCategories(ids)
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
    reorderServices(categoryId, ids)
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
    reorderDurations(serviceId, ids)
    refresh()
  }

  return (
    <section className="settings__card svc-catalog">
      <div className="settings__card-header">
        <div>
          <h3 className="settings__card-title">Danh mục dịch vụ</h3>
          <p className="settings__hint settings__hint--inline">
            Quản lý nhóm → dịch vụ → thời lượng. Thay đổi có hiệu lực ngay trên Hóa đơn.
          </p>
        </div>
        <button type="button" className="settings__btn settings__btn--primary" onClick={() => openModal('category-add', { name: '' })}>
          + Thêm nhóm
        </button>
      </div>

      {tree.length === 0 && <p className="svc-catalog__empty">Chưa có danh mục dịch vụ.</p>}

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
                  const result = deleteCategory(category.id)
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
                      setServiceVisibility(service.id, service.status === ITEM_STATUS.ACTIVE ? ITEM_STATUS.INACTIVE : ITEM_STATUS.ACTIVE)
                      refresh()
                    }}
                  >
                    {service.status === ITEM_STATUS.ACTIVE ? 'Ẩn' : 'Hiện'}
                  </button>
                  <button type="button" className="settings__btn settings__btn--small settings__btn--danger" onClick={() => { deleteService(service.id); refresh() }}>Xóa</button>
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
                          setDurationVisibility(duration.id, duration.status === ITEM_STATUS.ACTIVE ? ITEM_STATUS.INACTIVE : ITEM_STATUS.ACTIVE)
                          refresh()
                        }}
                      >
                        {duration.status === ITEM_STATUS.ACTIVE ? 'Ẩn' : 'Hiện'}
                      </button>
                      <button type="button" className="settings__btn settings__btn--small settings__btn--danger" onClick={() => { deleteDuration(duration.id); refresh() }}>Xóa</button>
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
