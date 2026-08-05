import { useEffect, useMemo, useState } from 'react'
import {
  ADMIN_EDITABLE_ADJUSTMENT_TYPES,
  PAYROLL_ADJUSTMENT_LABELS,
  PAYROLL_ADJUSTMENT_TYPES,
  normalizePayrollAdjustmentAmount,
} from '../../constants/payrollTypes'
import { formatCurrency } from '../../utils/invoice'
import { computeEmployeePayrollRow } from '../../utils/payrollEngine'

function parseAmountInput(type, raw) {
  const cleaned = String(raw ?? '').replace(/[^\d+-]/g, '')
  if (!cleaned || cleaned === '+' || cleaned === '-') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return normalizePayrollAdjustmentAmount(type, value)
}

function buildDraftLines(adjustments, employeeId, fromDate, toDate) {
  return (adjustments ?? [])
    .filter((row) => {
      if (row.employeeId !== employeeId) return false
      if (!ADMIN_EDITABLE_ADJUSTMENT_TYPES.includes(row.type)) return false
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      return true
    })
    .map((row) => ({
      key: row.id,
      id: row.id,
      type: row.type,
      amount: String(row.amount ?? 0),
      note: row.note || '',
      date: row.date,
      _original: row,
    }))
}

/**
 * Popup Admin — Sửa bảng lương (KPI / Thưởng / Phạt / Ứng / Điều chỉnh khác).
 * Bắt buộc lý do. Preview lương cũ → mới → chênh lệch trước khi lưu.
 */
export default function PayrollEditBoardModal({
  open,
  onClose,
  onSave,
  employee,
  payrollRow,
  month,
  cycle,
  fromDate,
  toDate,
  invoices = [],
  attendance = [],
  adjustments = [],
  locks = null,
  saving = false,
}) {
  const [lines, setLines] = useState([])
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !payrollRow) return
    setLines(buildDraftLines(adjustments, payrollRow.employeeId, fromDate, toDate))
    setReason('')
    setError('')
  }, [open, payrollRow, adjustments, fromDate, toDate])

  const employeeStub = useMemo(() => {
    if (!payrollRow) return null
    return {
      id: payrollRow.employeeId,
      name: payrollRow.employeeName,
      branchId: payrollRow.branchId,
      salaryRate: employee?.salaryRate,
      position: employee?.position,
      avatar: employee?.avatar,
    }
  }, [payrollRow, employee])

  const preview = useMemo(() => {
    if (!open || !payrollRow || !employeeStub) return null
    const keptOthers = (adjustments ?? []).filter((row) => {
      if (row.employeeId !== payrollRow.employeeId) return true
      if (!ADMIN_EDITABLE_ADJUSTMENT_TYPES.includes(row.type)) return true
      if (fromDate && row.date < fromDate) return true
      if (toDate && row.date > toDate) return true
      // editable lines in period are replaced by draft lines below
      return false
    })
    const draftRecords = lines.map((line, index) => {
      const amount = parseAmountInput(line.type, line.amount)
      return {
        id: line.id || `__draft-${index}`,
        date: line.date || toDate || `${month}-15`,
        month,
        branchId: payrollRow.branchId || '',
        employeeId: payrollRow.employeeId,
        employeeName: payrollRow.employeeName,
        type: line.type,
        amount: amount ?? 0,
        reason: reason || 'Sửa bảng lương',
        note: line.note || '',
        payrollCycle: cycle || '',
      }
    }).filter((row) => row.amount !== 0 || row.id && !String(row.id).startsWith('__draft'))

    const nextRow = computeEmployeePayrollRow(
      employeeStub,
      invoices,
      attendance,
      [...keptOthers, ...draftRecords],
    )
    const oldNet = Number(payrollRow.netSalary ?? 0)
    const newNet = Number(nextRow.netSalary ?? 0)
    return { oldNet, newNet, diff: newNet - oldNet }
  }, [open, payrollRow, employeeStub, lines, reason, adjustments, fromDate, toDate, month, cycle, invoices, attendance])

  if (!open) return null

  const updateLine = (key, patch) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        id: '',
        type: PAYROLL_ADJUSTMENT_TYPES.BONUS,
        amount: '',
        note: '',
        date: toDate || `${month}-15`,
        _original: null,
      },
    ])
  }

  const removeLine = (key) => {
    setLines((prev) => prev.filter((line) => line.key !== key))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!reason.trim()) {
      setError('Lý do chỉnh sửa là bắt buộc.')
      return
    }

    const parsed = []
    for (const line of lines) {
      const amount = parseAmountInput(line.type, line.amount)
      if (amount === null) {
        setError(`Số tiền không hợp lệ (${PAYROLL_ADJUSTMENT_LABELS[line.type]}).`)
        return
      }
      parsed.push({
        id: line.id || '',
        type: line.type,
        amount,
        note: line.note.trim(),
        date: line.date || toDate || `${month}-15`,
        original: line._original,
      })
    }

    try {
      await onSave({
        reason: reason.trim(),
        lines: parsed,
        employeeId: payrollRow.employeeId,
        employeeName: payrollRow.employeeName,
        branchId: payrollRow.branchId || employee?.branchId || '',
        month,
        cycle,
        fromDate,
        toDate,
        locks,
        existing: buildDraftLines(adjustments, payrollRow.employeeId, fromDate, toDate).map((l) => l._original),
      })
      onClose()
    } catch (err) {
      setError(err?.message || 'Không thể lưu chỉnh sửa.')
    }
  }

  return (
    <div className="salary-modal" role="dialog" aria-modal="true" aria-labelledby="payroll-edit-title">
      <div className="salary-modal__backdrop" onClick={onClose} />
      <form className="salary-modal__panel salary-modal__panel--wide" onSubmit={handleSubmit}>
        <header>
          <h3 id="payroll-edit-title">Sửa bảng lương</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>

        <p className="salary-modal__hint">
          Chỉ Admin. Sửa KPI / Thưởng / Phạt / Ứng lương / Điều chỉnh khác.
          Nhân viên: <strong>{payrollRow?.employeeName}</strong>
        </p>

        <div className="salary-edit-lines">
          {lines.length === 0 && (
            <p className="salary-page__empty">Chưa có khoản chỉnh trong kỳ — thêm dòng mới.</p>
          )}
          {lines.map((line) => (
            <div key={line.key} className="salary-edit-lines__row">
              <label>
                Loại
                <select
                  value={line.type}
                  onChange={(e) => updateLine(line.key, { type: e.target.value })}
                >
                  {ADMIN_EDITABLE_ADJUSTMENT_TYPES.map((type) => (
                    <option key={type} value={type}>{PAYROLL_ADJUSTMENT_LABELS[type]}</option>
                  ))}
                </select>
              </label>
              <label>
                Số tiền
                <input
                  required
                  inputMode="text"
                  value={line.amount}
                  onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                  placeholder={line.type === PAYROLL_ADJUSTMENT_TYPES.KPI ? '+/-' : 'VD: 100000'}
                />
              </label>
              <label>
                Ghi chú
                <input
                  value={line.note}
                  onChange={(e) => updateLine(line.key, { note: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="salary-edit-lines__remove"
                onClick={() => {
                  if (line.id) updateLine(line.key, { amount: '0' })
                  else removeLine(line.key)
                }}
              >
                {line.id ? 'Về 0' : 'Bỏ'}
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="salary-page__btn" onClick={addLine}>
          + Thêm dòng
        </button>

        <label>
          Lý do chỉnh sửa (bắt buộc)
          <textarea
            required
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ghi rõ lý do — bắt buộc để audit"
          />
        </label>

        {preview && (
          <div className="salary-modal__preview" role="status">
            <div><span>Lương cũ</span><strong>{formatCurrency(preview.oldNet)}</strong></div>
            <div><span>Lương mới</span><strong>{formatCurrency(preview.newNet)}</strong></div>
            <div>
              <span>Chênh lệch</span>
              <strong className={preview.diff >= 0 ? 'is-plus' : 'is-minus'}>
                {preview.diff >= 0 ? '+' : ''}{formatCurrency(preview.diff)}
              </strong>
            </div>
          </div>
        )}

        {error && <p className="salary-page__error">{error}</p>}

        <footer>
          <button type="button" onClick={onClose}>Huỷ</button>
          <button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu chỉnh sửa'}</button>
        </footer>
      </form>
    </div>
  )
}
