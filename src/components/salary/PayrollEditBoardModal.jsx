import { useEffect, useMemo, useState } from 'react'
import {
  PAYROLL_ADJUSTMENT_LABELS,
  PAYROLL_ADJUSTMENT_TYPES,
  normalizePayrollAdjustmentAmount,
} from '../../constants/payrollTypes'
import { formatCurrency } from '../../utils/invoice'
import { netSalaryImpactForFieldSet } from '../../utils/payrollFieldAudit'

const BOARD_FIELDS = [
  PAYROLL_ADJUSTMENT_TYPES.BONUS,
  PAYROLL_ADJUSTMENT_TYPES.KPI,
  PAYROLL_ADJUSTMENT_TYPES.PENALTY,
  PAYROLL_ADJUSTMENT_TYPES.ADVANCE,
]

/** Map type chỉnh sửa → đúng field đang render trên bảng lương (payrollRow). */
const BOARD_FIELD_TO_ROW_KEY = {
  [PAYROLL_ADJUSTMENT_TYPES.BONUS]: 'bonus',
  [PAYROLL_ADJUSTMENT_TYPES.KPI]: 'kpi',
  [PAYROLL_ADJUSTMENT_TYPES.PENALTY]: 'penalty',
  [PAYROLL_ADJUSTMENT_TYPES.ADVANCE]: 'advance',
}

function parseFieldInput(type, raw) {
  const cleaned = String(raw ?? '').replace(/[^\d+-]/g, '')
  if (cleaned === '' || cleaned === '+' || cleaned === '-') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return normalizePayrollAdjustmentAmount(type, value)
}

/**
 * Bind 100% từ object payrollRow đang hiển thị — không cộng adjustments, không snapshot khác.
 */
export function currentTotalsFromPayrollRow(payrollRow) {
  if (!payrollRow) return null
  const totals = {}
  for (const type of BOARD_FIELDS) {
    const key = BOARD_FIELD_TO_ROW_KEY[type]
    totals[type] = Number(payrollRow[key] ?? 0)
  }
  return totals
}

/**
 * Popup Admin — sửa GIÁ TRỊ TỔNG từng hạng mục (SET, không cộng dồn dòng).
 * Cột "Hiện tại" = đúng số đang render trên bảng lương (payrollRow).
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
  adjustments = [],
  locks = null,
  saving = false,
}) {
  const [draft, setDraft] = useState({})
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const currentTotals = useMemo(
    () => currentTotalsFromPayrollRow(payrollRow),
    [payrollRow],
  )

  useEffect(() => {
    if (!open || !payrollRow || !currentTotals) return
    const next = {}
    for (const type of BOARD_FIELDS) {
      next[type] = String(currentTotals[type] ?? 0)
    }
    setDraft(next)
    setNote('')
    setReason('')
    setError('')
  }, [open, payrollRow, currentTotals])

  const parsedDraft = useMemo(() => {
    const out = {}
    for (const type of BOARD_FIELDS) {
      out[type] = parseFieldInput(type, draft[type])
    }
    return out
  }, [draft])

  const preview = useMemo(() => {
    if (!open || !payrollRow || !currentTotals) return null
    const oldNet = Number(payrollRow.netSalary ?? 0)
    let diff = 0
    for (const type of BOARD_FIELDS) {
      const next = parsedDraft[type]
      if (next === null) continue
      diff += netSalaryImpactForFieldSet(type, currentTotals[type] ?? 0, next)
    }
    return { oldNet, newNet: oldNet + diff, diff }
  }, [open, payrollRow, currentTotals, parsedDraft])

  if (!open) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!reason.trim()) {
      setError('Lý do chỉnh sửa là bắt buộc.')
      return
    }
    const totals = {}
    for (const type of BOARD_FIELDS) {
      const amount = parsedDraft[type]
      if (amount === null) {
        setError(`Số tiền không hợp lệ (${PAYROLL_ADJUSTMENT_LABELS[type]}).`)
        return
      }
      totals[type] = amount
    }
    try {
      await onSave({
        reason: reason.trim(),
        note: note.trim(),
        totals,
        displayedTotals: currentTotals,
        attendancePenalty: Number(payrollRow.attendancePenalty ?? 0),
        employeeId: payrollRow.employeeId,
        employeeName: payrollRow.employeeName,
        branchId: payrollRow.branchId || employee?.branchId || '',
        month,
        cycle,
        fromDate,
        toDate,
        locks,
        existingAdjustments: adjustments,
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
          Chỉ Admin. Nhập <strong>giá trị tổng</strong> cuối cùng của từng hạng mục trong kỳ
          (không cộng dồn thêm dòng). Nhân viên: <strong>{payrollRow?.employeeName}</strong>
        </p>

        <div className="salary-edit-totals" role="table" aria-label="Sửa giá trị tổng">
          <div className="salary-edit-totals__head" role="row">
            <span role="columnheader">Hạng mục</span>
            <span role="columnheader">Hiện tại</span>
            <span role="columnheader">Mới</span>
          </div>
          {BOARD_FIELDS.map((type) => {
            const current = currentTotals?.[type] ?? 0
            const next = parsedDraft[type]
            const impact = next === null
              ? null
              : netSalaryImpactForFieldSet(type, current, next)
            return (
              <div key={type} className="salary-edit-totals__row" role="row">
                <span role="cell">
                  <strong>{PAYROLL_ADJUSTMENT_LABELS[type]}</strong>
                  {impact !== null && impact !== 0 && (
                    <small className={impact >= 0 ? 'is-plus' : 'is-minus'}>
                      {impact >= 0 ? '+' : ''}{formatCurrency(impact)} thực nhận
                    </small>
                  )}
                </span>
                <span role="cell" data-testid={`edit-current-${type}`}>{formatCurrency(current)}</span>
                <label role="cell">
                  <span className="salary-edit-totals__sr">Giá trị mới {PAYROLL_ADJUSTMENT_LABELS[type]}</span>
                  <input
                    required
                    inputMode="text"
                    value={draft[type] ?? ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [type]: e.target.value }))}
                    placeholder={
                      type === PAYROLL_ADJUSTMENT_TYPES.KPI
                        ? '+/- hoặc 0'
                        : 'VD: 200000'
                    }
                  />
                </label>
              </div>
            )
          })}
        </div>

        <label>
          Ghi chú
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú thêm (không bắt buộc)"
          />
        </label>

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
          <button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
        </footer>
      </form>
    </div>
  )
}
