import { useMemo, useState } from 'react'
import EmployeeProfileForm from '../employees/EmployeeProfileForm'
import EmployeeHubDetail from '../employees/EmployeeHubDetail'
import { useEmployeeHubData } from '../../hooks/useEmployeeHubData'
import { useBranchAttendance } from './useBranchAttendance'
import BranchEmptyState from './BranchEmptyState'
import { usePayrollData } from '../../hooks/usePayrollData'
import { loadBranches } from '../../utils/branchStorage'
import {
  addEmployee,
  archiveEmployee,
  deleteEmployee,
  EMPTY_EMPLOYEE_FORM,
  EMPLOYEE_STATUS,
  EMPLOYEE_STATUS_OPTIONS,
  getEmployeeProfileStatus,
  getStatusLabel,
  normalizeEmployee,
  setEmployeeStatus,
  transferEmployee,
  updateEmployee,
} from '../../utils/employeeStorage'
import { PERMANENT_DELETE_BLOCKED_MESSAGE } from '../../utils/employeeDeleteGuard'
import { updateEmployeePassword, syncEmployeeCredentialForEmployee } from '../../utils/credentialsStorage'
import { setEmployeeAccountLocked, isEmployeeAccountLocked } from '../../utils/accountMetadataStorage'
import { computeEmployeeListStats } from '../../utils/employeeHubStats'
import { computeEmployeePayrollRow } from '../../utils/payrollEngine'
import { computeAttendanceStats } from '../../utils/payrollLiveHelpers'
import { getCurrentMonthValue, getPayPeriodRange, PAY_CYCLES } from '../../utils/salaryReport'
import { formatCurrency } from '../../utils/invoice'
import { isAdmin } from '../../constants/auth'
import { employeeBelongsToBranch } from '../../utils/branchEmployeeMatch'

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

export default function BranchEmployeesTab({ branchId, branchName, showToast, readOnly = false }) {
  const month = getCurrentMonthValue()
  const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)

  const { employees: hubEmployees, invoices, loading, error: hubError, reload } = useEmployeeHubData({ branchId, month })
  const { records: attendanceRecords } = useBranchAttendance({ branchId, fromDate, toDate })
  const { adjustments } = usePayrollData({ month, branchId })

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM)
  const [errors, setErrors] = useState({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(EMPLOYEE_STATUS.ACTIVE)
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' })

  const branches = useMemo(() => loadBranches(), [hubEmployees])

  const branchEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    return hubEmployees.filter((emp) => {
      if (!employeeBelongsToBranch(emp, branchId)) return false
      if (statusFilter && emp.status !== statusFilter) return false
      if (!q) return true
      const haystack = `${emp.name ?? ''} ${emp.phone ?? ''} ${emp.cccd ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [hubEmployees, branchId, search, statusFilter])

  const statsMap = useMemo(
    () => computeEmployeeListStats(invoices, branchEmployees.map((e) => e.id), month),
    [invoices, branchEmployees, month],
  )

  const selectedEmployee = useMemo(
    () => branchEmployees.find((e) => e.id === selectedEmployeeId) ?? null,
    [branchEmployees, selectedEmployeeId],
  )

  const refresh = () => {
    reload()
  }

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

  const save = async () => {
    const next = validateForm(form)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (modal.mode === 'add') {
      const result = await addEmployee({ ...form, branchId })
      if (!result.success) {
        showToast(result.error ?? 'Không thể thêm nhân viên')
        return
      }
      await syncEmployeeCredentialForEmployee(result.employee?.id)
      showToast('Thêm nhân viên thành công')
    } else {
      const result = await updateEmployee(modal.id, form)
      if (!result.success) {
        showToast(result.error ?? 'Không thể cập nhật nhân viên')
        return
      }
      await syncEmployeeCredentialForEmployee(modal.id)
      showToast('Cập nhật nhân viên thành công')
    }
    closeModal()
    refresh()
  }

  const handleTransfer = async () => {
    if (!modal?.targetBranchId) {
      showToast('Vui lòng chọn chi nhánh đích')
      return
    }
    const result = await transferEmployee(modal.id, modal.targetBranchId)
    if (!result.success) {
      showToast(result.error ?? 'Không thể chuyển chi nhánh')
      return
    }
    await syncEmployeeCredentialForEmployee(modal.id)
    showToast('Chuyển chi nhánh thành công')
    closeModal()
    refresh()
  }

  const handleToggleAccountLock = (employee) => {
    const locked = isEmployeeAccountLocked(employee.id)
    setEmployeeAccountLocked(employee.id, !locked)
    showToast(locked ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản')
    refresh()
  }

  const handleLockStatus = async (employee) => {
    const next = employee.status === EMPLOYEE_STATUS.ON_LEAVE
      ? EMPLOYEE_STATUS.ACTIVE
      : EMPLOYEE_STATUS.ON_LEAVE
    const result = await setEmployeeStatus(employee.id, next)
    if (!result.success) {
      showToast(result.error ?? 'Không thể cập nhật trạng thái')
      return
    }
    showToast(next === EMPLOYEE_STATUS.ON_LEAVE ? 'Đã khóa nhân viên' : 'Đã mở khóa nhân viên')
    refresh()
  }

  const handleArchive = async (id) => {
    if (!window.confirm('Lưu trữ nhân viên này?')) return
    const result = await archiveEmployee(id)
    if (!result.success) {
      showToast(result.error ?? 'Không thể lưu trữ')
      return
    }
    showToast('Đã lưu trữ nhân viên')
    refresh()
  }

  const handlePermanentDelete = async (id) => {
    if (!window.confirm('Xóa vĩnh viễn nhân viên này?')) return
    const result = await deleteEmployee(id)
    if (!result.success) {
      showToast(result.error ?? PERMANENT_DELETE_BLOCKED_MESSAGE)
      return
    }
    showToast('Đã xóa vĩnh viễn nhân viên')
    if (selectedEmployeeId === id) setSelectedEmployeeId('')
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

  const rowMetrics = (employee) => {
    const stats = statsMap.get(employee.id) ?? {}
    const payroll = computeEmployeePayrollRow(employee, invoices, attendanceRecords, adjustments)
    const attendance = computeAttendanceStats(attendanceRecords, employee.id)
    return { stats, payroll, attendance }
  }

  return (
    <div className="admin-branches__employees">
      <div className="admin-branches__employees-head">
        <div>
          <h4 className="admin-branches__section-title">Nhân viên — {branchName}</h4>
          <p className="admin-branches__hint">
            {branchEmployees.length} nhân viên · branch_id: {branchId}
            {loading ? ' · Đang tải...' : ''}
          </p>
        </div>
        {!readOnly && isAdmin() && (
          <button type="button" className="admin-branches__btn admin-branches__btn--primary" onClick={openAdd}>
            + Thêm nhân viên
          </button>
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
          <option value={EMPLOYEE_STATUS.ACTIVE}>Đang làm</option>
          <option value="">Tất cả trạng thái</option>
          {EMPLOYEE_STATUS_OPTIONS.filter((option) => option.value !== EMPLOYEE_STATUS.ACTIVE).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {hubError && (
        <p className="admin-branches__hint admin-branches__hint--error">{hubError}</p>
      )}

      {!loading && !hubError && branchEmployees.length === 0 && (
        <BranchEmptyState message="Chi nhánh này chưa có nhân viên." />
      )}

      {branchEmployees.length > 0 && (
        <div className="admin-branches__table-wrap admin-branches__table-wrap--wide">
          <table className="admin-branches__table admin-branches__table--compact">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>SĐT</th>
                <th>Chức vụ</th>
                <th>Trạng thái</th>
                <th>Hồ sơ</th>
                <th>Doanh thu</th>
                <th>Tips</th>
                <th>Hoa hồng</th>
                <th>Lương TN</th>
                <th>Chấm công</th>
                {!readOnly && isAdmin() && <th>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {branchEmployees.map((employee) => {
                const profileStatus = getEmployeeProfileStatus(employee)
                const { stats, payroll, attendance } = rowMetrics(employee)
                const accountLocked = isEmployeeAccountLocked(employee.id)
                return (
                  <tr
                    key={employee.id}
                    className={selectedEmployeeId === employee.id ? 'is-selected' : ''}
                    onClick={() => setSelectedEmployeeId(employee.id)}
                  >
                    <td>
                      <button type="button" className="admin-branches__link" onClick={() => setSelectedEmployeeId(employee.id)}>
                        {employee.name}
                      </button>
                      {accountLocked && <span className="admin-branches__badge admin-branches__badge--danger">TK khóa</span>}
                    </td>
                    <td>{employee.phone || '—'}</td>
                    <td>{employee.position || '—'}</td>
                    <td>{getStatusLabel(employee.status)}</td>
                    <td>
                      <span className={`admin-branches__badge admin-branches__badge--${PROFILE_BADGE_TONE[profileStatus.key]}`}>
                        {profileStatus.label}
                      </span>
                    </td>
                    <td>{formatCurrency(stats.serviceRevenue ?? 0)}</td>
                    <td>{formatCurrency(stats.tips ?? 0)}</td>
                    <td>{formatCurrency(stats.serviceCommission ?? 0)}</td>
                    <td>{formatCurrency(payroll.netSalary ?? 0)}</td>
                    <td>{attendance.workDays ?? 0} ngày</td>
                    {!readOnly && isAdmin() && (
                      <td className="admin-branches__actions-cell" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => openEdit(employee)}>Sửa</button>
                        <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => openTransfer(employee)}>Chuyển</button>
                        <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => handleToggleAccountLock(employee)}>
                          {accountLocked ? 'Mở TK' : 'Khóa TK'}
                        </button>
                        <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => openPassword(employee)}>Reset MK</button>
                        <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => handleLockStatus(employee)}>
                          {employee.status === EMPLOYEE_STATUS.ON_LEAVE ? 'Mở NV' : 'Khóa NV'}
                        </button>
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

      {selectedEmployee && (
        <div className="admin-branches__employee-detail">
          <div className="admin-branches__employee-detail-head">
            <h4>{selectedEmployee.name}</h4>
            <button type="button" className="admin-branches__btn admin-branches__btn--small" onClick={() => setSelectedEmployeeId('')}>Đóng</button>
          </div>
          <EmployeeHubDetail
            employee={selectedEmployee}
            invoices={invoices}
            month={month}
            onEdit={() => openEdit(selectedEmployee)}
            variant="branch"
            attendanceRecords={attendanceRecords}
          />
        </div>
      )}

      {(modal?.mode === 'add' || modal?.mode === 'edit') && (
        <div className="admin-branches__modal-backdrop" onClick={closeModal}>
          <div className="admin-branches__modal admin-branches__modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-branches__modal-title">
              {modal.mode === 'add' ? 'Thêm nhân viên' : `Sửa hồ sơ — ${hubEmployees.find((e) => e.id === modal.id)?.name ?? ''}`}
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
            <h3 className="admin-branches__modal-title">Chuyển chi nhánh — {hubEmployees.find((e) => e.id === modal.id)?.name}</h3>
            <label className="admin-branches__field">
              <span>Chi nhánh đích</span>
              <select value={modal.targetBranchId} onChange={(e) => setModal({ ...modal, targetBranchId: e.target.value })}>
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
            <h3 className="admin-branches__modal-title">Reset mật khẩu — {hubEmployees.find((e) => e.id === modal.id)?.name}</h3>
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
    </div>
  )
}
