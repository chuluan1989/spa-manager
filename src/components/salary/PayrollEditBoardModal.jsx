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
import { ATTENDANCE_PENALTY_READONLY_HINT } from '../../utils/payrollPenaltyPolicy'
import {
  listPeriodAdjustments,
  sumAdjustmentAmounts,
} from '../../utils/payrollBoardLines'
import PayrollBoardLineSection from './PayrollBoardLineSection'

/** Thưởng / KPI / Giam lương vẫn SET giá trị cuối kỳ. Ứng lương / Phạt khác = từng phát sinh. */
const SET_FIELDS = [
  PAYROLL_ADJUSTMENT_TYPES.BONUS,
  PAYROLL_ADJUSTMENT_TYPES.KPI,
  PAYROLL_ADJUSTMENT_TYPES.REDUCTION,
]

const BOARD_FIELD_TO_ROW_KEY = {
  [PAYROLL_ADJUSTMENT_TYPES.BONUS]: 'bonus',
  [PAYROLL_ADJUSTMENT_TYPES.KPI]: 'kpi',
  [PAYROLL_ADJUSTMENT_TYPES.PENALTY]: 'manualPenalty',
  [PAYROLL_ADJUSTMENT_TYPES.ADVANCE]: 'advance',
  [PAYROLL_ADJUSTMENT_TYPES.REDUCTION]: 'reduction',
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
 * Phạt = manualPenalty (không gồm attendance).
 */
export function currentTotalsFromPayrollRow(payrollRow) {
  if (!payrollRow) return null
  const totals = {}
  for (const type of [
    PAYROLL_ADJUSTMENT_TYPES.BONUS,
    PAYROLL_ADJUSTMENT_TYPES.KPI,
    PAYROLL_ADJUSTMENT_TYPES.PENALTY,
    PAYROLL_ADJUSTMENT_TYPES.ADVANCE,
    PAYROLL_ADJUSTMENT_TYPES.REDUCTION,
  ]) {
    const key = BOARD_FIELD_TO_ROW_KEY[type]
    totals[type] = Number(payrollRow[key] ?? 0)
  }
  return totals
}

/**
 * Popup Admin — Sửa bảng lương.
 * Thưởng / KPI / Giam lương: SET giá trị cuối. Ứng lương / Phạt khác: cộng từng phát sinh.
 */
export default function PayrollEditBoardModal({
  open,
  onClose,
  onSave,
  onAddLine,
  onEditLine,
  onVoidLine,
  onDeleteLine,
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

  const attendancePenalty = Number(payrollRow?.attendancePenalty ?? 0)
  const employeeId = payrollRow?.employeeId

  const advanceLines = useMemo(
    () => listPeriodAdjustments(adjustments, {
      employeeId,
      type: PAYROLL_ADJUSTMENT_TYPES.ADVANCE,
      fromDate,
      toDate,
    }),
    [adjustments, employeeId, fromDate, toDate],
  )
  const penaltyLines = useMemo(
    () => listPeriodAdjustments(adjustments, {
      employeeId,
      type: PAYROLL_ADJUSTMENT_TYPES.PENALTY,
      fromDate,
      toDate,
    }),
    [adjustments, employeeId, fromDate, toDate],
  )

  const advanceTotal = sumAdjustmentAmounts(advanceLines)
  const manualPenaltyTotal = sumAdjustmentAmounts(penaltyLines)

  useEffect(() => {
    if (!open || !payrollRow || !currentTotals) return
    const next = {}
    for (const type of SET_FIELDS) {
      next[type] = String(currentTotals[type] ?? 0)
    }
    setDraft(next)
    setReason('')
    setError('')
  }, [open, payrollRow, currentTotals])

  const parsedDraft = useMemo(() => {
    const out = {}
    for (const type of SET_FIELDS) {
      out[type] = parseFieldInput(type, draft[type])
    }
    return out
  }, [draft])

  const setChanged = useMemo(() => {
    if (!currentTotals) return false
    return SET_FIELDS.some((type) => {
      const next = parsedDraft[type]
      if (next === null) return false
      return next !== Number(currentTotals[type] ?? 0)
    })
  }, [currentTotals, parsedDraft])

  const preview = useMemo(() => {
    if (!open || !payrollRow || !currentTotals) return null
    const currentNet = Number(payrollRow.netSalary ?? 0)
    let netDelta = 0
    for (const type of SET_FIELDS) {
      const next = parsedDraft[type]
      if (next === null) return null
      netDelta += netSalaryImpactForFieldSet(type, currentTotals[type] ?? 0, next)
    }
    const nextNet = currentNet + netDelta
    return {
      currentNet,
      nextNet,
      netDelta,
      laborCostDelta: laborCostImpactForNetDelta(netDelta),
      profitDelta: spaProfitImpactForNetDelta(netDelta),
      nextTotalPenalty: attendancePenalty + manualPenaltyTotal,
    }
  }, [open, payrollRow, currentTotals, parsedDraft, attendancePenalty, manualPenaltyTotal])

  const handleSubmit = async (event) => {
    event?.preventDefault?.()
    setError('')
    if (!setChanged) {
      onClose()
      return
    }
    if (!reason.trim()) {
      setError('Lý do chỉnh sửa Thưởng / KPI / Giam lương là bắt buộc.')
      return
    }
    if (!preview) {
      setError('Giá trị mới không hợp lệ.')
      return
    }
    const totals = {}
    for (const type of SET_FIELDS) {
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
        attendancePenalty,
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

  const renderSetField = (type) => {
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
            data-testid={`edit-input-${type}`}
          />
        </label>
      </div>
    )
  }

  if (!open) return null

  const periodLabel = [month, cycle === 'period2' ? 'Kỳ 2' : 'Kỳ 1'].filter(Boolean).join(' · ')

  return (
    <div className="salary-modal" role="dialog" aria-modal="true" aria-labelledby="payroll-edit-title">
      <div className="salary-modal__backdrop" onClick={onClose} />
      <div className="salary-modal__panel salary-modal__panel--wide salary-board-edit">
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
          <strong>Thưởng / KPI / Giam lương</strong> nhập giá trị cuối kỳ.
          {' '}
          <strong>Giam lương</strong> là khoản giữ lại một phần lương theo kỳ — không phải phạt.
          {' '}
          <strong>Ứng lương / Phạt khác</strong> thêm từng phát sinh — tổng = cộng tất cả dòng trong kỳ,
          không ghi đè số hiện tại.
        </p>

        <div className="salary-edit-totals salary-edit-totals--board" role="table" aria-label="Bảng lương hiện tại">
          <div className="salary-edit-totals__head" role="row">
            <span role="columnheader">Hạng mục</span>
            <span role="columnheader">Dữ liệu hiện tại</span>
            <span role="columnheader">Giá trị mới</span>
          </div>

          <div className="salary-edit-totals__row salary-edit-totals__row--readonly" role="row">
            <span role="cell">
              <strong>Phạt chấm công</strong>
            </span>
            <span
              role="cell"
              className="salary-edit-totals__current"
              data-testid="edit-current-attendance-penalty"
            >
              {formatCurrency(attendancePenalty)}
            </span>
            <span role="cell" className="salary-edit-totals__readonly">
              Chỉ đọc
            </span>
          </div>
          <p className="salary-board-edit__penalty-hint" data-testid="attendance-penalty-hint">
            {ATTENDANCE_PENALTY_READONLY_HINT}
          </p>

          {SET_FIELDS
            .filter((type) => type !== PAYROLL_ADJUSTMENT_TYPES.REDUCTION)
            .map((type) => renderSetField(type))}

          <h4 className="salary-board-edit__title" data-testid="giam-luong-heading">GIAM LƯƠNG</h4>
          <p className="salary-board-edit__hint">
            Khoản giữ lại một phần lương theo kỳ của nhân viên. Không phải phạt.
          </p>
          {renderSetField(PAYROLL_ADJUSTMENT_TYPES.REDUCTION)}
        </div>

        <PayrollBoardLineSection
          type={PAYROLL_ADJUSTMENT_TYPES.ADVANCE}
          title="Ứng lương"
          currentLabel="Ứng lương hiện tại"
          addLabel="+ Thêm ứng lương"
          lines={advanceLines}
          fromDate={fromDate}
          toDate={toDate}
          saving={saving}
          onAdd={onAddLine}
          onEdit={onEditLine}
          onVoid={onVoidLine}
          onDelete={onDeleteLine}
        />

        <PayrollBoardLineSection
          type={PAYROLL_ADJUSTMENT_TYPES.PENALTY}
          title="Phạt khác"
          currentLabel="Phạt khác hiện tại"
          addLabel="+ Thêm phạt"
          lines={penaltyLines}
          fromDate={fromDate}
          toDate={toDate}
          saving={saving}
          onAdd={onAddLine}
          onEdit={onEditLine}
          onVoid={onVoidLine}
          onDelete={onDeleteLine}
        />

        {preview && (
          <div className="salary-board-edit__preview" role="status">
            <div>
              <span>Tổng phạt (chấm công + khác)</span>
              <strong>{formatCurrency(preview.nextTotalPenalty)}</strong>
            </div>
            <div>
              <span>Ứng lương (tổng phát sinh)</span>
              <strong>{formatCurrency(advanceTotal)}</strong>
            </div>
            <div>
              <span>Giam lương</span>
              <strong data-testid="edit-preview-reduction">{formatCurrency(
                parsedDraft[PAYROLL_ADJUSTMENT_TYPES.REDUCTION]
                ?? currentTotals?.[PAYROLL_ADJUSTMENT_TYPES.REDUCTION]
                ?? 0,
              )}</strong>
            </div>
            <div>
              <span>Lương hiện tại</span>
              <strong>{formatCurrency(preview.currentNet)}</strong>
            </div>
            <div>
              <span>Lương sau chỉnh</span>
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

        {setChanged && (
          <label className="salary-board-edit__reason">
            Lý do chỉnh sửa Thưởng / KPI / Giam lương
            <textarea
              required={setChanged}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Bắt buộc — ghi rõ lý do để audit"
            />
          </label>
        )}

        {error && <p className="salary-page__error">{error}</p>}

        <footer>
          <button type="button" onClick={onClose}>Đóng</button>
          <button
            type="button"
            disabled={saving || (setChanged && !preview)}
            onClick={handleSubmit}
          >
            {saving ? 'Đang lưu…' : setChanged ? 'Lưu thưởng / KPI / Giam lương' : 'Đóng'}
          </button>
        </footer>
      </div>
    </div>
  )
}
