import { useMemo, useState } from 'react'
import { BRANCH_CONTACTS } from '../../constants/branchContacts'
import { getPriceGroupsWithBranchLabels, PRICE_GROUPS } from '../../constants/priceGroups'
import {
  addBranch,
  BRANCH_STATUS,
  createBranchId,
  getStatusLabel as getBranchStatusLabel,
  loadBranches,
  updateBranch,
} from '../../utils/branchStorage'
import {
  assignBranchManager,
  getAccountMeta,
  getBranchManagerAssignments,
} from '../../utils/accountMetadataStorage'
import { registerBranchCredential, updateBranchPassword } from '../../utils/credentialsStorage'
import {
  addCustomRole,
  getAllRoles,
  removeCustomRole,
} from '../../utils/rolesStorage'
import {
  getMatrixBranches,
  toggleBranchPermission,
  PERMISSION_KEYS,
  getBranchPermission,
} from '../../utils/permissionsStorage'

const EMPTY_FORM = {
  name: '',
  priceGroupId: PRICE_GROUPS[0].id,
  status: BRANCH_STATUS.ACTIVE,
  supportEnabled: false,
  password: '',
  address: '',
  hotline: '',
}

export default function SettingsBranchesRolesTab({ showToast, onDataChange }) {
  const [branches, setBranches] = useState(() => getMatrixBranches())
  const [roles, setRoles] = useState(() => getAllRoles())
  const [editModal, setEditModal] = useState(null)
  const [permModal, setPermModal] = useState(null)
  const [managerModal, setManagerModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [managerName, setManagerName] = useState('')
  const [newRoleLabel, setNewRoleLabel] = useState('')

  const managers = useMemo(() => getBranchManagerAssignments(), [branches, managerModal])
  const priceGroups = useMemo(() => getPriceGroupsWithBranchLabels(), [branches])

  const refresh = () => {
    setBranches(getMatrixBranches())
    setRoles(getAllRoles())
    onDataChange?.()
  }

  const getBranchContact = (index) => BRANCH_CONTACTS[index] ?? null

  const openEdit = (branch, index) => {
    const contact = getBranchContact(index)
    setForm({
      name: branch.name,
      priceGroupId: branch.priceGroupId,
      status: branch.status,
      supportEnabled: branch.supportEnabled,
      password: '',
      address: contact?.address ?? '',
      hotline: contact?.phone ?? '',
    })
    setEditModal({ branch, index })
  }

  const openPermissions = (branch) => {
    setPermModal({ branch })
  }

  const openManager = (branch) => {
    setManagerName(getAccountMeta(branch.id).managerName ?? managers[branch.id] ?? '')
    setManagerModal({ branch })
  }

  const closeModals = () => {
    setEditModal(null)
    setPermModal(null)
    setManagerModal(null)
    setForm(EMPTY_FORM)
    setManagerName('')
  }

  const saveBranch = async () => {
    if (!form.name?.trim()) {
      showToast('Vui lòng nhập tên chi nhánh')
      return
    }

    if (editModal?.branch) {
      updateBranch(editModal.branch.id, {
        name: form.name,
        priceGroupId: form.priceGroupId,
        status: form.status,
        supportEnabled: form.supportEnabled,
      })
      if (form.password?.trim()) {
        await updateBranchPassword(editModal.branch.id, form.password)
      }
      showToast('Đã cập nhật chi nhánh')
    } else {
      const id = createBranchId(form.name)
      addBranch({
        id,
        name: form.name,
        priceGroupId: form.priceGroupId,
        status: form.status,
        supportEnabled: form.supportEnabled,
      })
      await registerBranchCredential(id, form.password || `spa-${id}`)
      showToast('Đã thêm chi nhánh')
    }

    closeModals()
    refresh()
  }

  const saveManager = () => {
    if (!managerModal?.branch) return
    assignBranchManager(managerModal.branch.id, managerName)
    showToast('Đã gán quản lý phụ trách')
    closeModals()
    refresh()
  }

  const handleAddRole = () => {
    const result = addCustomRole(newRoleLabel)
    if (!result.success) {
      showToast(result.error)
      return
    }
    setNewRoleLabel('')
    setRoles(getAllRoles())
    showToast('Đã tạo vai trò mới')
  }

  const handleRemoveRole = (roleId) => {
    removeCustomRole(roleId)
    setRoles(getAllRoles())
    showToast('Đã xóa vai trò tùy chỉnh')
  }

  const permissionRows = [
    { key: PERMISSION_KEYS.EDIT_INVOICE, label: 'Sửa hóa đơn' },
    { key: PERMISSION_KEYS.VIEW_REPORT, label: 'Xem báo cáo' },
    { key: PERMISSION_KEYS.ADD_EXPENSE, label: 'Thêm chi phí' },
    { key: PERMISSION_KEYS.VIEW_SALARY, label: 'Xem lương' },
  ]

  return (
    <>
      <section className="settings__card">
        <div className="settings__card-header">
          <h3 className="settings__card-title">Chi nhánh ({branches.length})</h3>
        </div>
        <div className="settings__branch-grid">
          {branches.map((branch, index) => {
            const contact = getBranchContact(index)
            const manager = managers[branch.id] || getAccountMeta(branch.id).managerName
            return (
              <article key={branch.id} className="settings__branch-card">
                <div className="settings__branch-card-head">
                  <span className="settings__branch-code">{contact?.label ?? `CN${index + 1}`}</span>
                  <span className={`settings__status settings__status--${branch.status === BRANCH_STATUS.ACTIVE ? 'active' : 'inactive'}`}>
                    {getBranchStatusLabel(branch.status)}
                  </span>
                </div>
                <h4 className="settings__branch-card-title">{branch.name}</h4>
                <p className="settings__branch-card-meta">{contact?.address ?? '—'}</p>
                <p className="settings__branch-card-meta">Hotline: {contact?.phone ?? '—'}</p>
                <p className="settings__branch-card-meta">QL: {manager || 'Chưa gán'}</p>
                <div className="settings__actions-cell">
                  <button type="button" className="settings__btn settings__btn--small settings__btn--secondary" onClick={() => openEdit(branch, index)}>
                    Sửa
                  </button>
                  <button type="button" className="settings__btn settings__btn--small" onClick={() => openPermissions(branch)}>
                    Quyền CN
                  </button>
                  <button type="button" className="settings__btn settings__btn--small" onClick={() => openManager(branch)}>
                    Gán QL
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="settings__card">
        <h3 className="settings__card-title">Vai trò hệ thống</h3>
        <div className="settings__role-list">
          {roles.map((role) => (
            <div key={role.id} className="settings__role-chip">
              <span>{role.label}</span>
              {!role.builtin && (
                <button type="button" className="settings__role-remove" onClick={() => handleRemoveRole(role.id)} aria-label="Xóa">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="settings__role-add">
          <input
            type="text"
            placeholder="Tên vai trò mới (vd. Thu ngân)"
            value={newRoleLabel}
            onChange={(e) => setNewRoleLabel(e.target.value)}
          />
          <button type="button" className="settings__btn settings__btn--secondary" onClick={handleAddRole}>
            Thêm vai trò
          </button>
        </div>
        <p className="settings__hint">Vai trò mặc định: Admin, Quản lý chi nhánh, Nhân viên.</p>
      </section>

      {editModal && (
        <div className="settings__modal-backdrop" onClick={closeModals}>
          <div className="settings__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">Sửa chi nhánh</h3>
            <div className="settings__form-grid">
              <label className="settings__field settings__field--full">
                <span>Tên chi nhánh</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="settings__field">
                <span>Nhóm giá</span>
                <select value={form.priceGroupId} onChange={(e) => setForm({ ...form, priceGroupId: e.target.value })}>
                  {priceGroups.map((group) => (
                    <option key={group.id} value={group.id}>{group.label}</option>
                  ))}
                </select>
              </label>
              <label className="settings__field">
                <span>Trạng thái</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value={BRANCH_STATUS.ACTIVE}>Hoạt động</option>
                  <option value={BRANCH_STATUS.LOCKED}>Tạm khóa</option>
                </select>
              </label>
              <label className="settings__field settings__field--full">
                <span>Mật khẩu QL mới (để trống nếu giữ nguyên)</span>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </label>
            </div>
            <div className="settings__modal-actions">
              <button type="button" className="settings__btn settings__btn--primary" onClick={saveBranch}>Lưu</button>
              <button type="button" className="settings__btn" onClick={closeModals}>Hủy</button>
            </div>
          </div>
        </div>
      )}

      {permModal && (
        <div className="settings__modal-backdrop" onClick={closeModals}>
          <div className="settings__modal settings__modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">Quyền riêng — {permModal.branch.name}</h3>
            <div className="settings__perm-quick">
              {permissionRows.map((row) => (
                <label key={row.key} className="settings__perm-row">
                  <span>{row.label}</span>
                  <input
                    type="checkbox"
                    checked={getBranchPermission(permModal.branch.id, row.key)}
                    onChange={(e) => {
                      toggleBranchPermission(permModal.branch.id, row.key, e.target.checked)
                      showToast('Đã cập nhật quyền')
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="settings__hint">Chi tiết đầy đủ tại tab Tài khoản & phân quyền.</p>
            <div className="settings__modal-actions">
              <button type="button" className="settings__btn" onClick={closeModals}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {managerModal && (
        <div className="settings__modal-backdrop" onClick={closeModals}>
          <div className="settings__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">Gán quản lý — {managerModal.branch.name}</h3>
            <label className="settings__field settings__field--full">
              <span>Tên quản lý phụ trách</span>
              <input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="Họ tên quản lý" />
            </label>
            <div className="settings__modal-actions">
              <button type="button" className="settings__btn settings__btn--primary" onClick={saveManager}>Lưu</button>
              <button type="button" className="settings__btn" onClick={closeModals}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
