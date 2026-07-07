import { useMemo, useState } from 'react'
import { BRANCH_CONTACTS } from '../../constants/branchContacts'
import {
  getAccountList,
  updateAdminPassword,
  updateBranchPassword,
} from '../../utils/credentialsStorage'
import {
  formatLastLogin,
  setAccountLocked,
} from '../../utils/accountMetadataStorage'
import {
  getBranchPermissionMatrix,
  getMatrixBranches,
  toggleBranchPermission,
  toggleEmployeePermission,
} from '../../utils/permissionsStorage'

function Toggle({ checked, disabled, onChange, label }) {
  return (
    <label className="settings__toggle" title={label}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="settings__toggle-slider" />
    </label>
  )
}

export default function SettingsAccountsPermissionsTab({ showToast }) {
  const [accounts, setAccounts] = useState(() => getAccountList())
  const [matrixRevision, setMatrixRevision] = useState(0)
  const [passwordModal, setPasswordModal] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [branchFilter, setBranchFilter] = useState('')

  const branches = useMemo(() => getMatrixBranches(), [matrixRevision])
  const matrix = useMemo(() => getBranchPermissionMatrix(), [matrixRevision])

  const refreshAccounts = () => setAccounts(getAccountList())
  const refreshMatrix = () => setMatrixRevision((value) => value + 1)

  const openPasswordModal = (account) => {
    setPasswordModal(account)
    setNewPassword('')
    setConfirmPassword('')
  }

  const closePasswordModal = () => {
    setPasswordModal(null)
    setNewPassword('')
    setConfirmPassword('')
  }

  const savePassword = async () => {
    if (!newPassword.trim()) {
      showToast('Vui lòng nhập mật khẩu mới')
      return
    }
    if (newPassword !== confirmPassword) {
      showToast('Mật khẩu xác nhận không khớp')
      return
    }

    if (passwordModal.id === 'admin') {
      await updateAdminPassword(newPassword)
    } else {
      await updateBranchPassword(passwordModal.branchId, newPassword)
    }

    closePasswordModal()
    refreshAccounts()
    showToast('Reset mật khẩu thành công')
  }

  const handleToggleBranch = (branchId, permissionKey, enabled) => {
    toggleBranchPermission(branchId, permissionKey, enabled)
    refreshMatrix()
    showToast('Đã cập nhật quyền chi nhánh')
  }

  const handleToggleEmployee = (permissionKey, enabled) => {
    toggleEmployeePermission(permissionKey, enabled)
    refreshMatrix()
    showToast('Đã cập nhật quyền nhân viên')
  }

  const handleToggleLock = (account) => {
    const nextLocked = account.status !== 'locked'
    const key = account.id === 'admin' ? 'admin' : account.branchId
    setAccountLocked(key, nextLocked)
    refreshAccounts()
    showToast(nextLocked ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản')
  }

  const filteredAccounts = branchFilter
    ? accounts.filter((account) => account.branchId === branchFilter || account.id === 'admin')
    : accounts

  const branchLabel = (branchId, index) => {
    const contact = BRANCH_CONTACTS[index]
    return contact ? `QL ${contact.label}` : `QL CN${index + 1}`
  }

  return (
    <>
      <section className="settings__card">
        <h3 className="settings__card-title">Danh sách tài khoản</h3>
        <div className="settings__filters settings__filters--inline">
          <label className="settings__filter-field">
            <span>Lọc chi nhánh</span>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">Tất cả</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="settings__table-wrap">
          <table className="settings__table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Vai trò</th>
                <th>Chi nhánh</th>
                <th>Trạng thái</th>
                <th>Đăng nhập gần nhất</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.label}</td>
                  <td>{account.role}</td>
                  <td>{account.branchName}</td>
                  <td>
                    <span className={`settings__status settings__status--${account.status === 'locked' ? 'inactive' : 'active'}`}>
                      {account.status === 'locked' ? 'Khóa' : 'Hoạt động'}
                    </span>
                  </td>
                  <td>{account.lastLogin ?? formatLastLogin(null)}</td>
                  <td>
                    <div className="settings__actions-cell">
                      <button
                        type="button"
                        className="settings__btn settings__btn--small settings__btn--secondary"
                        onClick={() => openPasswordModal(account)}
                      >
                        Reset MK
                      </button>
                      {account.id !== 'admin' && (
                        <button
                          type="button"
                          className="settings__btn settings__btn--small"
                          onClick={() => handleToggleLock(account)}
                        >
                          {account.status === 'locked' ? 'Mở khóa' : 'Khóa'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="settings__card">
        <h3 className="settings__card-title">Ma trận phân quyền theo chi nhánh</h3>
        <p className="settings__hint">
          Mỗi quản lý chi nhánh có quyền riêng. Quyền chỉ Admin không thể bật cho chi nhánh.
        </p>
        <div className="settings__matrix-wrap">
          <table className="settings__matrix">
            <thead>
              <tr>
                <th>Tính năng</th>
                <th>Admin</th>
                {branches.map((branch, index) => (
                  <th key={branch.id}>{branchLabel(branch.id, index)}</th>
                ))}
                <th>Nhân viên</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>
                    <Toggle checked label={row.label} disabled onChange={() => {}} />
                  </td>
                  {branches.map((branch) => (
                    <td key={branch.id}>
                      <Toggle
                        checked={row.branches[branch.id]}
                        disabled={row.adminOnly}
                        label={`${row.label} — ${branch.name}`}
                        onChange={(enabled) => handleToggleBranch(branch.id, row.key, enabled)}
                      />
                    </td>
                  ))}
                  <td>
                    <Toggle
                      checked={row.employee}
                      disabled={row.adminOnly}
                      label={`${row.label} — Nhân viên`}
                      onChange={(enabled) => handleToggleEmployee(row.key, enabled)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {passwordModal && (
        <div className="settings__modal-backdrop" onClick={closePasswordModal}>
          <div className="settings__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">Reset mật khẩu — {passwordModal.label}</h3>
            <div className="settings__form-grid">
              <label className="settings__field settings__field--full">
                <span>Mật khẩu mới</span>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </label>
              <label className="settings__field settings__field--full">
                <span>Xác nhận mật khẩu</span>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </label>
            </div>
            <div className="settings__modal-actions">
              <button type="button" className="settings__btn settings__btn--primary" onClick={savePassword}>Lưu</button>
              <button type="button" className="settings__btn" onClick={closePasswordModal}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
