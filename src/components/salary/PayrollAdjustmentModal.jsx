import { useState } from 'react'
import {
  MANUAL_ADJUSTMENT_OPTIONS,
  PAYROLL_ADJUSTMENT_LABELS,
  PAYROLL_ADJUSTMENT_TYPES,
  PAYROLL_PENALTY_CATEGORIES,
  PAYROLL_PENALTY_CATEGORY_LABELS,
} from '../../constants/payrollTypes'
import { isAdmin } from '../../constants/auth'
import {
  ATTENDANCE_PENALTY_READONLY_HINT,
  assertManualPenaltyNotAttendanceMirror,
} from '../../utils/payrollPenaltyPolicy'

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
    category: PAYROLL_PENALTY_CATEGORIES.OTHER,
  })
  const [error, setError] = useState('')

  if (!open) return null

  const adjustmentTypes = MANUAL_ADJUSTMENT_OPTIONS.filter((type) => {
    if (type === PAYROLL_ADJUSTMENT_TYPES.ADVANCE && !isAdmin()) return false
    if (type === PAYROLL_ADJUSTMENT_TYPES.KPI && !isAdmin()) return false
    return true
  })

  const selectedEmployee = employees.find((emp) => emp.id === form.employeeId)
  const isPenalty = form.type === PAYROLL_ADJUSTMENT_TYPES.PENALTY

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    const amount = Number(String(form.amount).replace(/\D/g, ''))
    if (!form.employeeId || !amount || !form.reason.trim()) return

    if (isPenalty) {
      const gate = assertManualPenaltyNotAttendanceMirror({
        type: form.type,
        reason: form.reason,
        note: form.note,
        category: form.category,
      })
      if (gate.blocked) {
        setError(gate.message)
        return
      }
    }

    try {
      await onSubmit({
        ...form,
        amount,
        branchId: selectedEmployee?.branchId ?? defaultBranchId,
        employeeName: selectedEmployee?.name ?? '',
        month: defaultMonth,
        category: isPenalty ? form.category : undefined,
        source: 'manual',
      })
      onClose()
    } catch (err) {
      setError(err?.message || 'Không thể lưu khoản phát sinh.')
    }
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

        {isPenalty && (
          <>
            <p className="salary-board-edit__penalty-hint" data-testid="manual-penalty-hint">
              {ATTENDANCE_PENALTY_READONLY_HINT}
            </p>
            <label>
              Nhóm phạt khác
              <select
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                data-testid="penalty-category"
              >
                {Object.entries(PAYROLL_PENALTY_CATEGORY_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
          </>
        )}

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
            placeholder={isPenalty ? 'VD: Phạt lúc làm khách' : ''}
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

        {error && <p className="salary-page__error" data-testid="penalty-block-error">{error}</p>}

        <footer>
          <button type="button" onClick={onClose}>Huỷ</button>
          <button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        </footer>
      </form>
    </div>
  )
}
