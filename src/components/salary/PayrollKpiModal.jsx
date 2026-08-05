import { useMemo, useState } from 'react'
import { PAYROLL_ADJUSTMENT_TYPES } from '../../constants/payrollTypes'
import { formatCurrency } from '../../utils/invoice'
import { computeEmployeePayrollRow } from '../../utils/payrollEngine'

function parseSignedAmount(raw) {
  const cleaned = String(raw ?? '').replace(/[^\d+-]/g, '')
  if (!cleaned || cleaned === '+' || cleaned === '-') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

function sumPeriodKpi(adjustments, employeeId, fromDate, toDate) {
  return (adjustments ?? [])
    .filter((row) => {
      if (row.employeeId !== employeeId) return false
      if (row.type !== PAYROLL_ADJUSTMENT_TYPES.KPI) return false
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      return true
    })
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
}

/**
 * Popup Admin — đặt tổng KPI kỳ (dương / âm / 0).
 * KPI = 0: đưa tổng KPI về 0 (thêm dòng bù, không xóa lịch sử).
 */
export default function PayrollKpiModal({
  open,
  onClose,
  onSubmit,
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
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('KPI thủ công')
  const [error, setError] = useState('')

  const currentKpi = useMemo(() => {
    if (!open || !payrollRow) return 0
    return sumPeriodKpi(adjustments, payrollRow.employeeId, fromDate, toDate)
  }, [open, payrollRow, adjustments, fromDate, toDate])

  const preview = useMemo(() => {
    if (!open || !employee || !payrollRow) return null
    const value = parseSignedAmount(amount)
    if (value === null) {
      return {
        oldNet: payrollRow.netSalary ?? 0,
        newNet: payrollRow.netSalary ?? 0,
        diff: 0,
        oldKpi: currentKpi,
        newKpi: currentKpi,
      }
    }
    const withoutKpi = (adjustments ?? []).filter((row) => {
      if (row.employeeId !== payrollRow.employeeId) return true
      if (row.type !== PAYROLL_ADJUSTMENT_TYPES.KPI) return true
      if (fromDate && row.date < fromDate) return true
      if (toDate && row.date > toDate) return true
      return false
    })
    const draftAdj = {
      id: '__draft-kpi-set__',
      date: toDate || `${month}-15`,
      month,
      branchId: employee.branchId || payrollRow.branchId || '',
      employeeId: payrollRow.employeeId,
      employeeName: payrollRow.employeeName,
      type: PAYROLL_ADJUSTMENT_TYPES.KPI,
      amount: value,
      reason,
      note,
      payrollCycle: cycle || '',
    }
    const nextRow = computeEmployeePayrollRow(
      {
        id: payrollRow.employeeId,
        name: payrollRow.employeeName,
        branchId: payrollRow.branchId,
        salaryRate: employee.salaryRate,
        position: employee.position,
        avatar: employee.avatar,
      },
      invoices,
      attendance,
      [...withoutKpi, draftAdj],
    )
    const oldNet = Number(payrollRow.netSalary ?? 0)
    const newNet = Number(nextRow.netSalary ?? 0)
    return {
      oldNet,
      newNet,
      diff: newNet - oldNet,
      oldKpi: currentKpi,
      newKpi: value,
    }
  }, [
    open, employee, payrollRow, amount, note, reason, month, cycle,
    toDate, fromDate, invoices, attendance, adjustments, currentKpi,
  ])

  if (!open) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    const value = parseSignedAmount(amount)
    if (value === null) {
      setError('Nhập số KPI (có thể dương, âm hoặc 0).')
      return
    }
    if (!reason.trim()) {
      setError('Lý do là bắt buộc.')
      return
    }
    await onSubmit({
      type: PAYROLL_ADJUSTMENT_TYPES.KPI,
      amount: value,
      note: note.trim(),
      reason: reason.trim(),
      date: toDate || `${month}-15`,
      month,
      fromDate,
      toDate,
      branchId: employee?.branchId || payrollRow?.branchId || '',
      employeeId: payrollRow.employeeId,
      employeeName: payrollRow.employeeName,
      payrollCycle: cycle || '',
      existingAdjustments: adjustments,
      locks,
    })
    setAmount('')
    setNote('')
    setReason('KPI thủ công')
    onClose()
  }

  return (
    <div className="salary-modal" role="dialog" aria-modal="true" aria-labelledby="payroll-kpi-title">
      <div className="salary-modal__backdrop" onClick={onClose} />
      <form className="salary-modal__panel" onSubmit={handleSubmit}>
        <header>
          <h3 id="payroll-kpi-title">KPI</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>

        <p className="salary-modal__hint">
          Đặt tổng KPI kỳ (dương / âm / 0). Số 0 đưa KPI về 0 — không xóa lịch sử.
          Nhân viên: <strong>{payrollRow?.employeeName}</strong>
          {' · '}Hiện tại: <strong>{formatCurrency(currentKpi)}</strong>
        </p>

        <label>
          KPI (+/- / 0)
          <input
            required
            inputMode="text"
            placeholder="VD: 200000, -50000 hoặc 0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label>
          Ghi chú
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Mô tả KPI"
          />
        </label>

        <label>
          Lý do (bắt buộc)
          <input
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>

        {preview && (
          <div className="salary-modal__preview" role="status">
            <div><span>KPI cũ</span><strong>{formatCurrency(preview.oldKpi)}</strong></div>
            <div><span>KPI mới</span><strong>{formatCurrency(preview.newKpi)}</strong></div>
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
          <button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu KPI'}</button>
        </footer>
      </form>
    </div>
  )
}
