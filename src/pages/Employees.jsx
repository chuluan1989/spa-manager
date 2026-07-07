import { useMemo, useState } from 'react'
import BranchBanner from '../components/common/BranchBanner'
import { getBranchById, loadBranches } from '../constants/branches'
import {
  canAccessEmployeesPage,
  canSelectBranch,
  filterByUserBranch,
  getCurrentUserBranch,
  getCurrentUserBranchName,
  canAddEmployee,
  canDeleteEmployee,
  canEditEmployee,
  canTransferEmployee,
  canViewEmployeeAvatar,
  canViewEmployeeCurrentAddress,
  canViewEmployeePosition,
  getScopedBranchId,
  isAdmin,
} from '../constants/auth'
import EmployeeAvatar from '../components/employees/EmployeeAvatar'
import EmployeeProfileForm from '../components/employees/EmployeeProfileForm'
import EmployeeProfileDetail from '../components/employees/EmployeeProfileDetail'
import { redactEmployeeForViewer } from '../utils/employeeVisibility'
import {
  EMPTY_EMPLOYEE_FORM,
  addEmployee,
  deleteEmployee,
  getEmployeeById,
  getStatusLabel,
  groupEmployeesByBranch,
  loadEmployees,
  normalizeEmployee,
  transferEmployee,
  updateEmployee,
} from '../utils/employeeStorage'
import './Employees.css'

function employeeToForm(employee) {
  const { id: _id, ...form } = normalizeEmployee(employee)
  return form
}

export default function Employees() {
  const showAvatar = canViewEmployeeAvatar()
  const showCurrentAddress = canViewEmployeeCurrentAddress()
  const showPosition = canViewEmployeePosition()
  const allowAdd = canAddEmployee()
  const allowDelete = canDeleteEmployee()
  const allowTransfer = canTransferEmployee()

  const [allEmployees, setAllEmployees] = useState(() => loadEmployees())
  const employees = useMemo(() => filterByUserBranch(allEmployees), [allEmployees])
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [viewEmployee, setViewEmployee] = useState(null)
  const [transfer, setTransfer] = useState({ employeeId: '', branchId: '' })
  const [filters, setFilters] = useState({ status: '', search: '' })

  const filteredEmployees = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    return employees.filter((emp) => {
      if (filters.status && emp.status !== filters.status) return false
      if (search) {
        const haystack = `${emp.name ?? ''} ${emp.phone ?? ''}`.toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
  }, [employees, filters])

  const grouped = useMemo(() => groupEmployeesByBranch(filteredEmployees), [filteredEmployees])

  if (!canAccessEmployeesPage()) {
    return (
      <div className="employees employees--denied">
        <h2 className="employees__title">Không có quyền truy cập</h2>
        <p className="employees__subtitle">
          {isAdmin()
            ? 'Admin quản lý nhân viên tại Trung tâm quản trị → tab Nhân viên.'
            : 'Bạn không được phép xem màn hình Nhân viên.'}
        </p>
      </div>
    )
  }

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  const refresh = () => setAllEmployees(loadEmployees())

  const validateForm = (data) => {
    const next = {}
    if (!data.name?.trim()) next.name = 'Vui lòng nhập họ và tên'
    if (!data.branchId) next.branchId = 'Vui lòng chọn chi nhánh'
    return next
  }

  const closeModal = () => {
    setModal(null)
    setForm(EMPTY_EMPLOYEE_FORM)
    setViewEmployee(null)
    setErrors({})
  }

  const openAddModal = () => {
    setForm({
      ...EMPTY_EMPLOYEE_FORM,
      branchId: getScopedBranchId() || '',
    })
    setErrors({})
    setModal({ mode: 'add' })
  }

  const openEditModal = (employee) => {
    const fresh = getEmployeeById(employee.id) ?? employee
    setForm(redactEmployeeForViewer(employeeToForm(fresh)))
    setErrors({})
    setModal({ mode: 'edit', employeeId: employee.id })
  }

  const openViewModal = (employee) => {
    const fresh = getEmployeeById(employee.id) ?? employee
    setViewEmployee(redactEmployeeForViewer(fresh))
    setErrors({})
    setModal({ mode: 'view', employeeId: employee.id })
  }

  const handleSave = () => {
    const payload = {
      ...form,
      branchId: canSelectBranch() ? form.branchId : getCurrentUserBranch(),
    }
    const next = validateForm(payload)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (modal?.mode === 'add') {
      if (!canAddEmployee()) {
        showToast('Bạn không có quyền thêm nhân viên')
        return
      }
      const result = addEmployee(payload)
      if (!result.success) {
        showToast(result.error ?? 'Không thể thêm nhân viên')
        return
      }
      showToast('Thêm nhân viên thành công')
    } else if (modal?.mode === 'edit') {
      const employee = getEmployeeById(modal.employeeId)
      if (!canEditEmployee(employee)) {
        showToast('Bạn không có quyền sửa nhân viên này')
        return
      }
      const result = updateEmployee(modal.employeeId, payload)
      if (!result.success) {
        showToast(result.error ?? 'Không thể cập nhật nhân viên')
        return
      }
      showToast('Cập nhật hồ sơ thành công')
    }

    closeModal()
    refresh()
  }

  const handleDelete = (id, name) => {
    if (!canDeleteEmployee()) {
      showToast('Chỉ Admin mới được xóa nhân viên')
      return
    }
    if (!window.confirm(`Bạn có chắc muốn xóa nhân viên "${name}"?`)) return
    const result = deleteEmployee(id)
    if (!result.success) {
      showToast(result.error ?? 'Không thể xóa nhân viên')
      return
    }
    refresh()
    showToast('Đã xóa nhân viên')
  }

  const handleTransfer = (e) => {
    e.preventDefault()
    if (!transfer.employeeId || !transfer.branchId) return

    const result = transferEmployee(transfer.employeeId, transfer.branchId)
    if (!result.success) {
      showToast(result.error ?? 'Không thể chuyển chi nhánh')
      return
    }
    setTransfer({ employeeId: '', branchId: '' })
    refresh()
    showToast('Chuyển chi nhánh thành công')
  }

  const modalTitle = {
    add: 'Thêm nhân viên mới',
    edit: 'Sửa hồ sơ nhân viên',
    view: 'Hồ sơ nhân viên',
  }[modal?.mode] ?? ''

  return (
    <div className="employees">
      {toast && <div className="employees__toast">{toast}</div>}

      {modal && (
        <div className="employees__modal-backdrop" onClick={closeModal}>
          <div
            className="employees__modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-modal-title"
          >
            <div className="employees__modal-header">
              <h3 id="employee-modal-title" className="employees__modal-title">{modalTitle}</h3>
              <button type="button" className="employees__modal-close" onClick={closeModal}>
                ×
              </button>
            </div>
            {modal.mode === 'view' ? (
              <EmployeeProfileDetail
                employee={viewEmployee}
                onEdit={canEditEmployee(getEmployeeById(modal.employeeId)) ? () => openEditModal(viewEmployee) : null}
              />
            ) : (
              <EmployeeProfileForm
                form={form}
                onChange={setForm}
                errors={errors}
                mode={modal.mode}
                showAvatarUpload={modal.mode !== 'view'}
                onAvatarError={showToast}
              />
            )}
            {modal.mode !== 'view' && (
              <div className="employees__modal-actions">
                <button
                  type="button"
                  className="employees__btn employees__btn--primary"
                  onClick={handleSave}
                >
                  {modal.mode === 'add' ? 'Thêm nhân viên' : 'Lưu thay đổi'}
                </button>
                <button type="button" className="employees__btn" onClick={closeModal}>
                  Hủy
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <header className="employees__header">
        <div>
          <h2 className="employees__title">Nhân viên</h2>
          <p className="employees__subtitle">Quản lý hồ sơ nhân viên theo chi nhánh</p>
          {!canSelectBranch() && (
            <div className="employees__branch-banner">
              <BranchBanner branchName={getCurrentUserBranchName()} />
            </div>
          )}
        </div>
        {allowAdd && (
          <button
            type="button"
            className="employees__btn employees__btn--primary employees__btn--header"
            onClick={openAddModal}
          >
            + Thêm nhân viên
          </button>
        )}
      </header>

      {allowTransfer && (
        <section className="employees__card employees__transfer">
          <h3 className="employees__card-title">Chuyển chi nhánh</h3>
          <form className="employees__transfer-form" onSubmit={handleTransfer}>
            <label className="employees__field">
              <span>Nhân viên</span>
              <select
                value={transfer.employeeId}
                onChange={(e) => setTransfer({ ...transfer, employeeId: e.target.value })}
              >
                <option value="">Chọn nhân viên</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} — {getBranchById(emp.branchId)?.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="employees__field">
              <span>Chi nhánh mới</span>
              <select
                value={transfer.branchId}
                onChange={(e) => setTransfer({ ...transfer, branchId: e.target.value })}
              >
                <option value="">Chọn chi nhánh mới</option>
                {loadBranches().map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="employees__btn employees__btn--secondary"
              disabled={!transfer.employeeId || !transfer.branchId}
            >
              Cập nhật chi nhánh
            </button>
          </form>
        </section>
      )}

      <section className="employees__card employees__filters">
        <div className="employees__filter-field">
          <span>Tìm kiếm</span>
          <input
            type="text"
            placeholder="Tìm theo tên hoặc số điện thoại..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <div className="employees__filter-field">
          <span>Trạng thái</span>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Tất cả</option>
            <option value="active">Đang làm</option>
            <option value="on_leave">Nghỉ phép</option>
            <option value="resigned">Nghỉ việc</option>
          </select>
        </div>
      </section>

      <div className="employees__list">
        {grouped.map((group) => (
          <section key={group.branchId} className="employees__card">
            <h3 className="employees__card-title">{group.branchName}</h3>
            {group.employees.length === 0 ? (
              <p className="employees__empty">Chưa có nhân viên.</p>
            ) : (
              <div className="employees__table-wrap">
                <table className="employees__table">
                  <thead>
                    <tr>
                      {showAvatar && <th>Ảnh</th>}
                      <th>Họ tên</th>
                      <th>Số điện thoại</th>
                      {showCurrentAddress && <th>Địa chỉ hiện tại</th>}
                      <th>Chi nhánh</th>
                      {showPosition && <th>Chức vụ</th>}
                      <th>Ngày bắt đầu</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.employees.map((emp) => (
                      <tr key={emp.id}>
                        {showAvatar && (
                          <td>
                            <EmployeeAvatar name={emp.name} avatar={emp.avatar} size="sm" />
                          </td>
                        )}
                        <td>{emp.name}</td>
                        <td>{emp.phone || '—'}</td>
                        {showCurrentAddress && (
                          <td className="employees__address" title={emp.currentAddress || undefined}>
                            {emp.currentAddress || '—'}
                          </td>
                        )}
                        <td>{group.branchName}</td>
                        {showPosition && <td>{emp.position || '—'}</td>}
                        <td>{emp.startDate || '—'}</td>
                        <td>
                          <span className={`employees__status employees__status--${emp.status}`}>
                            {getStatusLabel(emp.status)}
                          </span>
                        </td>
                        <td className="employees__actions">
                          <button
                            type="button"
                            className="employees__btn employees__btn--small employees__btn--secondary"
                            onClick={() => openViewModal(emp)}
                          >
                            Hồ sơ
                          </button>
                          {canEditEmployee(emp) && (
                            <button
                              type="button"
                              className="employees__btn employees__btn--small employees__btn--secondary"
                              onClick={() => openEditModal(emp)}
                            >
                              Sửa
                            </button>
                          )}
                          {allowDelete && (
                            <button
                              type="button"
                              className="employees__btn employees__btn--small employees__btn--danger"
                              onClick={() => handleDelete(emp.id, emp.name)}
                            >
                              Xóa
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
