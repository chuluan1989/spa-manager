import { useEffect, useMemo, useState } from 'react'
import {
  PAYROLL_ADJUSTMENT_LABELS,
  PAYROLL_ADJUSTMENT_TYPES,
  normalizePayrollAdjustmentAmount,
} from '../../constants/payrollTypes'
import { formatCurrency } from '../../utils/invoice'
import {
  laborCostImpactForNetDelta,
  netSalaryImpactForFieldSet,
  spaProfitImpactForNetDelta,
} from '../../utils/payrollFieldAudit'

/** Bốn hạng mục chính thức trên bảng lương kỳ — giá trị CUỐI, không phải dòng phát sinh. */
const BOARD_FIELDS = [
  PAYROLL_ADJUSTMENT_TYPES.BONUS,
  PAYROLL_ADJUSTMENT_TYPES.KPI,
  PAYROLL_ADJUSTMENT_TYPES.PENALTY,
  PAYROLL_ADJUSTMENT_TYPES.ADVANCE,
]

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
 * Nguồn duy nhất cho cột “Dữ liệu hiện tại”: payrollRow đang render trên màn hình.
 * Không query lại, không cộng dòng, không snapshot.
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
 * Popup Admin — Sửa bảng lương (Excel SET giá trị cuối kỳ).
 * Không phải “Thêm phát sinh” / không cộng dòng / không delta.
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
    const currentNet = Number(payrollRow.netSalary ?? 0)
    let netDelta = 0
    for (const type of BOARD_FIELDS) {
      const next = parsedDraft[type]
      if (next === null) return null
      netDelta += netSalaryImpactForFieldSet(type, currentTotals[type] ?? 0, next)
    }
    const nextNet = currentNet + netDelta
    const laborCostDelta = laborCostImpactForNetDelta(netDelta)
    const profitDelta = spaProfitImpactForNetDelta(netDelta)
    return {
      currentNet,
      nextNet,
      netDelta,
      laborCostDelta,
      profitDelta,
    }
  }, [open, payrollRow, currentTotals, parsedDraft])

  if (!open) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!reason.trim()) {
      setError('Lý do chỉnh sửa là bắt buộc.')
      return
    }
    if (!preview) {
      setError('Giá trị mới không hợp lệ.')
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
        note: '',
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
        previewImpact: {
          netDelta: preview.netDelta,
          laborCostDelta: preview.laborCostDelta,
          profitDelta: preview.profitDelta,
          currentNet: preview.currentNet,
          nextNet: preview.nextNet,
        },
      })
      onClose()
    } catch (err) {
      setError(err?.message || 'Không thể lưu bảng lương.')
    }
  }

  const periodLabel = [month, cycle === 'period2' ? 'Kỳ 2' : 'Kỳ 1'].filter(Boolean).join(' · ')

  return (
    <div className="salary-modal" role="dialog" aria-modal="true" aria-labelledby="payroll-edit-title">
      <div className="salary-modal__backdrop" onClick={onClose} />
      <form className="salary-modal__panel salary-modal__panel--wide salary-board-edit" onSubmit={handleSubmit}>
        <header>
          <h3 id="payroll-edit-title">Sửa bảng lương</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>

        <p className="salary-board-edit__eyebrow">
          Bảng lương chính thức · {payrollRow?.employeeName}
          {periodLabel ? ` · ${periodLabel}` : ''}
        </p>
        <h4 className="salary-board-edit__title">BẢNG LƯƠNG HIỆN TẠI</h4>
        <p className="salary-board-edit__hint">
          Nhập <strong>giá trị cuối cùng</strong> của kỳ. Số bên phải thay thế hoàn toàn số hiện tại
          — không cộng thêm, không thêm dòng.
        </p>

        <div className="salary-edit-totals salary-edit-totals--board" role="table" aria-label="Bảng lương hiện tại">
          <div className="salary-edit-totals__head" role="row">
            <span role="columnheader">Hạng mục</span>
            <span role="columnheader">Dữ liệu hiện tại</span>
            <span role="columnheader">Giá trị mới</span>
          </div>
          {BOARD_FIELDS.map((type) => {
            const current = currentTotals?.[type] ?? 0
            return (
              <div key={type} className="salary-edit-totals__row" role="row">
                <span role="cell">
                  <strong>{PAYROLL_ADJUSTMENT_LABELS[type]}</strong>
                </span>
                <span
                  role="cell"
                  className="salary-edit-totals__current"
                  data-testid={`edit-current-${type}`}
                >
                  {formatCurrency(current)}
                </span>
                <label role="cell">
                  <span className="salary-edit-totals__sr">
                    Giá trị mới {PAYROLL_ADJUSTMENT_LABELS[type]}
                  </span>
                  <input
                    required
                    inputMode="text"
                    value={draft[type] ?? ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [type]: e.target.value }))}
                    placeholder={
                      type === PAYROLL_ADJUSTMENT_TYPES.KPI
                        ? 'VD: 0 / 200000 / -200000'
                        : 'VD: 100000'
                    }
                  />
                </label>
              </div>
            )
          })}
        </div>

        {preview && (
          <div className="salary-board-edit__preview" role="status">
            <div>
              <span>Lương hiện tại</span>
              <strong>{formatCurrency(preview.currentNet)}</strong>
            </div>
            <div>
              <span>Lương sau chỉnh sửa</span>
              <strong>{formatCurrency(preview.nextNet)}</strong>
            </div>
            <div>
              <span>Chênh lệch</span>
              <strong className={preview.netDelta >= 0 ? 'is-plus' : 'is-minus'}>
                {preview.netDelta >= 0 ? '+' : ''}{formatCurrency(preview.netDelta)}
              </strong>
            </div>
            <div>
              <span>Chi phí nhân sự thay đổi</span>
              <strong className={preview.laborCostDelta >= 0 ? 'is-plus' : 'is-minus'}>
                {preview.laborCostDelta >= 0 ? '+' : ''}{formatCurrency(preview.laborCostDelta)}
              </strong>
            </div>
            <div>
              <span>Lợi nhuận Spa thay đổi</span>
              <strong className={preview.profitDelta >= 0 ? 'is-plus' : 'is-minus'}>
                {preview.profitDelta >= 0 ? '+' : ''}{formatCurrency(preview.profitDelta)}
              </strong>
            </div>
          </div>
        )}

        <label className="salary-board-edit__reason">
          Lý do chỉnh sửa
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Bắt buộc — ghi rõ lý do để audit"
          />
        </label>

        {error && <p className="salary-page__error">{error}</p>}

        <footer>
          <button type="button" onClick={onClose}>Hủy</button>
          <button type="submit" disabled={saving || !preview}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </footer>
      </form>
    </div>
  )
}
