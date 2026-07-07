import { useMemo, useState } from 'react'
import { getPriceGroupsWithBranchLabels, PRICE_GROUPS } from '../../constants/priceGroups'
import { BRANCH_CONTACTS } from '../../constants/branchContacts'
import {
  addBranch,
  BRANCH_STATUS,
  createBranchId,
  getStatusLabel as getBranchStatusLabel,
  loadBranches,
  updateBranch,
} from '../../utils/branchStorage'
import { registerBranchCredential, updateBranchPassword } from '../../utils/credentialsStorage'

const EMPTY_FORM = {
  name: '',
  priceGroupId: PRICE_GROUPS[0].id,
  status: BRANCH_STATUS.ACTIVE,
  supportEnabled: false,
  password: '',
}

export default function SettingsBranchesTab({ showToast, onDataChange }) {
  const [branches, setBranches] = useState(() => loadBranches())
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  const priceGroups = useMemo(() => getPriceGroupsWithBranchLabels(), [branches])

  const refresh = () => {
    setBranches(loadBranches())
    onDataChange?.()
  }

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, password: `spa${Date.now().toString().slice(-6)}` })
    setErrors({})
    setModal({ mode: 'add' })
  }

  const openEdit = (branch) => {
    setForm({
      name: branch.name,
      priceGroupId: branch.priceGroupId,
      status: branch.status,
      supportEnabled: branch.supportEnabled,
      password: '',
    })
    setErrors({})
    setModal({ mode: 'edit', id: branch.id })
  }

  const closeModal = () => {
    setModal(null)
    setForm(EMPTY_FORM)
    setErrors({})
  }

  const save = async () => {
    const next = {}
    if (!form.name?.trim()) next.name = 'Vui lòng nhập tên chi nhánh'
    if (modal.mode === 'add' && !form.password?.trim()) {
      next.password = 'Vui lòng nhập mật khẩu quản lý'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (modal.mode === 'add') {
      const id = createBranchId(form.name)
      addBranch({
        id,
        name: form.name,
        priceGroupId: form.priceGroupId,
        status: form.status,
        supportEnabled: form.supportEnabled,
      })
      await registerBranchCredential(id, form.password)
      showToast('Thêm chi nhánh thành công')
    } else {
      updateBranch(modal.id, {
        name: form.name,
        priceGroupId: form.priceGroupId,
        status: form.status,
        supportEnabled: form.supportEnabled,
      })
      if (form.password?.trim()) {
        await updateBranchPassword(modal.id, form.password)
      }
      showToast('Cập nhật chi nhánh thành công')
    }

    closeModal()
    refresh()
  }

  const toggleLock = (branch) => {
    const nextStatus = branch.status === BRANCH_STATUS.LOCKED
      ? BRANCH_STATUS.ACTIVE
      : BRANCH_STATUS.LOCKED
    updateBranch(branch.id, { status: nextStatus })
    showToast(nextStatus === BRANCH_STATUS.LOCKED ? 'Đã tạm khóa chi nhánh' : 'Đã mở khóa chi nhánh')
    refresh()
  }

  const getPriceGroupName = (priceGroupId) =>
    PRICE_GROUPS.find((group) => group.id === priceGroupId)?.name ?? '—'

  return (
    <section className="settings__card">
      <div className="settings__card-header">
        <div>
          <h3 className="settings__card-title">Quản lý chi nhánh</h3>
          <p className="settings__hint settings__hint--inline">
            Thêm, sửa, khóa chi nhánh và gán nhóm bảng giá.
          </p>
        </div>
        <button type="button" className="settings__btn settings__btn--primary" onClick={openAdd}>
          + Thêm chi nhánh
        </button>
      </div>

      <div className="settings__table-wrap">
        <table className="settings__table">
          <thead>
            <tr>
              <th>Tên chi nhánh</th>
              <th>Nhóm bảng giá</th>
              <th>Hỗ trợ liên chi nhánh</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id}>
                <td>{branch.name}</td>
                <td>{getPriceGroupName(branch.priceGroupId)}</td>
                <td>{branch.supportEnabled ? 'Có' : 'Không'}</td>
                <td>
                  <span className={`settings__status settings__status--${branch.status === BRANCH_STATUS.ACTIVE ? 'active' : 'inactive'}`}>
                    {getBranchStatusLabel(branch.status)}
                  </span>
                </td>
                <td className="settings__actions-cell">
                  <button type="button" className="settings__btn settings__btn--small settings__btn--secondary" onClick={() => openEdit(branch)}>
                    Sửa
                  </button>
                  <button type="button" className="settings__btn settings__btn--small" onClick={() => toggleLock(branch)}>
                    {branch.status === BRANCH_STATUS.LOCKED ? 'Mở khóa' : 'Tạm khóa'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="settings__info-box">
        <p className="settings__hint">Thông tin liên hệ hệ thống (CN1 — CN8):</p>
        <ul className="settings__info-list">
          {BRANCH_CONTACTS.map((item) => (
            <li key={item.id}>
              <strong>{item.label}:</strong> {item.address} · {item.phone}
            </li>
          ))}
        </ul>
      </div>

      <div className="settings__info-box">
        <p className="settings__hint">Phân bổ nhóm bảng giá hiện tại:</p>
        <ul className="settings__info-list">
          {priceGroups.map((group) => (
            <li key={group.id}><strong>{group.name}:</strong> {group.branchLabel}</li>
          ))}
        </ul>
      </div>

      {modal && (
        <div className="settings__modal-backdrop" onClick={closeModal}>
          <div className="settings__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">
              {modal.mode === 'add' ? 'Thêm chi nhánh' : 'Sửa chi nhánh'}
            </h3>
            <div className="settings__form-grid">
              <label className="settings__field settings__field--full">
                <span>Tên chi nhánh</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={errors.name ? 'settings__input--error' : ''}
                />
                {errors.name && <span className="settings__error">{errors.name}</span>}
              </label>
              <label className="settings__field">
                <span>Nhóm bảng giá</span>
                <select
                  value={form.priceGroupId}
                  onChange={(e) => setForm({ ...form, priceGroupId: e.target.value })}
                >
                  {PRICE_GROUPS.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </label>
              <label className="settings__field">
                <span>Trạng thái</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value={BRANCH_STATUS.ACTIVE}>Đang hoạt động</option>
                  <option value={BRANCH_STATUS.LOCKED}>Tạm khóa</option>
                </select>
              </label>
              <label className="settings__field settings__field--full">
                <span>Hỗ trợ nhân viên liên chi nhánh (hóa đơn)</span>
                <select
                  value={form.supportEnabled ? 'yes' : 'no'}
                  onChange={(e) => setForm({ ...form, supportEnabled: e.target.value === 'yes' })}
                >
                  <option value="no">Không</option>
                  <option value="yes">Có</option>
                </select>
              </label>
              <label className="settings__field settings__field--full">
                <span>{modal.mode === 'add' ? 'Mật khẩu quản lý chi nhánh' : 'Mật khẩu mới (để trống nếu không đổi)'}</span>
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={errors.password ? 'settings__input--error' : ''}
                />
                {errors.password && <span className="settings__error">{errors.password}</span>}
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
