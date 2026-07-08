import { useState } from 'react'
import { ATTENDANCE_STATUS_OPTIONS } from '../../constants/attendanceTypes'
import { canEditAttendance, getCurrentUserEmployeeId, getCurrentUserName, isAdmin } from '../../constants/auth'
import { adminCreateAttendance } from '../../utils/attendanceService'

export default function AttendanceCreateModal({ employees, defaultBranchId = '', defaultDate = '', onClose, onSaved }) {
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [status, setStatus] = useState(ATTENDANCE_STATUS_OPTIONS[0].id)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedEmployee = employees.find((employee) => employee.id === employeeId)
  const canCreate = canEditAttendance(selectedEmployee?.branchId ?? defaultBranchId)

  const handleSave = async () => {
    if (!canCreate || !selectedEmployee || !date) return
    setSaving(true)
    setError('')
    try {
      await adminCreateAttendance({
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        branchId: selectedEmployee.branchId,
        date,
        status,
        reason,
        note,
        editor: {
          editorId: isAdmin() ? 'admin' : getCurrentUserEmployeeId(),
          editorName: getCurrentUserName(),
        },
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
            <span>Ngày</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            <span>Trạng thái</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Lý do</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label>
            <span>Ghi chú</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </label>
          {error && <p className="attendance-page__error">{error}</p>}
        </div>

        <footer className="attendance-edit-modal__footer">
          <button type="button" onClick={onClose}>Huỷ</button>
          <button type="button" disabled={!canCreate || !employeeId || !date || saving} onClick={handleSave}>
            {saving ? 'Đang lưu...' : 'Lưu chấm công'}
          </button>
        </footer>
      </div>
    </div>
  )
}
