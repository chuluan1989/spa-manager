import { useState } from 'react'
import { Settings, X } from 'lucide-react'
import EmployeeProfileForm from './EmployeeProfileForm'
import { getActiveBranches, getBranchById } from '../../constants/branches'
import {
  canAddEmployee,
  canChangeEmployeeBranch,
  canDeleteEmployee,
  canEditEmployee,
  canSelectBranch,
  getCurrentUserBranch,
  getScopedBranchId,
  isAdmin,
} from '../../constants/auth'
import {
  addEmployee,
  EMPLOYEE_STATUS,
  EMPTY_EMPLOYEE_FORM,
  getStatusLabel,
  normalizeEmployee,
  softDeleteEmployee,
  transferEmployee,
  updateEmployee,
} from '../../utils/employeeStorage'
import { redactEmployeeForViewer } from '../../utils/employeeVisibility'
import './EmployeeHubSettings.css'

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
  const [transfer, setTransfer] = useState({ branchId: '', transferDate: '', note: '' })
  const [statusValue, setStatusValue] = useState(EMPLOYEE_STATUS.ACTIVE)

  if (!open) return null

  const selectedEmployeeId = selectedEmployee?.id ?? ''
  const allowAdd = canAddEmployee()
  const allowTransfer = canChangeEmployeeBranch()
  const allowDelete = canDeleteEmployee()

  const reset = () => {
    setMode('menu')
    setForm(EMPTY_EMPLOYEE_FORM)
    setErrors({})
    setTransfer({ branchId: '', transferDate: '', note: '' })
    setStatusValue(EMPLOYEE_STATUS.ACTIVE)
  }

  const closeAll = () => {
    reset()
    onClose()
  }

  const openAdd = () => {
    setForm({
      ...EMPTY_EMPLOYEE_FORM,
      branchId: getScopedBranchId() || '',
    })
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

  const openTransfer = () => {
    if (!selectedEmployee) {
      showToast('Chọn nhân viên trước')
      return
    }
    setTransfer({
      branchId: '',
      transferDate: new Date().toISOString().slice(0, 10),
      note: '',
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

  const validateForm = (data) => {
    const next = {}
    if (!data.name?.trim()) next.name = 'Vui lòng nhập họ và tên'
    if (!data.branchId) next.branchId = 'Vui lòng chọn chi nhánh'
    return next
  }

  const handleSaveEmployee = () => {
    const payload = {
      ...form,
      branchId: canSelectBranch() ? form.branchId : getCurrentUserBranch(),
    }
    const next = validateForm(payload)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (mode === 'add') {
      const result = addEmployee(payload)
      if (!result.success) {
        showToast(result.error ?? 'Không thể thêm nhân viên')
        return
      }
      showToast('Thêm nhân viên thành công')
    } else if (mode === 'edit') {
      const result = updateEmployee(selectedEmployeeId, payload)
      if (!result.success) {
        showToast(result.error ?? 'Không thể cập nhật')
        return
      }
      showToast('Cập nhật hồ sơ thành công')
    }

    onSaved()
    closeAll()
  }

  const handleTransfer = (e) => {
    e.preventDefault()
    if (!transfer.branchId) return
    const result = transferEmployee(selectedEmployeeId, transfer.branchId, {
      transferDate: transfer.transferDate,
      note: transfer.note,
    })
    if (!result.success) {
      showToast(result.error ?? 'Không thể chuyển chi nhánh')
      return
    }
    showToast('Chuyển chi nhánh thành công')
    onSaved()
    closeAll()
  }

  const handleStatus = (e) => {
    e.preventDefault()
    const result = updateEmployee(selectedEmployeeId, { status: statusValue })
    if (!result.success) {
      showToast(result.error ?? 'Không thể đổi trạng thái')
      return
    }
    showToast('Đã cập nhật trạng thái')
    onSaved()
    closeAll()
  }

  const handleSoftDelete = () => {
    if (!window.confirm(`Ẩn nhân viên "${selectedEmployee?.name}" khỏi danh sách? Dữ liệu và doanh số cũ vẫn được giữ.`)) return
    const result = softDeleteEmployee(selectedEmployeeId)
    if (!result.success) {
      showToast(result.error ?? 'Không thể xóa nhân viên')
      return
    }
    showToast('Đã ẩn nhân viên (xóa mềm)')
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
            <h3>Cài đặt nhân viên</h3>
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
            {allowTransfer && (
              <button type="button" className="employee-hub-settings__menu-btn" onClick={openTransfer} disabled={!selectedEmployee}>
                Chuyển chi nhánh
              </button>
            )}
            <button type="button" className="employee-hub-settings__menu-btn" onClick={openStatus} disabled={!selectedEmployee}>
              Đổi trạng thái
            </button>
            {allowDelete && (
              <button type="button" className="employee-hub-settings__menu-btn employee-hub-settings__menu-btn--danger" onClick={handleSoftDelete} disabled={!selectedEmployee}>
                Xóa mềm nhân viên
              </button>
            )}
            {isAdmin() && (
              <p className="employee-hub-settings__hint">
                Phân quyền chi tiết: Cài đặt → Phân quyền
              </p>
            )}
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
            />
            <div className="employee-hub-settings__actions">
              <button type="button" className="employee-hub-settings__primary" onClick={handleSaveEmployee}>
                Lưu
              </button>
              <button type="button" onClick={() => setMode('menu')}>Quay lại</button>
            </div>
          </div>
        )}

        {mode === 'transfer' && (
          <form className="employee-hub-settings__body" onSubmit={handleTransfer}>
            <h4>Chuyển chi nhánh</h4>
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
              <span>Ngày chuyển</span>
              <input type="date" value={transfer.transferDate} onChange={(e) => setTransfer({ ...transfer, transferDate: e.target.value })} required />
            </label>
            <label className="employee-hub-settings__field">
              <span>Ghi chú / lý do</span>
              <textarea rows={3} value={transfer.note} onChange={(e) => setTransfer({ ...transfer, note: e.target.value })} placeholder="Lý do chuyển chi nhánh..." />
            </label>
            <div className="employee-hub-settings__actions">
              <button type="submit" className="employee-hub-settings__primary" disabled={!transfer.branchId}>Xác nhận chuyển</button>
              <button type="button" onClick={() => setMode('menu')}>Quay lại</button>
            </div>
          </form>
        )}

        {mode === 'status' && (
          <form className="employee-hub-settings__body" onSubmit={handleStatus}>
            <h4>Đổi trạng thái</h4>
            <label className="employee-hub-settings__field">
              <span>Trạng thái</span>
              <select value={statusValue} onChange={(e) => setStatusValue(e.target.value)}>
                <option value={EMPLOYEE_STATUS.ACTIVE}>{getStatusLabel(EMPLOYEE_STATUS.ACTIVE)}</option>
                <option value={EMPLOYEE_STATUS.ON_LEAVE}>{getStatusLabel(EMPLOYEE_STATUS.ON_LEAVE)}</option>
                <option value={EMPLOYEE_STATUS.RESIGNED}>{getStatusLabel(EMPLOYEE_STATUS.RESIGNED)}</option>
              </select>
            </label>
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
