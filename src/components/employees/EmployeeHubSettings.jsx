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
  getCurrentUserName,
  getScopedBranchId,
  isAdmin,
} from '../../constants/auth'
import {
  addEmployee,
  archiveEmployee,
  deleteEmployee,
  EMPLOYEE_STATUS,
  EMPLOYEE_STATUS_OPTIONS,
  EMPTY_EMPLOYEE_FORM,
  getStatusLabel,
  normalizeEmployee,
  setEmployeeStatus,
  transferEmployee,
  updateEmployee,
} from '../../utils/employeeStorage'
import { PERMANENT_DELETE_BLOCKED_MESSAGE } from '../../utils/employeeDeleteGuard'
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
  const [transfer, setTransfer] = useState({
    branchId: '',
    effectiveDate: '',
    reason: '',
    approver: '',
  })
  const [statusValue, setStatusValue] = useState(EMPLOYEE_STATUS.ACTIVE)

  if (!open) return null

  const selectedEmployeeId = selectedEmployee?.id ?? ''
  const allowAdd = canAddEmployee()
  const allowTransfer = canChangeEmployeeBranch()
  const allowAdminActions = canDeleteEmployee() && isAdmin()

  const reset = () => {
    setMode('menu')
    setForm(EMPTY_EMPLOYEE_FORM)
    setErrors({})
    setTransfer({ branchId: '', effectiveDate: '', reason: '', approver: getCurrentUserName() })
    setStatusValue(EMPLOYEE_STATUS.ACTIVE)
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

  const openTransfer = () => {
    if (!selectedEmployee) {
      showToast('Chọn nhân viên trước')
      return
    }
    setTransfer({
      branchId: '',
      effectiveDate: new Date().toISOString().slice(0, 10),
      reason: '',
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
    if (!transfer.branchId || !transfer.effectiveDate || !transfer.reason.trim() || !transfer.approver.trim()) {
      showToast('Vui lòng nhập đủ ngày hiệu lực, lý do và người duyệt')
      return
    }
    const result = transferEmployee(selectedEmployeeId, transfer.branchId, {
      transferDate: transfer.effectiveDate,
      reason: transfer.reason,
      approver: transfer.approver,
      note: transfer.reason,
    })
    if (!result.success) {
      showToast(result.error ?? 'Không thể chuyển chi nhánh')
      return
    }
    showToast('Chuyển chi nhánh thành công — doanh thu cũ vẫn thuộc chi nhánh trước ngày hiệu lực')
    onSaved()
    closeAll()
  }

  const handleStatus = (e) => {
    e.preventDefault()
    const result = setEmployeeStatus(selectedEmployeeId, statusValue)
    if (!result.success) {
      showToast(result.error ?? 'Không thể đổi trạng thái')
      return
    }
    const label = getStatusLabel(statusValue)
    if (statusValue === EMPLOYEE_STATUS.RESIGNED) {
      showToast(`Đã chuyển sang Nghỉ việc — khóa đăng nhập, giữ toàn bộ dữ liệu lịch sử`)
    } else {
      showToast(`Đã cập nhật trạng thái: ${label}`)
    }
    onSaved()
    closeAll()
  }

  const handleArchive = () => {
    if (!window.confirm(`Lưu trữ nhân viên "${selectedEmployee?.name}"?\n\nNhân viên sẽ ẩn khỏi danh sách mặc định. Toàn bộ hóa đơn, doanh thu và báo cáo vẫn được giữ.`)) return
    const result = archiveEmployee(selectedEmployeeId)
    if (!result.success) {
      showToast(result.error ?? 'Không thể lưu trữ nhân viên')
      return
    }
    showToast('Đã lưu trữ nhân viên')
    onSaved()
    closeAll()
  }

  const handlePermanentDelete = () => {
    if (!window.confirm(`XÓA VĨNH VIỄN "${selectedEmployee?.name}"?\n\nChỉ thực hiện khi nhân viên chưa từng có hóa đơn/doanh thu.`)) return
    const result = deleteEmployee(selectedEmployeeId)
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
            {allowTransfer && (
              <button type="button" className="employee-hub-settings__menu-btn" onClick={openTransfer} disabled={!selectedEmployee}>
                Chuyển chi nhánh
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

        {mode === 'transfer' && (
          <form className="employee-hub-settings__body" onSubmit={handleTransfer}>
            <h4>Chuyển chi nhánh</h4>
            <p className="employee-hub-settings__hint">
              Doanh thu trước ngày hiệu lực vẫn thuộc chi nhánh cũ (theo hóa đơn đã lưu).
            </p>
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
              <span>Lý do chuyển</span>
              <textarea rows={3} value={transfer.reason} onChange={(e) => setTransfer({ ...transfer, reason: e.target.value })} placeholder="Lý do chuyển chi nhánh..." required />
            </label>
            <label className="employee-hub-settings__field">
              <span>Người duyệt</span>
              <input value={transfer.approver} onChange={(e) => setTransfer({ ...transfer, approver: e.target.value })} required />
            </label>
            <div className="employee-hub-settings__actions">
              <button type="submit" className="employee-hub-settings__primary" disabled={!transfer.branchId}>Xác nhận chuyển</button>
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
