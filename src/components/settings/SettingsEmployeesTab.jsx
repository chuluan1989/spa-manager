import { useMemo, useState } from 'react'
import EmployeeProfileForm from '../employees/EmployeeProfileForm'
import { loadBranches } from '../../utils/branchStorage'
import {
  addEmployee,
  deleteEmployee,
  EMPTY_EMPLOYEE_FORM,
  getEmployeeById,
  getStatusLabel,
  groupEmployeesByBranch,
  loadEmployees,
  normalizeEmployee,
  transferEmployee,
  updateEmployee,
} from '../../utils/employeeStorage'

export const POSITION_SUGGESTIONS = [
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

export default function SettingsEmployeesTab({ showToast }) {
  const [employees, setEmployees] = useState(() => loadEmployees())
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [errors, setErrors] = useState({})
  const [transfer, setTransfer] = useState({ employeeId: '', branchId: '' })

  const branches = useMemo(() => loadBranches(), [employees])
  const grouped = useMemo(() => groupEmployeesByBranch(employees), [employees])

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

  const openEdit = (employee) => {
    setForm(employeeToForm(employee))
    setErrors({})
    setModal({ mode: 'edit', id: employee.id })
  }

  const closeModal = () => {
    setModal(null)
    setForm(EMPTY_EMPLOYEE_FORM)
    setErrors({})
  }

  const save = () => {
    const next = validateForm(form)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (modal.mode === 'add') {
      const result = addEmployee(form)
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

  const handleDelete = (id) => {
    if (!window.confirm('Xóa nhân viên này?')) return
    const result = deleteEmployee(id)
    if (!result.success) {
      showToast(result.error ?? 'Không thể xóa nhân viên')
      return
    }
    showToast('Đã xóa nhân viên')
    refresh()
  }

  const handleTransfer = () => {
    if (!transfer.employeeId || !transfer.branchId) {
      showToast('Vui lòng chọn nhân viên và chi nhánh đích')
      return
    }
    const result = transferEmployee(transfer.employeeId, transfer.branchId)
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
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {group.employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.name}</td>
                    <td>{employee.position || '—'}</td>
                    <td>{getStatusLabel(employee.status)}</td>
                    <td className="settings__actions-cell">
                      <button type="button" className="settings__btn settings__btn--small settings__btn--secondary" onClick={() => openEdit(employee)}>
                        Sửa hồ sơ
                      </button>
                      <button type="button" className="settings__btn settings__btn--small settings__btn--danger" onClick={() => handleDelete(employee.id)}>
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {modal && (
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
