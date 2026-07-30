import { useMemo, useState } from 'react'
import { getBranchContactByBranchId } from '../../constants/branchContacts'
import { getPayrollBranchDisplayTitle } from '../../constants/branchPayrollDisplay'
import {
  getAccountList,
  updateAdminPassword,
  updateBranchPassword,
  updateEmployeePassword,
  resetEmployeePasswordToDefault,
  resetBranchPasswordToDefault,
  resetEmployeePasswordsBulk,
  resetEmployeePasswordsByBranch,
  resetAllLoginPasswordsToDefault,
  updateEmployeeLoginUsername,
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
import {
  canUseBranchWideBulkReset,
  canUseSystemWideBulkReset,
  isLiveSupabaseEnvironment,
  isUatEmployeeAccount,
  isUatEmployeeId,
  UAT_LOGIN_V2_PREFIX,
} from '../../utils/uatAccountGuard'

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
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(() => new Set())
  const [bulkScope, setBulkScope] = useState('selected')
  const [bulkBranchId, setBulkBranchId] = useState('')
  const [bulkResetting, setBulkResetting] = useState(false)
  const [usernameModal, setUsernameModal] = useState(null)
  const [nextUsername, setNextUsername] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)

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
        if (newPassword.trim().length < 8) {
          showToast('Mật khẩu mới tối thiểu 8 ký tự')
          return
        }
        await updateAdminPassword(newPassword.trim())
      } else {
        if (!newPassword.trim() || newPassword !== confirmPassword) {
          showToast(newPassword !== confirmPassword ? 'Mật khẩu xác nhận không khớp' : 'Vui lòng nhập mật khẩu mới')
          return
        }
        if (newPassword.trim().length < 8) {
          showToast('Mật khẩu mới tối thiểu 8 ký tự')
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
    if (account.isEmployee && isLiveSupabaseEnvironment() && !isUatEmployeeId(account.id)) {
      showToast(`Chỉ khóa tài khoản UAT (${UAT_LOGIN_V2_PREFIX}*) trên Preview/Production`)
      return
    }
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

  const handleResetToDefault = async (account) => {
    if (account.id === 'admin') return
    if (account.isEmployee && isLiveSupabaseEnvironment() && !isUatEmployeeId(account.id)) {
      showToast(`Chỉ reset tài khoản UAT (${UAT_LOGIN_V2_PREFIX}*) trên Preview/Production`)
      return
    }
    const confirmed = window.confirm(
      `Reset mật khẩu về mặc định cho "${account.label}"?\n`
      + 'Lần đăng nhập tiếp theo sẽ bắt buộc đổi mật khẩu.',
    )
    if (!confirmed) return

    try {
      const result = account.isEmployee
        ? await resetEmployeePasswordToDefault(account.id)
        : await resetBranchPasswordToDefault(account.branchId ?? account.id)

      if (!result.success) {
        showToast(result.error ?? 'Không thể reset mật khẩu')
        return
      }

      refreshAccounts()
      showToast(
        `Đã reset MK mặc định — Username: ${result.username}, MK: ${result.defaultPassword}`,
      )
    } catch (error) {
      showToast(error?.message ?? 'Không thể reset mật khẩu')
    }
  }

  const formatPasswordChanged = (account) => {
    if (account.id === 'admin') return '—'
    return account.hasChangedPassword ? 'Đã đổi' : 'Chưa đổi'
  }

  const filteredAccounts = branchFilter
    ? accounts.filter((account) => account.branchId === branchFilter || account.id === 'admin')
    : accounts

  const visibleEmployeeIds = useMemo(
    () => filteredAccounts.filter((account) => account.isEmployee).map((account) => account.id),
    [filteredAccounts],
  )

  const toggleEmployeeSelection = (employeeId) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev)
      if (next.has(employeeId)) next.delete(employeeId)
      else next.add(employeeId)
      return next
    })
  }

  const toggleAllVisibleEmployees = () => {
    setSelectedEmployeeIds((prev) => {
      const allSelected = visibleEmployeeIds.every((id) => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        visibleEmployeeIds.forEach((id) => next.delete(id))
        return next
      }
      return new Set([...prev, ...visibleEmployeeIds])
    })
  }

  const openUsernameModal = (account) => {
    setUsernameModal(account)
    setNextUsername(account.username || '')
  }

  const closeUsernameModal = () => {
    setUsernameModal(null)
    setNextUsername('')
    setSavingUsername(false)
  }

  const saveUsername = async () => {
    if (!usernameModal?.isEmployee || savingUsername) return
    setSavingUsername(true)
    try {
      const result = await updateEmployeeLoginUsername(usernameModal.id, nextUsername)
      if (!result.success) {
        showToast(result.error ?? 'Không thể đổi username')
        return
      }
      closeUsernameModal()
      refreshAccounts()
      showToast(`Đã đổi username thành ${result.username}`)
    } catch (error) {
      showToast(error?.message ?? 'Không thể đổi username')
    } finally {
      setSavingUsername(false)
    }
  }

  const handleBulkReset = async () => {
    if (bulkResetting) return

    let confirmMessage = ''
    if (bulkScope === 'selected') {
      if (!selectedEmployeeIds.size) {
        showToast('Chọn ít nhất một nhân viên')
        return
      }
      confirmMessage = `Reset MK mặc định cho ${selectedEmployeeIds.size} nhân viên đã chọn?`
    } else if (bulkScope === 'branch') {
      if (!bulkBranchId) {
        showToast('Chọn chi nhánh')
        return
      }
      const branchName = branches.find((b) => b.id === bulkBranchId)?.name ?? bulkBranchId
      confirmMessage = `Reset MK mặc định toàn bộ nhân viên + QL chi nhánh "${branchName}"?`
    } else {
      confirmMessage = 'Reset MK mặc định TOÀN HỆ THỐNG (tất cả nhân viên + QL chi nhánh)?'
    }

    if (!window.confirm(`${confirmMessage}\n\nLần đăng nhập tiếp theo sẽ bắt buộc đổi mật khẩu.`)) {
      return
    }

    setBulkResetting(true)
    try {
      let result
      if (bulkScope === 'selected') {
        result = await resetEmployeePasswordsBulk([...selectedEmployeeIds])
      } else if (bulkScope === 'branch') {
        result = await resetEmployeePasswordsByBranch(bulkBranchId)
      } else {
        result = await resetAllLoginPasswordsToDefault()
      }

      if (!result.success) {
        showToast(result.error ?? 'Không thể reset hàng loạt')
        return
      }

      refreshAccounts()
      if (bulkScope === 'selected') {
        showToast(
          `Reset xong: ${result.succeeded} thành công, ${result.failed} thất bại, ${result.skipped} bỏ qua`,
        )
        setSelectedEmployeeIds(new Set())
      } else if (bulkScope === 'branch') {
        showToast(`Đã reset ${result.employeeCount} NV + QL chi nhánh (${result.branchManager?.username})`)
      } else {
        showToast(`Đã reset ${result.employeeCount} NV + ${result.branchCount} QL chi nhánh`)
      }
    } catch (error) {
      showToast(error?.message ?? 'Không thể reset hàng loạt')
    } finally {
      setBulkResetting(false)
    }
  }

  const branchLabel = (branch) => {
    const contact = getBranchContactByBranchId(branch.id)
    if (contact?.label) return `QL ${contact.label}`
    return `QL ${getPayrollBranchDisplayTitle(branch.id, branch.name)}`
  }

  return (
    <>
      <section className="settings__card">
        <h3 className="settings__card-title">Reset mật khẩu hàng loạt</h3>
        <p className="settings__hint">
          {isLiveSupabaseEnvironment()
            ? `Preview/Production: chỉ reset tài khoản UAT (${UAT_LOGIN_V2_PREFIX}*). Không dùng reset theo chi nhánh hoặc toàn hệ thống.`
            : 'Reset về mật khẩu mặc định theo username đã cấp. Lần đăng nhập tiếp theo bắt buộc đổi mật khẩu.'}
        </p>
        <div className="settings__filters settings__filters--inline">
          <label className="settings__filter-field">
            <span>Phạm vi</span>
            <select value={bulkScope} onChange={(e) => setBulkScope(e.target.value)}>
              <option value="selected">Theo nhân viên đã chọn</option>
              {canUseBranchWideBulkReset() && (
                <option value="branch">Theo chi nhánh</option>
              )}
              {canUseSystemWideBulkReset() && (
                <option value="all">Toàn hệ thống</option>
              )}
            </select>
          </label>
          {bulkScope === 'branch' && (
            <label className="settings__filter-field">
              <span>Chi nhánh</span>
              <select value={bulkBranchId} onChange={(e) => setBulkBranchId(e.target.value)}>
                <option value="">Chọn chi nhánh</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="settings__btn settings__btn--primary"
            onClick={handleBulkReset}
            disabled={bulkResetting}
          >
            {bulkResetting ? 'Đang reset...' : 'Reset MK mặc định hàng loạt'}
          </button>
        </div>
      </section>

      <section className="settings__card">
        <h3 className="settings__card-title">Danh sách tài khoản</h3>
        <p className="settings__hint">
          Username chỉ sinh một lần khi tạo tài khoản — đổi tên trong Hồ sơ không tự đổi username.
          Chỉ Admin được đổi username thủ công.
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
                <th>
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả nhân viên hiển thị"
                    checked={visibleEmployeeIds.length > 0 && visibleEmployeeIds.every((id) => selectedEmployeeIds.has(id))}
                    onChange={toggleAllVisibleEmployees}
                  />
                </th>
                <th>Tên</th>
                <th>Username</th>
                <th>Vai trò</th>
                <th>Chi nhánh</th>
                <th>Trạng thái đăng nhập</th>
                <th>Đã đổi MK</th>
                <th>Cập nhật MK</th>
                <th>Đăng nhập gần nhất</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => (
                <tr key={account.accountKey || account.id}>
                  <td>
                    {account.isEmployee ? (
                      <input
                        type="checkbox"
                        checked={selectedEmployeeIds.has(account.id)}
                        onChange={() => toggleEmployeeSelection(account.id)}
                        aria-label={`Chọn ${account.label}`}
                      />
                    ) : null}
                  </td>
                  <td>{account.label}{isUatEmployeeAccount(account) ? ' (UAT)' : ''}</td>
                  <td><code>{account.username || account.id}</code></td>
                  <td>{account.role}</td>
                  <td>{account.branchName}</td>
                  <td>
                    <span className={`settings__status settings__status--${account.status === 'locked' ? 'inactive' : 'active'}`}>
                      {account.status === 'locked' ? 'Khóa đăng nhập' : 'Hoạt động'}
                    </span>
                  </td>
                  <td>{formatPasswordChanged(account)}</td>
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
                      {account.isEmployee && (
                        <button
                          type="button"
                          className="settings__btn settings__btn--small settings__btn--secondary"
                          onClick={() => openUsernameModal(account)}
                          disabled={isLiveSupabaseEnvironment() && !isUatEmployeeId(account.id)}
                          title={isLiveSupabaseEnvironment() && !isUatEmployeeId(account.id)
                            ? `Chỉ đổi username tài khoản UAT (${UAT_LOGIN_V2_PREFIX}*)`
                            : undefined}
                        >
                          Đổi username
                        </button>
                      )}
                      {account.id !== 'admin' && (
                        <button
                          type="button"
                          className="settings__btn settings__btn--small settings__btn--secondary"
                          onClick={() => handleResetToDefault(account)}
                        >
                          Reset MK mặc định
                        </button>
                      )}
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

      {usernameModal && (
        <div className="settings__modal-backdrop" onClick={closeUsernameModal}>
          <div className="settings__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">
              Đổi username — {usernameModal.label}
            </h3>
            <p className="settings__hint">
              Username không tự đổi khi sửa tên trong Hồ sơ. Chỉ chữ thường và số, không dấu.
            </p>
            <div className="settings__form-grid">
              <label className="settings__field settings__field--full">
                <span>Username mới</span>
                <input
                  type="text"
                  autoComplete="off"
                  value={nextUsername}
                  onChange={(e) => setNextUsername(e.target.value)}
                  disabled={savingUsername}
                />
              </label>
            </div>
            <div className="settings__modal-actions">
              <button
                type="button"
                className="settings__btn settings__btn--primary"
                onClick={saveUsername}
                disabled={savingUsername || !nextUsername.trim()}
              >
                {savingUsername ? 'Đang lưu...' : 'Lưu username'}
              </button>
              <button type="button" className="settings__btn" onClick={closeUsernameModal} disabled={savingUsername}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordModal && (
        <div className="settings__modal-backdrop" onClick={closePasswordModal}>
          <div className="settings__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">
              Đặt mật khẩu mới — {passwordModal.label}
            </h3>
            <p className="settings__hint">
              Không hiển thị mật khẩu cũ. Chỉ đặt mật khẩu mới (tối thiểu 8 ký tự, có chữ cái và chữ số).
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
