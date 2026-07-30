import { useState } from 'react'
import { Eye, EyeOff, Settings, X } from 'lucide-react'
import EmployeeProfileForm from './EmployeeProfileForm'
import { getActiveBranches, getBranchById } from '../../constants/branches'
import {
  canAddEmployee,
  canChangeEmployeeBranch,
  canDeleteEmployee,
  canEditEmployee,
  canSelectBranch,
  getCurrentUserBranch,
  getCurrentUserName,
  getScopedBranchId,
  isAdmin,
} from '../../constants/auth'
import {
  createEmployeeWithAccount,
  reactivateEmployee,
  resignEmployee,
  transferEmployeeLifecycle,
} from '../../services/employeeLifecycleService'
import {
  resetEmployeePasswordToDefault,
  updateEmployeeLoginUsername,
  updateEmployeePassword,
} from '../../utils/credentialsStorage'
import {
  archiveEmployee,
  deleteEmployee,
  EMPLOYEE_STATUS,
  EMPLOYEE_STATUS_OPTIONS,
  EMPTY_EMPLOYEE_FORM,
  getStatusLabel,
  normalizeEmployee,
  setEmployeeStatus,
  updateEmployee,
} from '../../utils/employeeStorage'
import { PERMANENT_DELETE_BLOCKED_MESSAGE } from '../../utils/employeeDeleteGuard'
import { getEmployeeLoginUsername } from '../../utils/loginUsername'
import { redactEmployeeForViewer } from '../../utils/employeeVisibility'
import './EmployeeHubSettings.css'

const EMPTY_LOGIN_FORM = {
  username: '',
  password: '',
  showPassword: false,
  saving: false,
}

function employeeToForm(employee) {
  const { id: _id, ...form } = normalizeEmployee(employee)
  return form
}

export default function EmployeeHubSettings({
  open,
  onClose,
  employees: _employees,
  selectedEmployee,
  onSaved,
  showToast,
}) {
  const [mode, setMode] = useState('menu')
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [errors, setErrors] = useState({})
  const [transfer, setTransfer] = useState({
    branchId: '',
    effectiveDate: '',
    reason: '',
    note: '',
    approver: '',
  })
  const [statusValue, setStatusValue] = useState(EMPLOYEE_STATUS.ACTIVE)
  const [loginForm, setLoginForm] = useState(EMPTY_LOGIN_FORM)

  if (!open) return null

  const selectedEmployeeId = selectedEmployee?.id ?? ''
  const allowAdd = canAddEmployee()
  const allowTransfer = canChangeEmployeeBranch()
  const allowAdminActions = canDeleteEmployee() && isAdmin()
  const allowLoginManage = isAdmin()

  const reset = () => {
    setMode('menu')
    setForm(EMPTY_EMPLOYEE_FORM)
    setErrors({})
    setTransfer({ branchId: '', effectiveDate: '', reason: '', note: '', approver: getCurrentUserName() })
    setStatusValue(EMPLOYEE_STATUS.ACTIVE)
    setLoginForm(EMPTY_LOGIN_FORM)
  }

  const closeAll = () => {
    reset()
    onClose()
  }

  const openAdd = () => {
    setForm({ ...EMPTY_EMPLOYEE_FORM, branchId: getScopedBranchId() || '' })
    setErrors({})
    setMode('add')
  }

  const openEdit = () => {
    if (!selectedEmployee) {
      showToast('Chọn nhân viên trước')
      return
    }
    if (!canEditEmployee(selectedEmployee)) {
      showToast('Bạn không có quyền sửa nhân viên này')
      return
    }
    setForm(redactEmployeeForViewer(employeeToForm(selectedEmployee)))
    setErrors({})
    setMode('edit')
  }

  const handleSaveEmployee = async () => {
    const payload = {
      ...form,
      branchId: canSelectBranch() ? form.branchId : getCurrentUserBranch(),
    }
    const next = validateForm(payload)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (mode === 'add') {
      const result = await createEmployeeWithAccount(payload)
      if (!result.success) {
        showToast(result.error ?? 'Không thể thêm nhân viên')
        return
      }
      const loginHint = result.account?.username
        ? ` — Đăng nhập: ${result.account.username} / ${result.account.defaultPassword}`
        : ''
      showToast(`Thêm nhân viên thành công${loginHint}`)
    } else if (mode === 'edit') {
      const baseline = employeeToForm(selectedEmployee)
      const result = await updateEmployee(selectedEmployeeId, payload, {
        expectedUpdatedAt: selectedEmployee?.updatedAt ?? '',
        baseline,
      })
      if (!result.success) {
        showToast(result.error ?? 'Không thể cập nhật')
        return
      }
      showToast(result.unchanged ? 'Không có thay đổi cần lưu' : 'Cập nhật hồ sơ thành công')
    }

    onSaved()
    closeAll()
  }

  const openTransfer = () => {
    if (!selectedEmployee) {
      showToast('Chọn nhân viên trước')
      return
    }
    setTransfer({
      branchId: '',
      effectiveDate: new Date().toISOString().slice(0, 10),
      reason: '',
      note: '',
      approver: getCurrentUserName(),
    })
    setMode('transfer')
  }

  const openStatus = () => {
    if (!selectedEmployee) {
      showToast('Chọn nhân viên trước')
      return
    }
    setStatusValue(selectedEmployee.status || EMPLOYEE_STATUS.ACTIVE)
    setMode('status')
  }

  const openLogin = () => {
    if (!selectedEmployee) {
      showToast('Chọn nhân viên trước')
      return
    }
    if (!allowLoginManage) {
      showToast('Chỉ Admin mới quản lý đăng nhập nhân viên')
      return
    }
    setLoginForm({
      username: getEmployeeLoginUsername(selectedEmployee),
      password: '',
      showPassword: false,
      saving: false,
    })
    setMode('login')
  }

  const handleSaveLogin = async (e) => {
    e.preventDefault()
    if (!selectedEmployeeId || loginForm.saving) return

    const nextUsername = String(loginForm.username ?? '').trim().toLowerCase()
    const nextPassword = String(loginForm.password ?? '')
    const currentUsername = getEmployeeLoginUsername(selectedEmployee)
    const usernameChanged = nextUsername !== currentUsername
    const passwordProvided = Boolean(nextPassword.trim())

    if (!usernameChanged && !passwordProvided) {
      showToast('Không có thay đổi cần lưu')
      return
    }

    setLoginForm((prev) => ({ ...prev, saving: true }))
    try {
      if (usernameChanged) {
        const usernameResult = await updateEmployeeLoginUsername(selectedEmployeeId, nextUsername)
        if (!usernameResult.success) {
          showToast(usernameResult.error ?? 'Không thể đổi tên đăng nhập')
          return
        }
      }

      if (passwordProvided) {
        const passwordResult = await updateEmployeePassword(
          selectedEmployeeId,
          nextPassword,
          nextPassword,
        )
        if (!passwordResult.success) {
          showToast(passwordResult.error ?? 'Không thể đổi mật khẩu')
          return
        }
      }

      const parts = []
      if (usernameChanged) parts.push(`username: ${nextUsername}`)
      if (passwordProvided) parts.push('đã đặt mật khẩu mới')
      showToast(`Đã lưu đăng nhập — ${parts.join(', ')}`)
      onSaved()
      closeAll()
    } catch (error) {
      showToast(error?.message ?? 'Không thể lưu thay đổi đăng nhập')
    } finally {
      setLoginForm((prev) => ({ ...prev, saving: false }))
    }
  }

  const handleResetLoginPassword = async () => {
    if (!selectedEmployeeId || loginForm.saving) return
    const confirmed = window.confirm(
      `Đặt lại mật khẩu mặc định cho "${selectedEmployee?.name}"?\n`
      + 'Lần đăng nhập tiếp theo sẽ bắt buộc đổi mật khẩu.',
    )
    if (!confirmed) return

    setLoginForm((prev) => ({ ...prev, saving: true }))
    try {
      const result = await resetEmployeePasswordToDefault(selectedEmployeeId)
      if (!result.success) {
        showToast(result.error ?? 'Không thể đặt lại mật khẩu mặc định')
        return
      }
      setLoginForm((prev) => ({
        ...prev,
        username: result.username || prev.username,
        password: '',
        showPassword: false,
      }))
      showToast(
        `Đã đặt lại MK mặc định — Username: ${result.username}, MK: ${result.defaultPassword}`,
      )
      onSaved()
    } catch (error) {
      showToast(error?.message ?? 'Không thể đặt lại mật khẩu mặc định')
    } finally {
      setLoginForm((prev) => ({ ...prev, saving: false }))
    }
  }

  const validateForm = (data) => {
    const next = {}
    if (!data.name?.trim()) next.name = 'Vui lòng nhập họ và tên'
    if (!data.branchId) next.branchId = 'Vui lòng chọn chi nhánh'
    return next
  }

  const handleTransfer = async (e) => {
    e.preventDefault()
    if (!transfer.branchId || !transfer.effectiveDate) {
      showToast('Vui lòng chọn chi nhánh mới và ngày hiệu lực')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    let confirmPastEffectiveDate = false
    if (transfer.effectiveDate < today) {
      const ok = window.confirm(
        `Ngày hiệu lực ${transfer.effectiveDate} nằm trong quá khứ.\n`
        + 'Hệ thống sẽ không tự sửa hóa đơn/chấm công/lương đã phát sinh.\n'
        + 'Bạn có chắc muốn tiếp tục?',
      )
      if (!ok) return
      confirmPastEffectiveDate = true
    }
    const result = await transferEmployeeLifecycle(selectedEmployeeId, transfer.branchId, {
      transferDate: transfer.effectiveDate,
      reason: transfer.reason,
      note: transfer.note,
      approver: transfer.approver || getCurrentUserName(),
      createdBy: getCurrentUserName(),
      confirmPastEffectiveDate,
    })
    if (!result.success) {
      if (result.needsPastDateConfirm) {
        const ok = window.confirm(`${result.error}\n\nXác nhận chuyển công tác?`)
        if (!ok) return
        const retry = await transferEmployeeLifecycle(selectedEmployeeId, transfer.branchId, {
          transferDate: transfer.effectiveDate,
          reason: transfer.reason,
          note: transfer.note,
          approver: transfer.approver || getCurrentUserName(),
          createdBy: getCurrentUserName(),
          confirmPastEffectiveDate: true,
        })
        if (!retry.success) {
          showToast(retry.error ?? 'Không thể chuyển công tác')
          return
        }
      } else {
        showToast(result.error ?? 'Không thể chuyển công tác')
        return
      }
    }
    showToast('Chuyển công tác thành công — dữ liệu cũ giữ nguyên chi nhánh phát sinh')
    onSaved()
    closeAll()
  }

  const handleStatus = async (e) => {
    e.preventDefault()
    const result = statusValue === EMPLOYEE_STATUS.RESIGNED
      ? await resignEmployee(selectedEmployeeId)
      : statusValue === EMPLOYEE_STATUS.ACTIVE
        ? await reactivateEmployee(selectedEmployeeId)
        : await setEmployeeStatus(selectedEmployeeId, statusValue)
    if (!result.success) {
      showToast(result.error ?? 'Không thể đổi trạng thái')
      return
    }
    const label = getStatusLabel(statusValue)
    if (statusValue === EMPLOYEE_STATUS.RESIGNED) {
      showToast('Đã chuyển sang Nghỉ việc — khóa đăng nhập, giữ toàn bộ dữ liệu lịch sử')
    } else if (statusValue === EMPLOYEE_STATUS.ACTIVE) {
      showToast('Đã kích hoạt lại — nhân viên có thể đăng nhập bình thường')
    } else {
      showToast(`Đã cập nhật trạng thái: ${label}`)
    }
    onSaved()
    closeAll()
  }

  const handleArchive = async () => {
    if (!window.confirm(`Lưu trữ nhân viên "${selectedEmployee?.name}"?\n\nNhân viên sẽ ẩn khỏi danh sách mặc định. Toàn bộ hóa đơn, doanh thu và báo cáo vẫn được giữ.`)) return
    const result = await archiveEmployee(selectedEmployeeId)
    if (!result.success) {
      showToast(result.error ?? 'Không thể lưu trữ nhân viên')
      return
    }
    showToast('Đã lưu trữ nhân viên')
    onSaved()
    closeAll()
  }

  const handlePermanentDelete = async () => {
    if (!window.confirm(`XÓA VĨNH VIỄN "${selectedEmployee?.name}"?\n\nChỉ thực hiện khi nhân viên chưa từng có hóa đơn/doanh thu.`)) return
    const result = await deleteEmployee(selectedEmployeeId)
    if (!result.success) {
      showToast(result.error ?? PERMANENT_DELETE_BLOCKED_MESSAGE)
      return
    }
    showToast('Đã xóa vĩnh viễn nhân viên')
    onSaved()
    closeAll()
  }

  return (
    <div className="employee-hub-settings">
      <button type="button" className="employee-hub-settings__backdrop" aria-label="Đóng" onClick={closeAll} />
      <div className="employee-hub-settings__panel" role="dialog" aria-modal="true">
        <header className="employee-hub-settings__header">
          <div>
            <Settings size={20} aria-hidden />
            <h3>Quản lý nhân viên</h3>
          </div>
          <button type="button" className="employee-hub-settings__close" onClick={closeAll} aria-label="Đóng">
            <X size={20} />
          </button>
        </header>

        {mode === 'menu' && (
          <div className="employee-hub-settings__menu">
            {selectedEmployee && (
              <p className="employee-hub-settings__selected">
                Đang chọn: <strong>{selectedEmployee.name}</strong>
                {' · '}{getBranchById(selectedEmployee.branchId)?.name}
                {' · '}{getStatusLabel(selectedEmployee.status)}
              </p>
            )}
            {allowAdd && (
              <button type="button" className="employee-hub-settings__menu-btn" onClick={openAdd}>
                + Thêm nhân viên
              </button>
            )}
            <button type="button" className="employee-hub-settings__menu-btn" onClick={openEdit} disabled={!selectedEmployee}>
              Sửa hồ sơ nhân viên
            </button>
            {allowLoginManage && (
              <button type="button" className="employee-hub-settings__menu-btn" onClick={openLogin} disabled={!selectedEmployee}>
                Đăng nhập
              </button>
            )}
            {allowTransfer && (
              <button type="button" className="employee-hub-settings__menu-btn" onClick={openTransfer} disabled={!selectedEmployee}>
                Chuyển công tác
              </button>
            )}
            <button type="button" className="employee-hub-settings__menu-btn" onClick={openStatus} disabled={!selectedEmployee}>
              Đổi trạng thái
            </button>
            {allowAdminActions && (
              <>
                <button type="button" className="employee-hub-settings__menu-btn" onClick={handleArchive} disabled={!selectedEmployee}>
                  Lưu trữ nhân viên
                </button>
                <button type="button" className="employee-hub-settings__menu-btn employee-hub-settings__menu-btn--danger" onClick={handlePermanentDelete} disabled={!selectedEmployee}>
                  Xóa vĩnh viễn (chưa có dữ liệu)
                </button>
              </>
            )}
            <p className="employee-hub-settings__hint">
              Nghỉ việc/Lưu trữ giữ nguyên hóa đơn và báo cáo. Không xóa dữ liệu lịch sử.
            </p>
          </div>
        )}

        {(mode === 'add' || mode === 'edit') && (
          <div className="employee-hub-settings__body">
            <h4>{mode === 'add' ? 'Thêm nhân viên mới' : 'Sửa hồ sơ'}</h4>
            <EmployeeProfileForm
              form={form}
              onChange={setForm}
              errors={errors}
              mode={mode}
              showAvatarUpload={isAdmin()}
              onAvatarError={showToast}
              forceAdminFields={isAdmin()}
            />
            <div className="employee-hub-settings__actions">
              <button type="button" className="employee-hub-settings__primary" onClick={handleSaveEmployee}>
                Lưu
              </button>
              <button type="button" onClick={() => setMode('menu')}>Quay lại</button>
            </div>
          </div>
        )}

        {mode === 'login' && (
          <form className="employee-hub-settings__body" onSubmit={handleSaveLogin} autoComplete="off">
            <h4 className="employee-hub-settings__section-title">Đăng nhập</h4>
            <label className="employee-hub-settings__field">
              <span>Tên đăng nhập</span>
              <input
                value={loginForm.username}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="Tên đăng nhập"
                autoComplete="off"
                spellCheck={false}
                disabled={loginForm.saving}
              />
            </label>
            <label className="employee-hub-settings__field">
              <span>Mật khẩu</span>
              <div className="employee-hub-settings__password-wrap">
                <input
                  type={loginForm.showPassword ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Để trống nếu không đổi"
                  autoComplete="new-password"
                  disabled={loginForm.saving}
                />
                <button
                  type="button"
                  className="employee-hub-settings__password-toggle"
                  onClick={() => setLoginForm((prev) => ({ ...prev, showPassword: !prev.showPassword }))}
                  disabled={loginForm.saving}
                  aria-label={loginForm.showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {loginForm.showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                  <span>{loginForm.showPassword ? 'Ẩn' : 'Hiện'}</span>
                </button>
              </div>
            </label>
            <div className="employee-hub-settings__divider" />
            <div className="employee-hub-settings__actions employee-hub-settings__actions--stack">
              <button
                type="button"
                className="employee-hub-settings__secondary"
                onClick={handleResetLoginPassword}
                disabled={loginForm.saving}
              >
                Đặt lại mật khẩu mặc định
              </button>
              <button type="submit" className="employee-hub-settings__primary" disabled={loginForm.saving}>
                {loginForm.saving ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
              <button type="button" onClick={() => setMode('menu')} disabled={loginForm.saving}>
                Quay lại
              </button>
            </div>
          </form>
        )}

        {mode === 'transfer' && (
          <form className="employee-hub-settings__body" onSubmit={handleTransfer}>
            <h4>Chuyển công tác</h4>
            <p className="employee-hub-settings__hint">
              Giữ nguyên employeeId. Dữ liệu đã phát sinh không đổi chi nhánh. Dữ liệu mới từ ngày hiệu lực thuộc chi nhánh mới.
            </p>
            <label className="employee-hub-settings__field">
              <span>Nhân viên hiện tại</span>
              <input value={selectedEmployee?.name || ''} readOnly />
            </label>
            <label className="employee-hub-settings__field">
              <span>Chi nhánh hiện tại</span>
              <input value={getBranchById(selectedEmployee?.branchId)?.name || selectedEmployee?.branchId || ''} readOnly />
            </label>
            <label className="employee-hub-settings__field">
              <span>Chi nhánh mới</span>
              <select value={transfer.branchId} onChange={(e) => setTransfer({ ...transfer, branchId: e.target.value })} required>
                <option value="">Chọn chi nhánh</option>
                {getActiveBranches().filter((b) => b.id !== selectedEmployee?.branchId).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="employee-hub-settings__field">
              <span>Ngày hiệu lực</span>
              <input type="date" value={transfer.effectiveDate} onChange={(e) => setTransfer({ ...transfer, effectiveDate: e.target.value })} required />
            </label>
            <label className="employee-hub-settings__field">
              <span>Lý do chuyển (không bắt buộc)</span>
              <textarea rows={2} value={transfer.reason} onChange={(e) => setTransfer({ ...transfer, reason: e.target.value })} placeholder="Lý do chuyển công tác..." />
            </label>
            <label className="employee-hub-settings__field">
              <span>Ghi chú (không bắt buộc)</span>
              <textarea rows={2} value={transfer.note} onChange={(e) => setTransfer({ ...transfer, note: e.target.value })} placeholder="Ghi chú nội bộ..." />
            </label>
            <label className="employee-hub-settings__field">
              <span>Người thực hiện</span>
              <input value={transfer.approver || getCurrentUserName()} readOnly />
            </label>
            <p className="employee-hub-settings__hint">
              Thời gian tạo lệnh: tự động khi xác nhận.
            </p>
            <div className="employee-hub-settings__actions">
              <button type="submit" className="employee-hub-settings__primary" disabled={!transfer.branchId}>Xác nhận chuyển công tác</button>
              <button type="button" onClick={() => setMode('menu')}>Quay lại</button>
            </div>
          </form>
        )}

        {mode === 'status' && (
          <form className="employee-hub-settings__body" onSubmit={handleStatus}>
            <h4>Trạng thái làm việc</h4>
            <label className="employee-hub-settings__field">
              <span>Trạng thái</span>
              <select value={statusValue} onChange={(e) => setStatusValue(e.target.value)}>
                {EMPLOYEE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {statusValue === EMPLOYEE_STATUS.RESIGNED && (
              <p className="employee-hub-settings__warn">
                Nghỉ việc sẽ khóa đăng nhập và không cho tạo hóa đơn. Dữ liệu lịch sử vẫn giữ nguyên.
              </p>
            )}
            <div className="employee-hub-settings__actions">
              <button type="submit" className="employee-hub-settings__primary">Lưu trạng thái</button>
              <button type="button" onClick={() => setMode('menu')}>Quay lại</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
