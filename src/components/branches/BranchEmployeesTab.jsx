import { useEffect, useMemo, useState } from 'react'
import EmployeeProfileForm from '../employees/EmployeeProfileForm'
import EmployeeProfileDetail from '../employees/EmployeeProfileDetail'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import { loadBranches } from '../../utils/branchStorage'
import {
  addEmployee,
  archiveEmployee,
  deleteEmployee,
  EMPTY_EMPLOYEE_FORM,
  EMPLOYEE_STATUS,
  EMPLOYEE_STATUS_OPTIONS,
  getEmployeeById,
  getEmployeeProfileStatus,
  getStatusLabel,
  loadEmployees,
  normalizeEmployee,
  setEmployeeStatus,
  transferEmployee,
  updateEmployee,
} from '../../utils/employeeStorage'
import { PERMANENT_DELETE_BLOCKED_MESSAGE } from '../../utils/employeeDeleteGuard'
import { updateEmployeePassword } from '../../utils/credentialsStorage'
import {
  getBranchPermissionMatrix,
  PERMISSION_KEYS,
  toggleBranchPermission,
} from '../../utils/permissionsStorage'
import { isAdmin } from '../../constants/auth'

const POSITION_SUGGESTIONS = [
  'KTV Body',
  'KTV Foot',
  'KTV Gội',
  'Lễ tân',
  'Quản lý chi nhánh',
]

function employeeToForm(employee) {
  const { id: _id, ...form } = normalizeEmployee(employee)
  return form
}

const PROFILE_BADGE_TONE = {
  complete: 'success',
  missing_cccd: 'danger',
  missing_bank: 'warning',
  incomplete: 'warning',
}

const PERMISSION_ROWS = [
  { key: PERMISSION_KEYS.EDIT_INVOICE, label: 'Sửa hóa đơn' },
  { key: PERMISSION_KEYS.VIEW_REPORT, label: 'Xem báo cáo' },
  { key: PERMISSION_KEYS.ADD_EXPENSE, label: 'Thêm chi phí' },
  { key: PERMISSION_KEYS.VIEW_SALARY, label: 'Xem lương' },
]

export default function BranchEmployeesTab({ branchId, branchName, showToast, readOnly = false }) {
  const [employees, setEmployees] = useState(() => loadEmployees())
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [errors, setErrors] = useState({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [permOpen, setPermOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' })
  const [matrixRevision, setMatrixRevision] = useState(0)

  const syncVersion = useDataSyncVersion()
  useEffect(() => {
    if (syncVersion > 0) setEmployees(loadEmployees())
  }, [syncVersion])

  const branches = useMemo(() => loadBranches(), [employees])
  const matrix = useMemo(() => getBranchPermissionMatrix(), [matrixRevision, branchId])

  const branchPermissions = useMemo(() => {
    return Object.fromEntries(
      matrix.map((row) => [row.key, Boolean(row.branches?.[branchId])]),
    )
  }, [matrix, branchId])

  const branchEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((emp) => {
      if (emp.branchId !== branchId) return false
      if (statusFilter && emp.status !== statusFilter) return false
      if (!q) return true
      const haystack = `${emp.name ?? ''} ${emp.phone ?? ''} ${emp.cccd ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [employees, branchId, search, statusFilter])

  const refresh = () => setEmployees(loadEmployees())

  const validateForm = (data) => {
    const next = {}
    if (!data.name?.trim()) next.name = 'Vui lòng nhập họ và tên'
    if (!data.branchId) next.branchId = 'Vui lòng chọn chi nhánh'
    return next
  }

  const openAdd = () => {
    setForm({ ...EMPTY_EMPLOYEE_FORM, branchId })
    setErrors({})
    setModal({ mode: 'add' })
  }

  const openEdit = (employee) => {
    setForm(employeeToForm(employee))
    setErrors({})
    setModal({ mode: 'edit', id: employee.id })
  }

  const openView = (employee) => {
    setErrors({})
    setModal({ mode: 'view', id: employee.id })
  }

  const openTransfer = (employee) => {
    setModal({ mode: 'transfer', id: employee.id, targetBranchId: '' })
  }

  const openPassword = (employee) => {
    setPasswordForm({ password: '', confirm: '' })
    setModal({ mode: 'password', id: employee.id })
  }

  const closeModal = () => {
    setModal(null)
    setForm(EMPTY_EMPLOYEE_FORM)
    setErrors({})
    setPasswordForm({ password: '', confirm: '' })
  }

  const save = () => {
    const next = validateForm(form)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (modal.mode === 'add') {
      const result = addEmployee({ ...form, branchId })
      if (!result.success) {
        showToast(result.error ?? 'Không thể thêm nhân viên')
        return
      }
      showToast('Thêm nhân viên thành công')
    } else {
      const result = updateEmployee(modal.id, form)
      if (!result.success) {
        showToast(result.error ?? 'Không thể cập nhật nhân viên')
        return
      }
      showToast('Cập nhật nhân viên thành công')
    }
    closeModal()
    refresh()
  }

  const handleTransfer = () => {
    if (!modal?.targetBranchId) {
      showToast('Vui lòng chọn chi nhánh đích')
      return
    }
    const result = transferEmployee(modal.id, modal.targetBranchId)
    if (!result.success) {
      showToast(result.error ?? 'Không thể chuyển chi nhánh')
      return
    }
    showToast('Chuyển chi nhánh thành công')
    closeModal()
    refresh()
  }

  const handleLock = (employee) => {
    const next = employee.status === EMPLOYEE_STATUS.ON_LEAVE
      ? EMPLOYEE_STATUS.ACTIVE
      : EMPLOYEE_STATUS.ON_LEAVE
    const result = setEmployeeStatus(employee.id, next)
    if (!result.success) {
      showToast(result.error ?? 'Không thể cập nhật trạng thái')
      return
    }
    showToast(next === EMPLOYEE_STATUS.ON_LEAVE ? 'Đã khóa nhân viên' : 'Đã mở khóa nhân viên')
    refresh()
  }

  const handleArchive = (id) => {
    if (!window.confirm('Lưu trữ nhân viên này?')) return
    const result = archiveEmployee(id)
    if (!result.success) {
      showToast(result.error ?? 'Không thể lưu trữ')
      return
    }
    showToast('Đã lưu trữ nhân viên')
    refresh()
  }

  const handlePermanentDelete = (id) => {
    if (!window.confirm('Xóa vĩnh viễn nhân viên này?')) return
    const result = deleteEmployee(id)
    if (!result.success) {
      showToast(result.error ?? PERMANENT_DELETE_BLOCKED_MESSAGE)
      return
    }
    showToast('Đã xóa vĩnh viễn nhân viên')
    refresh()
  }

  const savePassword = async () => {
    if (!passwordForm.password.trim()) {
      showToast('Vui lòng nhập mật khẩu mới')
      return
    }
    if (passwordForm.password !== passwordForm.confirm) {
      showToast('Mật khẩu xác nhận không khớp')
      return
    }
    const result = await updateEmployeePassword(modal.id, passwordForm.password)
    if (!result.success) {
      showToast(result.error ?? 'Không thể reset mật khẩu')
      return
    }
    showToast('Reset mật khẩu thành công')
    closeModal()
  }

  const handleTogglePermission = (permissionKey, enabled) => {
    toggleBranchPermission(branchId, permissionKey, enabled)
    setMatrixRevision((v) => v + 1)
    showToast('Đã cập nhật quyền chi nhánh')
  }

  return (
    <div className="admin-branches__employees">
      <div className="admin-branches__employees-head">
        <div>
          <h4 className="admin-branches__section-title">Nhân viên — {branchName}</h4>
          <p className="admin-branches__hint">{branchEmployees.length} nhân viên · map theo branch_id: {branchId}</p>
        </div>
        {!readOnly && isAdmin() && (
          <div className="admin-branches__employees-actions">
            <button type="button" className="admin-branches__btn admin-branches__btn--secondary" onClick={() => setPermOpen(true)}>
              Quyền chi nhánh
            </button>
            <button type="button" className="admin-branches__btn admin-branches__btn--primary" onClick={openAdd}>
              + Thêm nhân viên
            </button>
          </div>
        )}
      </div>

      <div className="admin-branches__filters">
        <input
          type="text"
          placeholder="Tìm tên, SĐT, CCCD..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {EMPLOYEE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {branchEmployees.length === 0 && (
        <p className="admin-branches__hint">Chưa có nhân viên tại chi nhánh này.</p>
      )}

      {branchEmployees.length > 0 && (
        <div className="admin-branches__table-wrap">
          <table className="admin-branches__table">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Chức vụ</th>
                <th>Trạng thái</th>
                <th>Hồ sơ</th>
                {!readOnly && isAdmin() && <th>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {branchEmployees.map((employee) => {
                const profileStatus = getEmployeeProfileStatus(employee)
                return (
                  <tr key={employee.id}>
                    <td>{employee.name}</td>
                    <td>{employee.position || '—'}</td>
                    <td>{getStatusLabel(employee.status)}</td>
                    <td>
                      <span className={`admin-branches__badge admin-branches__badge--${PROFILE_BADGE_TONE[profileStatus.key]}`}>
                        {profileStatus.label}
                      </span>
                    </td>
                    {!readOnly && isAdmin() && (
                      <td className="admin-branches__actions-cell">
                        <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => openView(employee)}>Hồ sơ</button>
                        <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => openEdit(employee)}>Sửa</button>
                        <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => openTransfer(employee)}>Chuyển CN</button>
                        <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => handleLock(employee)}>
                          {employee.status === EMPLOYEE_STATUS.ON_LEAVE ? 'Mở khóa' : 'Khóa'}
                        </button>
                        <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => openPassword(employee)}>Reset MK</button>
                        <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => handleArchive(employee.id)}>Lưu trữ</button>
                        <button type="button" className="admin-branches__btn admin-branches__btn--small admin-branches__btn--danger" onClick={() => handlePermanentDelete(employee.id)}>Xóa</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal?.mode === 'view' && (
        <div className="admin-branches__modal-backdrop" onClick={closeModal}>
          <div className="admin-branches__modal admin-branches__modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-branches__modal-title">Hồ sơ nhân viên</h3>
            <EmployeeProfileDetail
              employee={getEmployeeById(modal.id)}
              forceAdminFields
              showStats
              onEdit={() => openEdit(getEmployeeById(modal.id))}
              onClose={closeModal}
            />
          </div>
        </div>
      )}

      {(modal?.mode === 'add' || modal?.mode === 'edit') && (
        <div className="admin-branches__modal-backdrop" onClick={closeModal}>
          <div className="admin-branches__modal admin-branches__modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-branches__modal-title">
              {modal.mode === 'add' ? 'Thêm nhân viên' : `Sửa hồ sơ — ${getEmployeeById(modal.id)?.name ?? ''}`}
            </h3>
            <EmployeeProfileForm
              form={form}
              onChange={setForm}
              errors={errors}
              mode={modal.mode}
              showAvatarUpload
              onAvatarError={(message) => showToast(message)}
              positionSuggestions={POSITION_SUGGESTIONS}
              forceAdminFields
            />
            <div className="admin-branches__modal-actions">
              <button type="button" className="admin-branches__btn admin-branches__btn--primary" onClick={save}>Lưu</button>
              <button type="button" className="admin-branches__btn" onClick={closeModal}>Hủy</button>
            </div>
          </div>
        </div>
      )}

      {modal?.mode === 'transfer' && (
        <div className="admin-branches__modal-backdrop" onClick={closeModal}>
          <div className="admin-branches__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-branches__modal-title">Chuyển chi nhánh — {getEmployeeById(modal.id)?.name}</h3>
            <label className="admin-branches__field">
              <span>Chi nhánh đích</span>
              <select
                value={modal.targetBranchId}
                onChange={(e) => setModal({ ...modal, targetBranchId: e.target.value })}
              >
                <option value="">Chọn chi nhánh</option>
                {branches.filter((b) => b.id !== branchId).map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
            <div className="admin-branches__modal-actions">
              <button type="button" className="admin-branches__btn admin-branches__btn--primary" onClick={handleTransfer}>Chuyển</button>
              <button type="button" className="admin-branches__btn" onClick={closeModal}>Hủy</button>
            </div>
          </div>
        </div>
      )}

      {modal?.mode === 'password' && (
        <div className="admin-branches__modal-backdrop" onClick={closeModal}>
          <div className="admin-branches__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-branches__modal-title">Reset mật khẩu — {getEmployeeById(modal.id)?.name}</h3>
            <label className="admin-branches__field">
              <span>Mật khẩu mới</span>
              <input type="password" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} />
            </label>
            <label className="admin-branches__field">
              <span>Xác nhận</span>
              <input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} />
            </label>
            <div className="admin-branches__modal-actions">
              <button type="button" className="admin-branches__btn admin-branches__btn--primary" onClick={savePassword}>Lưu</button>
              <button type="button" className="admin-branches__btn" onClick={closeModal}>Hủy</button>
            </div>
          </div>
        </div>
      )}

      {permOpen && (
        <div className="admin-branches__modal-backdrop" onClick={() => setPermOpen(false)}>
          <div className="admin-branches__modal admin-branches__modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-branches__modal-title">Quyền chi nhánh — {branchName}</h3>
            <div className="admin-branches__perm-list">
              {PERMISSION_ROWS.map((row) => (
                <label key={row.key} className="admin-branches__perm-row">
                  <span>{row.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(branchPermissions[row.key])}
                    onChange={(e) => handleTogglePermission(row.key, e.target.checked)}
                    disabled={readOnly}
                  />
                </label>
              ))}
            </div>
            <div className="admin-branches__modal-actions">
              <button type="button" className="admin-branches__btn" onClick={() => setPermOpen(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
