import { useCallback, useEffect, useState } from 'react'
import { formatCurrency } from '../../utils/invoice'
import { getTodayDate } from '../../utils/invoiceStorage'
import {
  CLOSE_CYCLE_OPTIONS,
  CLOSE_CYCLES,
  formatCloseCycleRangeLabel,
  getCloseCycleRange,
} from '../../utils/payrollCycleClose/payCycleCalendar'
import { buildCloseCyclePreview } from '../../utils/payrollCycleClose/buildCloseCyclePreview'
import { submitCloseCycle } from '../../utils/payrollCycleClose/submitCloseCycle'
import { ATTENDANCE_DAY_RESULT } from '../../utils/payrollCycleClose/attendancePeriodReview'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import './PayrollCycleClosePanel.css'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Batch 2 — Bảng lương dự kiến + Gửi chốt kỳ lương.
 */
export default function PayrollCycleClosePanel({
  employeeId,
  canSubmit = true,
  defaultBillingMonth = '',
  defaultCycle = CLOSE_CYCLES.PERIOD_2,
}) {
  const syncVersion = useDataSyncVersion()
  const [billingMonth, setBillingMonth] = useState(
    () => defaultBillingMonth || getTodayDate().slice(0, 7),
  )
  const [cycle, setCycle] = useState(defaultCycle)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const reload = useCallback(async () => {
    if (!employeeId) {
      setPreview(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const next = await buildCloseCyclePreview({
        employeeId,
        billingMonth,
        cycle,
        todayDate: getTodayDate(),
      })
      setPreview(next)
    } catch (err) {
      setPreview(null)
      setError(err?.message ?? 'Không tải được bảng lương dự kiến.')
    } finally {
      setLoading(false)
    }
  }, [employeeId, billingMonth, cycle])

  useEffect(() => {
    reload()
  }, [reload, syncVersion])

  const handleSubmit = async () => {
    if (!canSubmit || !preview?.canSubmit || submitting) return
    const ok = window.confirm(
      `Gửi chốt ${formatCloseCycleRangeLabel(billingMonth, cycle)} cho Admin duyệt?\n\nSau khi gửi bạn không sửa được phiếu cho đến khi Admin trả lại.`,
    )
    if (!ok) return
    setSubmitting(true)
    setMessage('')
    setError('')
    try {
      await submitCloseCycle({ employeeId, billingMonth, cycle })
      setMessage('Đã gửi chốt kỳ lương cho Admin.')
      await reload()
    } catch (err) {
      setError(err?.message ?? 'Không gửi được chốt kỳ lương.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!employeeId) return null

  const salary = preview?.salary
  const submitDisabled = !canSubmit || !preview?.canSubmit || submitting || loading

  return (
    <section className="pcc-panel" aria-label="Chốt kỳ lương">
      <header className="pcc-panel__head">
        <div>
          <h3>Chốt kỳ lương</h3>
          <p>Xem bảng lương dự kiến và gửi cho Admin khi chấm công đã đủ.</p>
        </div>
        <div className="pcc-panel__filters">
          <label>
            Tháng gửi chốt
            <input type="month" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} />
          </label>
          <label>
            Kỳ
            <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
              {CLOSE_CYCLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} — {option.hint}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <p className="pcc-panel__hint">
        {formatCloseCycleRangeLabel(billingMonth, cycle)}
        {' · Gửi dự kiến '}
        {formatDate(getCloseCycleRange(billingMonth, cycle).submitDate)}
      </p>

      {loading && <p className="pcc-panel__muted">Đang tải bảng lương dự kiến…</p>}
      {error && <p className="pcc-panel__error" role="alert">{error}</p>}
      {message && <p className="pcc-panel__ok" role="status">{message}</p>}

      {preview && !loading && (
        <>
          <div className="pcc-panel__status">
            <span>Trạng thái phiếu</span>
            <strong>{preview.statusLabel}</strong>
          </div>

          {preview.existing?.returnReason && preview.status === 'returned' && (
            <p className="pcc-panel__warn">
              Lý do trả lại:
              {' '}
              {preview.existing.returnReason}
            </p>
          )}
          {preview.existing?.rejectReason && preview.status === 'returned' && !preview.existing?.returnReason && (
            <p className="pcc-panel__warn">
              Lý do trả lại:
              {' '}
              {preview.existing.rejectReason}
            </p>
          )}

          <div className="pcc-panel__salary">
            <h4>Bảng lương dự kiến</h4>
            <ul>
              {(salary.baseSalary ?? 0) > 0 && (
                <li><span>Lương cơ bản</span><strong>{formatCurrency(salary.baseSalary)}</strong></li>
              )}
              <li><span>% tiền vé / Hoa hồng dịch vụ</span><strong>{formatCurrency(salary.commission)}</strong></li>
              <li><span>Tips</span><strong>{formatCurrency(salary.tips)}</strong></li>
              <li><span>Thưởng</span><strong>{formatCurrency(salary.bonus)}</strong></li>
              <li><span>Phạt</span><strong>{formatCurrency(salary.penalty)}</strong></li>
              <li><span>Tạm ứng</span><strong>{formatCurrency(salary.advance)}</strong></li>
              <li><span>Khoản cộng</span><strong>{formatCurrency(salary.otherAdjustment)}</strong></li>
              <li><span>Khoản trừ</span><strong>{formatCurrency(salary.reduction)}</strong></li>
              <li className="is-total">
                <span>Tổng lương dự kiến</span>
                <strong>{formatCurrency(salary.netSalary)}</strong>
              </li>
            </ul>
            <p className="pcc-panel__muted">Chỉ xem — không sửa trực tiếp trên phiếu này.</p>
          </div>

          <div className="pcc-panel__attendance-summary">
            <h4>Chấm công trong kỳ</h4>
            <p>
              Đã chấm
              {' '}
              <strong>{preview.attendanceReview.summary.completedDays}</strong>
              /
              {preview.attendanceReview.summary.requiredDays}
              {' · Còn thiếu '}
              <strong>{preview.attendanceReview.summary.missingDays}</strong>
            </p>
            {preview.blockReasons.map((reason) => (
              <p key={reason} className="pcc-panel__warn">{reason}</p>
            ))}
            {preview.attendanceReview.summary.missingDates?.length > 0 && (
              <details>
                <summary>Ngày chưa chấm</summary>
                <ul>
                  {preview.attendanceReview.summary.missingDates.map((date) => (
                    <li key={date}>{formatDate(date)}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="pcc-panel__day-list">
              {preview.attendanceReview.days.slice(0, 40).map((day) => (
                <div
                  key={day.date}
                  className={
                    day.result === ATTENDANCE_DAY_RESULT.MISSING
                      ? 'is-missing'
                      : day.result === ATTENDANCE_DAY_RESULT.FUTURE
                        ? 'is-future'
                        : ''
                  }
                >
                  <span>{formatDate(day.date)}</span>
                  <strong>{day.resultLabel}</strong>
                </div>
              ))}
            </div>
          </div>

          {canSubmit && (
            <button
              type="button"
              className="pcc-panel__submit"
              disabled={submitDisabled}
              title={submitDisabled ? (preview.blockReasons[0] || 'Chưa đủ điều kiện gửi') : undefined}
              onClick={handleSubmit}
            >
              {submitting ? 'Đang gửi…' : 'Gửi chốt kỳ lương cho Admin'}
            </button>
          )}
        </>
      )}
    </section>
  )
}
