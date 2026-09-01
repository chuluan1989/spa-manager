import { useMemo, useState } from 'react'
import {
  PAYROLL_ADJUSTMENT_TYPES,
  PAYROLL_PENALTY_CATEGORIES,
  PAYROLL_PENALTY_CATEGORY_LABELS,
} from '../../constants/payrollTypes'
import { formatCurrency } from '../../utils/invoice'
import {
  defaultPayrollLineDate,
  formatPayrollLineDate,
  isVoidedPayrollAdjustment,
  sumAdjustmentAmounts,
} from '../../utils/payrollBoardLines'
import {
  ATTENDANCE_PENALTY_READONLY_HINT,
  assertManualPenaltyNotAttendanceMirror,
} from '../../utils/payrollPenaltyPolicy'

function parseMoneyInput(raw) {
  const cleaned = String(raw ?? '').replace(/[^\d]/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

export default function PayrollBoardLineSection({
  type,
  title,
  currentLabel,
  addLabel,
  lines = [],
  fromDate = '',
  toDate = '',
  saving = false,
  onAdd,
  onEdit,
  onVoid,
  onDelete,
}) {
  const isPenalty = type === PAYROLL_ADJUSTMENT_TYPES.PENALTY
  const currentTotal = sumAdjustmentAmounts(lines)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState(() => ({
    date: defaultPayrollLineDate(fromDate, toDate),
    amount: '',
    reason: '',
    category: PAYROLL_PENALTY_CATEGORIES.OTHER,
  }))

  const dateBounds = useMemo(() => ({ min: fromDate || undefined, max: toDate || undefined }), [fromDate, toDate])

  const resetForm = () => {
    setForm({
      date: defaultPayrollLineDate(fromDate, toDate),
      amount: '',
      reason: '',
      category: PAYROLL_PENALTY_CATEGORIES.OTHER,
    })
    setError('')
  }

  const validateForm = (values) => {
    const amount = parseMoneyInput(values.amount)
    if (!values.date) return 'Ngày là bắt buộc.'
    if (fromDate && values.date < fromDate) return 'Ngày phải nằm trong kỳ lương.'
    if (toDate && values.date > toDate) return 'Ngày phải nằm trong kỳ lương.'
    if (amount == null) return 'Số tiền phải lớn hơn 0.'
    if (!String(values.reason || '').trim()) return 'Lý do là bắt buộc.'
    if (isPenalty) {
      const gate = assertManualPenaltyNotAttendanceMirror({
        type,
        reason: values.reason,
        note: '',
        category: values.category,
      })
      if (gate.blocked) return gate.message
    }
    return ''
  }

  const handleAdd = async (event) => {
    event.preventDefault()
    const message = validateForm(form)
    if (message) {
      setError(message)
      return
    }
    setError('')
    try {
      await onAdd({
        type,
        date: form.date,
        amount: parseMoneyInput(form.amount),
        reason: form.reason.trim(),
        category: isPenalty ? form.category : undefined,
      })
      setAdding(false)
      resetForm()
    } catch (err) {
      setError(err?.message || 'Không thể thêm phát sinh.')
    }
  }

  const handleSaveEdit = async (event, row) => {
    event.preventDefault()
    const message = validateForm(form)
    if (message) {
      setError(message)
      return
    }
    setError('')
    try {
      await onEdit(row, {
        date: form.date,
        amount: parseMoneyInput(form.amount),
        reason: form.reason.trim(),
        category: isPenalty ? form.category : row.category,
      })
      setEditingId('')
      resetForm()
    } catch (err) {
      setError(err?.message || 'Không thể sửa phát sinh.')
    }
  }

  const startEdit = (row) => {
    setAdding(false)
    setEditingId(row.id)
    setError('')
    setForm({
      date: row.date || defaultPayrollLineDate(fromDate, toDate),
      amount: String(row.amount ?? ''),
      reason: row.reason || '',
      category: row.category || PAYROLL_PENALTY_CATEGORIES.OTHER,
    })
  }

  const handleVoid = async (row) => {
    const why = window.prompt(
      `Lý do hủy khoản ${formatPayrollLineDate(row.date)} · ${formatCurrency(row.amount)}:`,
    )
    if (!why?.trim()) return
    setError('')
    try {
      await onVoid(row, why.trim())
    } catch (err) {
      setError(err?.message || 'Không thể hủy khoản.')
    }
  }

  const handleDelete = async (row) => {
    if (!window.confirm(
      `Xóa phát sinh ${formatPayrollLineDate(row.date)} · ${formatCurrency(row.amount)}? Tổng kỳ sẽ giảm.`,
    )) return
    const why = window.prompt('Lý do xóa:') || 'Xóa phát sinh'
    setError('')
    try {
      await onDelete(row, why.trim())
    } catch (err) {
      setError(err?.message || 'Không thể xóa phát sinh.')
    }
  }

  return (
    <section className="salary-board-lines" data-testid={`board-lines-${type}`}>
      <header className="salary-board-lines__head">
        <h5>{title}</h5>
        <p data-testid={`edit-current-${type}`}>
          {currentLabel}: <strong>{formatCurrency(currentTotal)}</strong>
        </p>
      </header>

      {isPenalty && (
        <p className="salary-board-edit__penalty-hint">{ATTENDANCE_PENALTY_READONLY_HINT}</p>
      )}

      <ul className="salary-board-lines__list">
        {lines.length === 0 && (
          <li className="salary-board-lines__empty">Chưa có phát sinh trong kỳ.</li>
        )}
        {lines.map((row) => {
          const voided = isVoidedPayrollAdjustment(row)
          if (editingId === row.id) {
            return (
              <li key={row.id} className="salary-board-lines__item is-editing">
                {renderLineForm({
                  form,
                  setForm,
                  dateBounds,
                  isPenalty,
                  saving,
                  submitLabel: 'Lưu dòng',
                  onSubmit: (event) => handleSaveEdit(event, row),
                  onCancel: () => {
                    setEditingId('')
                    resetForm()
                  },
                })}
              </li>
            )
          }
          return (
            <li
              key={row.id}
              className={`salary-board-lines__item${voided ? ' is-voided' : ''}`}
              data-testid={`${type}-line-${row.id}`}
            >
              <div>
                <strong>{formatPayrollLineDate(row.date)}</strong>
                <span>{formatCurrency(row.amount)}</span>
                {row.reason ? <em>{row.reason}</em> : null}
                {voided ? <span className="salary-board-lines__badge">Đã hủy</span> : null}
                {row.createdByName ? (
                  <small>Người tạo: {row.createdByName}</small>
                ) : null}
              </div>
              <div className="salary-board-lines__actions">
                {!voided && (
                  <>
                    <button type="button" disabled={saving} onClick={() => startEdit(row)}>Sửa</button>
                    <button type="button" disabled={saving} onClick={() => handleVoid(row)}>Hủy khoản</button>
                  </>
                )}
                <button type="button" disabled={saving} onClick={() => handleDelete(row)}>Xóa</button>
              </div>
            </li>
          )
        })}
      </ul>

      {adding ? (
        renderLineForm({
          form,
          setForm,
          dateBounds,
          isPenalty,
          saving,
          submitLabel: addLabel.replace(/^\+\s*/, '') || 'Thêm',
          onSubmit: handleAdd,
          onCancel: () => {
            setAdding(false)
            resetForm()
          },
        })
      ) : (
        <button
          type="button"
          className="salary-board-lines__add"
          data-testid={type === PAYROLL_ADJUSTMENT_TYPES.ADVANCE ? 'add-advance-btn' : 'add-penalty-btn'}
          disabled={saving}
          onClick={() => {
            setEditingId('')
            setAdding(true)
            resetForm()
          }}
        >
          {addLabel}
        </button>
      )}

      {error && <p className="salary-page__error" data-testid={`${type}-line-error`}>{error}</p>}
    </section>
  )
}

function renderLineForm({
  form,
  setForm,
  dateBounds,
  isPenalty,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}) {
  return (
    <form className="salary-board-lines__form" onSubmit={(event) => {
      event.preventDefault()
      event.stopPropagation()
      onSubmit(event)
    }}>
      {isPenalty && (
        <label>
          Nhóm phạt khác
          <select
            required
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            data-testid="penalty-line-category"
          >
            {Object.entries(PAYROLL_PENALTY_CATEGORY_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        Ngày
        <input
          type="date"
          required
          min={dateBounds.min}
          max={dateBounds.max}
          value={form.date}
          onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
        />
      </label>
      <label>
        Số tiền
        <input
          required
          inputMode="numeric"
          placeholder="VD: 1000000"
          value={form.amount}
          onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
        />
      </label>
      <label>
        Lý do
        <input
          required
          value={form.reason}
          onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
          placeholder={isPenalty ? 'VD: Phạt lúc làm khách' : 'VD: Ứng lương kỳ này'}
        />
      </label>
      <div className="salary-board-lines__form-actions">
        <button type="button" onClick={onCancel}>Hủy</button>
        <button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : submitLabel}</button>
      </div>
    </form>
  )
}
