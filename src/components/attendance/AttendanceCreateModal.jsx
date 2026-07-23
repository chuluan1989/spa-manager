import { useEffect, useState } from 'react'
import { getEditableAttendanceStatusOptions } from '../../constants/attendanceTypes'
import { canEditAttendance, getAttendanceEditor, isBranchManager } from '../../constants/auth'
import { fetchAttendanceByEmployeeAndDate } from '../../repositories/attendanceRepository'
import {
  canEditAttendanceRecord,
  getAttendanceMonthBounds,
  getCurrentAttendanceMonth,
} from '../../utils/attendanceEditPolicy'
import { adminCreateAttendance } from '../../utils/attendanceService'

const STATUS_OPTIONS = getEditableAttendanceStatusOptions()
const MANAGER_CREATE_HINT = 'Bổ sung bản ghi còn thiếu khi nhân viên quên chấm công hoặc cần ghi nhận lại sau khi xác minh. Chỉ áp dụng tháng hiện tại.'
const CURRENT_MONTH_BOUNDS = getAttendanceMonthBounds()

function combineDateAndTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return ''
  const parsed = new Date(`${dateValue}T${timeValue}:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

export default function AttendanceCreateModal({
  employees,
  defaultBranchId = '',
  defaultDate = '',
  payrollLocks = [],
  onClose,
  onSaved,
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [status, setStatus] = useState(STATUS_OPTIONS[0]?.id ?? '')
  const [checkInTime, setCheckInTime] = useState('08:00')
  const [checkOutTime, setCheckOutTime] = useState('17:00')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [editReason, setEditReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState('')

  const selectedEmployee = employees.find((employee) => employee.id === employeeId)
  const canCreate = selectedEmployee
    ? canEditAttendanceRecord(selectedEmployee.branchId, date, { locks: payrollLocks })
    : canEditAttendance(defaultBranchId)
  const monthLocked = isBranchManager()
    && !canEditAttendanceRecord(defaultBranchId, `${getCurrentAttendanceMonth()}-01`, { locks: payrollLocks })
    && canEditAttendance(defaultBranchId)

  useEffect(() => {
    let cancelled = false
    if (!employeeId || !date) {
      setDuplicateWarning('')
      return undefined
    }
    fetchAttendanceByEmployeeAndDate(employeeId, date)
      .then((existing) => {
        if (cancelled) return
        setDuplicateWarning(
          existing
            ? 'Nhân viên đã có bản ghi chấm công trong ngày này. Không được tạo trùng.'
            : '',
        )
      })
      .catch(() => {
        if (!cancelled) setDuplicateWarning('')
      })
    return () => {
      cancelled = true
    }
  }, [employeeId, date])

  const handleSave = async () => {
    if (!canCreate || !selectedEmployee || !date || duplicateWarning) return
    if (!editReason.trim()) {
      setError('Vui lòng nhập lý do bổ sung chấm công.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const submittedAt = combineDateAndTime(date, checkInTime)
      const updatedAt = combineDateAndTime(date, checkOutTime) || submittedAt
      await adminCreateAttendance({
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        branchId: selectedEmployee.branchId,
        date,
        status,
        reason,
        note,
        editNote: editReason.trim(),
        submittedAt,
        updatedAt,
        editor: getAttendanceEditor(),
      })
      onSaved?.()
      onClose?.()
    } catch (err) {
      setError(err?.message ?? 'Không thể tạo chấm công.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="attendance-edit-modal" role="dialog" aria-modal="true">
      <button type="button" className="attendance-edit-modal__backdrop" onClick={onClose} aria-label="Đóng" />
      <div className="attendance-edit-modal__panel">
        <header>
          <h3>Thêm chấm công</h3>
          {isBranchManager() && (
            <p className="attendance-edit-modal__hint">{MANAGER_CREATE_HINT}</p>
          )}
          <button type="button" className="attendance-edit-modal__close" onClick={onClose}>×</button>
        </header>

        <div className="attendance-edit-modal__body">
          <label>
            <span>Nhân viên</span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Chọn nhân viên</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Ngày chấm công</span>
            <input
              type="date"
              value={date}
              min={isBranchManager() ? CURRENT_MONTH_BOUNDS.fromDate : undefined}
              max={isBranchManager() ? CURRENT_MONTH_BOUNDS.toDate : undefined}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            <span>Trạng thái</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="attendance-edit-modal__time-row">
            <label>
              <span>Giờ vào</span>
              <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
            </label>
            <label>
              <span>Giờ ra</span>
              <input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} />
            </label>
          </div>
          {monthLocked && (
            <p className="attendance-page__error" role="alert">
              Tháng lương hiện tại đã chốt. Chỉ Admin được bổ sung chấm công.
            </p>
          )}
          {duplicateWarning && <p className="attendance-page__error">{duplicateWarning}</p>}
          <label>
            <span>Lý do chấm công</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label>
            <span>Ghi chú</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </label>
          <label>
            <span>Lý do bổ sung chấm công *</span>
            <textarea
              rows={2}
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Bắt buộc — ghi rõ vì sao bổ sung (quên chấm, cần ghi nhận lại...)"
            />
          </label>
          {error && <p className="attendance-page__error">{error}</p>}
        </div>

        <footer className="attendance-edit-modal__footer">
          <button type="button" onClick={onClose}>Huỷ</button>
          <button
            type="button"
            disabled={!canCreate || !employeeId || !date || saving || duplicateWarning || !editReason.trim() || monthLocked}
            onClick={handleSave}
          >
            {saving ? 'Đang lưu...' : 'Lưu chấm công'}
          </button>
        </footer>
      </div>
    </div>
  )
}
