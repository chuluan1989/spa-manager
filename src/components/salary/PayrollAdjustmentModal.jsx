import { useState } from 'react'
import { MANUAL_ADJUSTMENT_OPTIONS, PAYROLL_ADJUSTMENT_LABELS, PAYROLL_ADJUSTMENT_TYPES } from '../../constants/payrollTypes'
import { isAdmin } from '../../constants/auth'

export default function PayrollAdjustmentModal({
  open,
  onClose,
  onSubmit,
  employees,
  defaultMonth,
  defaultEmployeeId = '',
  defaultBranchId = '',
  saving = false,
}) {
  const [form, setForm] = useState({
    employeeId: defaultEmployeeId,
    type: MANUAL_ADJUSTMENT_OPTIONS[0],
    date: `${defaultMonth}-01`,
    amount: '',
    reason: '',
    note: '',
  })

  if (!open) return null

  const adjustmentTypes = MANUAL_ADJUSTMENT_OPTIONS.filter((type) => {
    if (type === PAYROLL_ADJUSTMENT_TYPES.ADVANCE && !isAdmin()) return false
    return true
  })

  const selectedEmployee = employees.find((emp) => emp.id === form.employeeId)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const amount = Number(String(form.amount).replace(/\D/g, ''))
    if (!form.employeeId || !amount || !form.reason.trim()) return
    await onSubmit({
      ...form,
      amount,
      branchId: selectedEmployee?.branchId ?? defaultBranchId,
      employeeName: selectedEmployee?.name ?? '',
      month: defaultMonth,
    })
    onClose()
  }

  return (
    <div className="salary-modal" role="dialog" aria-modal="true">
      <div className="salary-modal__backdrop" onClick={onClose} />
      <form className="salary-modal__panel" onSubmit={handleSubmit}>
        <header>
          <h3>Thêm khoản phát sinh</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>

        <label>
          Nhân viên
          <select
            required
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
          >
            <option value="">— Chọn —</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </label>

        <label>
          Loại
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {adjustmentTypes.map((type) => (
              <option key={type} value={type}>{PAYROLL_ADJUSTMENT_LABELS[type]}</option>
            ))}
          </select>
        </label>

        <label>
          Ngày
          <input
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </label>

        <label>
          Số tiền
          <input
            required
            inputMode="numeric"
            placeholder="VD: 500000"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </label>

        <label>
          Lý do
          <input
            required
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </label>

        <label>
          Ghi chú
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </label>

        <footer>
          <button type="button" onClick={onClose}>Huỷ</button>
          <button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        </footer>
      </form>
    </div>
  )
}
