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
  EMPLOYEE_STATUS_OPTIONS,
  getEmployeeById,
  getEmployeeProfileStatus,
  getStatusLabel,
  groupEmployeesByBranch,
  loadEmployeeProfileMediaFromServer,
  loadEmployees,
  normalizeEmployee,
  transferEmployee,
  updateEmployee,
} from '../../utils/employeeStorage'
import { PERMANENT_DELETE_BLOCKED_MESSAGE } from '../../utils/employeeDeleteGuard'

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

const PROFILE_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả hồ sơ' },
  { value: 'complete', label: 'Đầy đủ' },
  { value: 'incomplete', label: 'Thiếu thông tin' },
  { value: 'missing_cccd', label: 'Chưa có CCCD' },
  { value: 'missing_bank', label: 'Chưa có ngân hàng' },
]

const PROFILE_BADGE_TONE = {
  complete: 'success',
  missing_cccd: 'danger',
  missing_bank: 'warning',
  incomplete: 'warning',
}

export default function SettingsEmployeesTab({ showToast }) {
  const [employees, setEmployees] = useState(() => loadEmployees())
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [errors, setErrors] = useState({})
  const [transfer, setTransfer] = useState({ employeeId: '', branchId: '' })
  const [filters, setFilters] = useState({ branchId: '', status: '', profileStatus: '', search: '' })

  const syncVersion = useDataSyncVersion()
  useEffect(() => {
    if (syncVersion > 0) setEmployees(loadEmployees())
  }, [syncVersion])

  const branches = useMemo(() => loadBranches(), [employees])

  const filteredEmployees = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    return employees.filter((emp) => {
      if (filters.branchId && emp.branchId !== filters.branchId) return false
      if (filters.status && emp.status !== filters.status) return false
      if (filters.profileStatus && getEmployeeProfileStatus(emp).key !== filters.profileStatus) return false
      if (search) {
        const haystack = `${emp.name ?? ''} ${emp.phone ?? ''} ${emp.cccd ?? ''}`.toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
  }, [employees, filters])

  const grouped = useMemo(() => groupEmployeesByBranch(filteredEmployees), [filteredEmployees])

  const refresh = () => setEmployees(loadEmployees())

  const validateForm = (data) => {
    const next = {}
    if (!data.name?.trim()) next.name = 'Vui lòng nhập họ và tên'
    if (!data.branchId) next.branchId = 'Vui lòng chọn chi nhánh'
    return next
  }

  const openAdd = () => {
    setForm({ ...EMPTY_EMPLOYEE_FORM, branchId: branches[0]?.id ?? '' })
    setErrors({})
    setModal({ mode: 'add' })
  }

  const openEdit = async (employee) => {
    setErrors({})
    setModal({ mode: 'edit', id: employee.id })
    try {
      const hydrated = await loadEmployeeProfileMediaFromServer(employee.id)
      setForm(employeeToForm(hydrated ?? employee))
    } catch {
      setForm(employeeToForm(employee))
    }
  }

  const openView = (employee) => {
    setErrors({})
    setModal({ mode: 'view', id: employee.id })
  }

  const closeModal = () => {
    setModal(null)
    setForm(EMPTY_EMPLOYEE_FORM)
    setErrors({})
  }

  const save = async () => {
    const next = validateForm(form)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (modal.mode === 'add') {
      const result = await addEmployee(form)
      if (!result.success) {
        showToast(result.error ?? 'Không thể thêm nhân viên')
        return
      }
      showToast('Thêm nhân viên thành công')
    } else {
      const baseline = { ...modal }
      delete baseline.id
      delete baseline.mode
      const result = await updateEmployee(modal.id, form, {
        expectedUpdatedAt: modal.updatedAt ?? '',
        baseline,
      })
      if (!result.success) {
        showToast(result.error ?? 'Không thể cập nhật nhân viên')
        return
      }
      showToast(result.unchanged ? 'Không có thay đổi cần lưu' : 'Cập nhật nhân viên thành công')
    }
    closeModal()
    refresh()
  }

  const handleArchive = async (id) => {
    if (!window.confirm('Lưu trữ nhân viên này? Hồ sơ sẽ ẩn khỏi danh sách mặc định nhưng giữ nguyên dữ liệu lịch sử.')) return
    const result = await archiveEmployee(id)
    if (!result.success) {
      showToast(result.error ?? 'Không thể lưu trữ nhân viên')
      return
    }
    showToast('Đã lưu trữ nhân viên')
    refresh()
  }

  const handlePermanentDelete = async (id) => {
    if (!window.confirm('Xóa vĩnh viễn nhân viên này? Chỉ áp dụng khi chưa phát sinh hóa đơn/doanh thu.')) return
    const result = await deleteEmployee(id)
    if (!result.success) {
      showToast(result.error ?? PERMANENT_DELETE_BLOCKED_MESSAGE)
      return
    }
    showToast('Đã xóa vĩnh viễn nhân viên')
    refresh()
  }

  const handleTransfer = async () => {
    if (!transfer.employeeId || !transfer.branchId) {
      showToast('Vui lòng chọn nhân viên và chi nhánh đích')
      return
    }
    const result = await transferEmployee(transfer.employeeId, transfer.branchId)
    if (!result.success) {
      showToast(result.error ?? 'Không thể chuyển chi nhánh')
      return
    }
    showToast('Chuyển chi nhánh thành công')
    setTransfer({ employeeId: '', branchId: '' })
    refresh()
  }

  return (
    <section className="settings__card">
      <div className="settings__card-header">
        <div>
          <h3 className="settings__card-title">Quản lý nhân viên</h3>
          <p className="settings__hint settings__hint--inline">
            Thêm, sửa hồ sơ, chuyển chi nhánh và cập nhật trạng thái làm việc.
          </p>
        </div>
        <button type="button" className="settings__btn settings__btn--primary" onClick={openAdd}>
          + Thêm nhân viên
        </button>
      </div>

      <div className="settings__transfer-box">
        <h4 className="settings__subheading">Chuyển chi nhánh nhanh</h4>
        <div className="settings__transfer-row">
          <select
            value={transfer.employeeId}
            onChange={(e) => setTransfer({ ...transfer, employeeId: e.target.value })}
          >
            <option value="">Chọn nhân viên</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
          <select
            value={transfer.branchId}
            onChange={(e) => setTransfer({ ...transfer, branchId: e.target.value })}
          >
            <option value="">Chi nhánh đích</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
          <button type="button" className="settings__btn settings__btn--secondary" onClick={handleTransfer}>
            Chuyển
          </button>
        </div>
      </div>

      <div className="settings__filters">
        <div className="settings__filter-field">
          <span>Tìm kiếm</span>
          <input
            type="text"
            placeholder="Tên, SĐT hoặc số CCCD..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <div className="settings__filter-field">
          <span>Chi nhánh</span>
          <select
            value={filters.branchId}
            onChange={(e) => setFilters({ ...filters, branchId: e.target.value })}
          >
            <option value="">Tất cả chi nhánh</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
        <div className="settings__filter-field">
          <span>Trạng thái</span>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Tất cả</option>
            {EMPLOYEE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="settings__filter-field">
          <span>Hồ sơ</span>
          <select
            value={filters.profileStatus}
            onChange={(e) => setFilters({ ...filters, profileStatus: e.target.value })}
          >
            {PROFILE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      {grouped.length === 0 && (
        <p className="settings__hint">Không tìm thấy nhân viên phù hợp với bộ lọc.</p>
      )}

      {grouped.map((group) => (
        <div key={group.branchId} className="settings__employee-group">
          <h4 className="settings__subheading">{group.branchName}</h4>
          <div className="settings__table-wrap">
            <table className="settings__table">
              <thead>
                <tr>
                  <th>Họ tên</th>
                  <th>Chức vụ</th>
                  <th>Trạng thái</th>
                  <th>Hồ sơ</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {group.employees.map((employee) => {
                  const profileStatus = getEmployeeProfileStatus(employee)
                  return (
                    <tr key={employee.id}>
                      <td>{employee.name}</td>
                      <td>{employee.position || '—'}</td>
                      <td>{getStatusLabel(employee.status)}</td>
                      <td>
                        <span className={`settings__profile-badge settings__profile-badge--${PROFILE_BADGE_TONE[profileStatus.key]}`}>
                          {profileStatus.label}
                        </span>
                      </td>
                      <td className="settings__actions-cell">
                        <button type="button" className="settings__btn settings__btn--small settings__btn--secondary" onClick={() => openView(employee)}>
                          Hồ sơ
                        </button>
                        <button type="button" className="settings__btn settings__btn--small settings__btn--secondary" onClick={() => openEdit(employee)}>
                          Sửa
                        </button>
                        <button type="button" className="settings__btn settings__btn--small" onClick={() => handleArchive(employee.id)}>
                          Lưu trữ
                        </button>
                        <button type="button" className="settings__btn settings__btn--small settings__btn--danger" onClick={() => handlePermanentDelete(employee.id)}>
                          Xóa vĩnh viễn
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {modal?.mode === 'view' && (
        <div className="settings__modal-backdrop" onClick={closeModal}>
          <div className="settings__modal settings__modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">Hồ sơ nhân viên</h3>
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
        <div className="settings__modal-backdrop" onClick={closeModal}>
          <div className="settings__modal settings__modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="settings__modal-title">
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
