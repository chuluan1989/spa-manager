import { useMemo, useState } from 'react'
import { getBranchContactByBranchId } from '../../constants/branchContacts'
import { getPayrollBranchDisplayTitle } from '../../constants/branchPayrollDisplay'
import {
  getAccountList,
  updateAdminPassword,
  updateBranchPassword,
  updateEmployeePassword,
} from '../../utils/credentialsStorage'
import {
  formatLastLogin,
  setAccountLocked,
  setEmployeeAccountLocked,
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

function formatPasswordUpdatedAt(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('vi-VN')
  } catch {
    return '—'
  }
}

export default function SettingsAccountsPermissionsTab({ showToast }) {
  const [accounts, setAccounts] = useState(() => getAccountList())
  const [matrixRevision, setMatrixRevision] = useState(0)
  const [passwordModal, setPasswordModal] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
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
    setSavingPassword(false)
  }

  const savePassword = async () => {
    if (savingPassword) return
    setSavingPassword(true)
    try {
      if (passwordModal.isEmployee) {
        const result = await updateEmployeePassword(
          passwordModal.id,
          newPassword,
          confirmPassword,
        )
        if (!result.success) {
          showToast(result.error ?? 'Không thể reset mật khẩu')
          return
        }
      } else if (passwordModal.id === 'admin') {
        if (!newPassword.trim() || newPassword !== confirmPassword) {
          showToast(newPassword !== confirmPassword ? 'Mật khẩu xác nhận không khớp' : 'Vui lòng nhập mật khẩu mới')
          return
        }
        if (newPassword.trim().length < 6) {
          showToast('Mật khẩu mới tối thiểu 6 ký tự')
          return
        }
        await updateAdminPassword(newPassword.trim())
      } else {
        if (!newPassword.trim() || newPassword !== confirmPassword) {
          showToast(newPassword !== confirmPassword ? 'Mật khẩu xác nhận không khớp' : 'Vui lòng nhập mật khẩu mới')
          return
        }
        if (newPassword.trim().length < 6) {
          showToast('Mật khẩu mới tối thiểu 6 ký tự')
          return
        }
        await updateBranchPassword(passwordModal.branchId, newPassword.trim())
      }

      closePasswordModal()
      refreshAccounts()
      showToast('Đã đặt mật khẩu mới')
    } catch (error) {
      showToast(error?.message ?? 'Không thể lưu mật khẩu')
    } finally {
      setSavingPassword(false)
    }
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
    if (account.isEmployee) {
      setEmployeeAccountLocked(account.id, nextLocked)
    } else {
      const key = account.id === 'admin' ? 'admin' : account.branchId
      setAccountLocked(key, nextLocked)
    }
    refreshAccounts()
    showToast(nextLocked ? 'Đã khóa đăng nhập' : 'Đã mở khóa đăng nhập')
  }

  const filteredAccounts = branchFilter
    ? accounts.filter((account) => account.branchId === branchFilter || account.id === 'admin')
    : accounts

  const branchLabel = (branch) => {
    const contact = getBranchContactByBranchId(branch.id)
    if (contact?.label) return `QL ${contact.label}`
    return `QL ${getPayrollBranchDisplayTitle(branch.id, branch.name)}`
  }

  return (
    <>
      <section className="settings__card">
        <h3 className="settings__card-title">Danh sách tài khoản</h3>
        <p className="settings__hint">
          Khóa đăng nhập chỉ chặn đăng nhập — không ảnh hưởng quyền nhập hóa đơn. Không hiển thị mật khẩu.
        </p>
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
                <th>Username</th>
                <th>Vai trò</th>
                <th>Chi nhánh</th>
                <th>Trạng thái đăng nhập</th>
                <th>Cập nhật MK</th>
                <th>Đăng nhập gần nhất</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => (
                <tr key={account.accountKey || account.id}>
                  <td>{account.label}</td>
                  <td><code>{account.username || account.id}</code></td>
                  <td>{account.role}</td>
                  <td>{account.branchName}</td>
                  <td>
                    <span className={`settings__status settings__status--${account.status === 'locked' ? 'inactive' : 'active'}`}>
                      {account.status === 'locked' ? 'Khóa đăng nhập' : 'Hoạt động'}
                    </span>
                  </td>
                  <td>{formatPasswordUpdatedAt(account.passwordUpdatedAt)}</td>
                  <td>{account.lastLogin ?? formatLastLogin(null)}</td>
                  <td>
                    <div className="settings__actions-cell">
                      <button
                        type="button"
                        className="settings__btn settings__btn--small settings__btn--secondary"
                        onClick={() => openPasswordModal(account)}
                      >
                        Đặt MK mới
                      </button>
                      {account.id !== 'admin' && (
                        <button
                          type="button"
                          className="settings__btn settings__btn--small"
                          onClick={() => handleToggleLock(account)}
                        >
                          {account.status === 'locked' ? 'Mở khóa ĐN' : 'Khóa ĐN'}
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
          Bật/tắt quyền theo từng chi nhánh. Nhân viên dùng cột quyền chung.
        </p>
        <div className="settings__table-wrap">
          <table className="settings__table">
            <thead>
              <tr>
                <th>Quyền</th>
                {branches.map((branch) => (
                  <th key={branch.id}>{branchLabel(branch)}</th>
                ))}
                <th>Nhân viên</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  {branches.map((branch) => (
                    <td key={branch.id}>
                      <Toggle
                        checked={Boolean(row.branches?.[branch.id])}
                        disabled={row.adminOnly}
                        label={`${row.label} — ${branch.name}`}
                        onChange={(enabled) => handleToggleBranch(branch.id, row.key, enabled)}
                      />
                    </td>
                  ))}
                  <td>
                    <Toggle
                      checked={Boolean(row.employee)}
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
            <h3 className="settings__modal-title">
              Đặt mật khẩu mới — {passwordModal.label}
            </h3>
            <p className="settings__hint">
              Không hiển thị mật khẩu cũ. Chỉ đặt mật khẩu mới (tối thiểu 6 ký tự).
            </p>
            <div className="settings__form-grid">
              <label className="settings__field settings__field--full">
                <span>Mật khẩu mới</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={savingPassword}
                />
              </label>
              <label className="settings__field settings__field--full">
                <span>Xác nhận mật khẩu</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={savingPassword}
                />
              </label>
            </div>
            <div className="settings__modal-actions">
              <button
                type="button"
                className="settings__btn settings__btn--primary"
                onClick={savePassword}
                disabled={savingPassword}
              >
                {savingPassword ? 'Đang lưu...' : 'Lưu mật khẩu'}
              </button>
              <button type="button" className="settings__btn" onClick={closePasswordModal} disabled={savingPassword}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
