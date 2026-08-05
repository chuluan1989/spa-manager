import { useEffect, useMemo, useState } from 'react'
import {
  ADMIN_EDITABLE_ADJUSTMENT_TYPES,
  PAYROLL_ADJUSTMENT_LABELS,
  PAYROLL_ADJUSTMENT_TYPES,
  normalizePayrollAdjustmentAmount,
} from '../../constants/payrollTypes'
import { formatCurrency } from '../../utils/invoice'
import { computeEmployeePayrollRow } from '../../utils/payrollEngine'
import { netSalaryImpactForFieldSet } from '../../utils/payrollFieldAudit'

const BOARD_FIELDS = [
  PAYROLL_ADJUSTMENT_TYPES.BONUS,
  PAYROLL_ADJUSTMENT_TYPES.KPI,
  PAYROLL_ADJUSTMENT_TYPES.PENALTY,
  PAYROLL_ADJUSTMENT_TYPES.ADVANCE,
  PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT,
]

function parseFieldInput(type, raw) {
  const cleaned = String(raw ?? '').replace(/[^\d+-]/g, '')
  if (cleaned === '' || cleaned === '+' || cleaned === '-') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return normalizePayrollAdjustmentAmount(type, value)
}

function sumTypeInPeriod(adjustments, employeeId, type, fromDate, toDate) {
  return (adjustments ?? []).reduce((sum, row) => {
    if (row.employeeId !== employeeId) return sum
    if (row.type !== type) return sum
    if (fromDate && row.date < fromDate) return sum
    if (toDate && row.date > toDate) return sum
    return sum + Number(row.amount ?? 0)
  }, 0)
}

function buildDraftTotals(adjustments, employeeId, fromDate, toDate) {
  const totals = {}
  for (const type of BOARD_FIELDS) {
    totals[type] = sumTypeInPeriod(adjustments, employeeId, type, fromDate, toDate)
  }
  return totals
}

/**
 * Popup Admin — sửa GIÁ TRỊ TỔNG từng hạng mục (SET, không cộng dồn dòng).
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
  const [draft, setDraft] = useState({})
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const currentTotals = useMemo(() => {
    if (!payrollRow) return null
    return buildDraftTotals(adjustments, payrollRow.employeeId, fromDate, toDate)
  }, [adjustments, payrollRow, fromDate, toDate])

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

  const parsedDraft = useMemo(() => {
    const out = {}
    for (const type of BOARD_FIELDS) {
      out[type] = parseFieldInput(type, draft[type])
    }
    return out
  }, [draft])

  const preview = useMemo(() => {
    if (!open || !payrollRow || !employeeStub || !currentTotals) return null
    const keptOthers = (adjustments ?? []).filter((row) => {
      if (row.employeeId !== payrollRow.employeeId) return true
      if (!ADMIN_EDITABLE_ADJUSTMENT_TYPES.includes(row.type)) return true
      if (fromDate && row.date < fromDate) return true
      if (toDate && row.date > toDate) return true
      return false
    })
    const draftRecords = BOARD_FIELDS.map((type) => {
      const amount = parsedDraft[type]
      if (amount === null || amount === 0) return null
      return {
        id: `__draft-total-${type}`,
        date: toDate || `${month}-15`,
        month,
        branchId: payrollRow.branchId || '',
        employeeId: payrollRow.employeeId,
        employeeName: payrollRow.employeeName,
        type,
        amount,
        reason: reason || 'Sửa bảng lương',
        note: note || '',
        payrollCycle: cycle || '',
      }
    }).filter(Boolean)

    const nextRow = computeEmployeePayrollRow(
      employeeStub,
      invoices,
      attendance,
      [...keptOthers, ...draftRecords],
    )
    const oldNet = Number(payrollRow.netSalary ?? 0)
    const newNet = Number(nextRow.netSalary ?? 0)
    return { oldNet, newNet, diff: newNet - oldNet }
  }, [
    open, payrollRow, employeeStub, currentTotals, parsedDraft, reason, note,
    adjustments, fromDate, toDate, month, cycle, invoices, attendance,
  ])

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
                <span role="cell">{formatCurrency(current)}</span>
                <label role="cell">
                  <span className="salary-edit-totals__sr">Giá trị mới {PAYROLL_ADJUSTMENT_LABELS[type]}</span>
                  <input
                    required
                    inputMode="text"
                    value={draft[type] ?? ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [type]: e.target.value }))}
                    placeholder={
                      type === PAYROLL_ADJUSTMENT_TYPES.KPI
                      || type === PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT
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
