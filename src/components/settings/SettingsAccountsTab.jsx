import { useState } from 'react'
import { ROLES } from '../../constants/auth'
import {
  getAccountList,
  updateAdminPassword,
  updateBranchPassword,
} from '../../utils/credentialsStorage'
import {
  getPermissionMatrix,
  togglePermissionRole,
} from '../../utils/permissionsStorage'

export default function SettingsAccountsTab({ showToast }) {
  const [accounts, setAccounts] = useState(() => getAccountList())
  const [, setPermissionsRevision] = useState(0)
  const [passwordModal, setPasswordModal] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const matrix = getPermissionMatrix()

  const refreshAccounts = () => setAccounts(getAccountList())
  const refreshPermissions = () => setPermissionsRevision((value) => value + 1)

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
    showToast('Đổi mật khẩu thành công')
  }

  const handleToggle = (permissionKey, role, enabled) => {
    togglePermissionRole(permissionKey, role, enabled)
    refreshPermissions()
    showToast('Đã cập nhật phân quyền')
  }

  return (
    <>
      <section className="settings__card">
        <h3 className="settings__card-title">Tài khoản & đổi mật khẩu</h3>
        <div className="settings__table-wrap">
          <table className="settings__table">
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th>Chi nhánh</th>
                <th>Mật khẩu hiện tại</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.id === 'admin' ? 'Admin' : 'Quản lý chi nhánh'}</td>
                  <td>{account.id === 'admin' ? 'Tất cả' : account.branchName}</td>
                  <td className="settings__password">{account.password}</td>
                  <td>
                    <button
                      type="button"
                      className="settings__btn settings__btn--small settings__btn--secondary"
                      onClick={() => openPasswordModal(account)}
                    >
                      Đổi mật khẩu
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="settings__card">
        <h3 className="settings__card-title">Phân quyền hệ thống</h3>
        <p className="settings__hint">
          Một số quyền chỉ dành cho Admin và không thể thay đổi.
        </p>
        <div className="settings__table-wrap">
          <table className="settings__table">
            <thead>
              <tr>
                <th>Quyền</th>
                <th>Admin</th>
                <th>Quản lý chi nhánh</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.admin}
                      disabled={row.adminOnly}
                      onChange={(e) => handleToggle(row.key, ROLES.ADMIN, e.target.checked)}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.branchManager}
                      disabled={row.adminOnly}
                      onChange={(e) => handleToggle(row.key, ROLES.BRANCH_MANAGER, e.target.checked)}
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
            <h3 className="settings__modal-title">Đổi mật khẩu — {passwordModal.label ?? passwordModal.branchName}</h3>
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
              <button type="button" className="settings__btn settings__btn--primary" onClick={savePassword}>Lưu mật khẩu</button>
              <button type="button" className="settings__btn" onClick={closePasswordModal}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
