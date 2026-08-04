import { useCallback, useEffect, useState } from 'react'
import { formatCurrency } from '../../utils/invoice'
import { getTodayDate } from '../../utils/invoiceStorage'
import {
  CLOSE_CYCLE_OPTIONS,
  CLOSE_CYCLES,
  formatCloseCycleRangeLabel,
  getCloseCycleRange,
  getDefaultCloseCycleSelection,
} from '../../utils/payrollCycleClose/payCycleCalendar'
import { listDuePayrollCloseTargets } from '../../utils/payrollCycleClose/closeRemind'
import { buildCloseCyclePreview } from '../../utils/payrollCycleClose/buildCloseCyclePreview'
import { submitCloseCycle } from '../../utils/payrollCycleClose/submitCloseCycle'
import { ATTENDANCE_DAY_RESULT } from '../../utils/payrollCycleClose/attendancePeriodReview'
import {
  CLOSE_CONFIRMATION_ITEMS,
  areCloseConfirmationsComplete,
  emptyCloseConfirmations,
} from '../../utils/payrollCycleClose/closeConfirmations'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import {
  consumePayrollClosePrefill,
  requestAppNavigate,
} from '../../utils/navigationPrefill'
import './PayrollCycleClosePanel.css'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

function resolveInitialSelection(defaultBillingMonth, defaultCycle) {
  const prefill = consumePayrollClosePrefill()
  if (prefill?.billingMonth && prefill?.cycle) {
    return { billingMonth: prefill.billingMonth, cycle: prefill.cycle }
  }
  if (defaultBillingMonth && defaultCycle) {
    return { billingMonth: defaultBillingMonth, cycle: defaultCycle }
  }
  const today = getTodayDate()
  const due = listDuePayrollCloseTargets(today)[0]
  if (due) return { billingMonth: due.billingMonth, cycle: due.cycle }
  const fallback = getDefaultCloseCycleSelection(today)
  return { billingMonth: fallback.billingMonth, cycle: fallback.cycle }
}

/**
 * Batch 2 — Bảng lương dự kiến + Gửi chốt kỳ lương + checklist điều kiện gửi.
 */
export default function PayrollCycleClosePanel({
  employeeId,
  canSubmit = true,
  defaultBillingMonth = '',
  defaultCycle = CLOSE_CYCLES.PERIOD_2,
}) {
  const syncVersion = useDataSyncVersion()
  const initial = resolveInitialSelection(defaultBillingMonth, defaultCycle)
  const [billingMonth, setBillingMonth] = useState(initial.billingMonth)
  const [cycle, setCycle] = useState(initial.cycle)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmations, setConfirmations] = useState(() => emptyCloseConfirmations())

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
      setConfirmations(emptyCloseConfirmations())
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
    if (!areCloseConfirmationsComplete(confirmations)) {
      setError('Vui lòng tick đủ 3 xác nhận trước khi gửi bảng chốt lương.')
      return
    }
    const ok = window.confirm(
      `Gửi bảng chốt lương ${formatCloseCycleRangeLabel(billingMonth, cycle)} cho Admin duyệt?\n\nSau khi gửi bạn không sửa được phiếu cho đến khi Admin trả lại.`,
    )
    if (!ok) return
    setSubmitting(true)
    setMessage('')
    setError('')
    try {
      await submitCloseCycle({ employeeId, billingMonth, cycle, confirmations })
      setMessage('Đã gửi bảng chốt lương. Quản lý và Admin đã nhận việc cần xử lý.')
      await reload()
    } catch (err) {
      setError(err?.message ?? 'Không gửi được chốt kỳ lương.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!employeeId) return null

  const salary = preview?.salary
  const confirmationsComplete = areCloseConfirmationsComplete(confirmations)
  const submitDisabled = (
    !canSubmit
    || !preview?.canSubmit
    || !confirmationsComplete
    || submitting
    || loading
    || Boolean(error && !preview)
  )
  const cycleLabel = cycle === CLOSE_CYCLES.PERIOD_1 ? 'Kỳ 1' : 'Kỳ 2'

  const checklistRows = preview
    ? [
        {
          title: 'Tour/Hóa đơn',
          ok: preview.invoicesSynced,
          label: preview.unsyncedInvoiceError
            ? `Lỗi kiểm tra: ${preview.unsyncedInvoiceError}`
            : preview.invoicesSynced
              ? 'Đã đồng bộ'
              : `Còn ${preview.unsyncedInvoiceCount} hóa đơn chưa đồng bộ.`,
        },
        {
          title: 'Chấm công',
          ok: preview.attendanceComplete,
          label: preview.attendanceComplete
            ? (preview.attendanceWaiver ? 'Ngoại lệ Kỳ 1/07 — không bắt buộc' : 'Đã đủ')
            : `Còn ${preview.attendanceReview.summary.missingDays} ngày chưa chấm công.`,
        },
        {
          title: 'Bảng lương dự kiến',
          ok: Boolean(preview.previewLoaded && !error),
          label: preview.previewLoaded && !error ? 'Có thể xem' : 'Chưa tải được',
        },
        {
          title: 'Gửi chốt',
          ok: !preview.canSubmit && Boolean(preview.status),
          label: preview.statusLabel,
        },
      ]
    : []

  return (
    <section className="pcc-panel" aria-label="Chốt kỳ lương">
      <header className="pcc-panel__head">
        <div>
          <h3>Chốt kỳ lương</h3>
          <p>
            Kiểm tra Tour, chấm công và bảng lương dự kiến trước khi gửi Admin duyệt.
          </p>
        </div>
        <div className="pcc-panel__filters">
          <label>
            Tháng kỳ lương
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
        {' · Chốt từ '}
        {formatDate(getCloseCycleRange(billingMonth, cycle).submitDate)}
        {' · '}
        {cycleLabel}
      </p>

      <div className="pcc-panel__quick-links">
        <button type="button" className="pcc-panel__link-btn" onClick={() => requestAppNavigate('invoices')}>
          Kiểm tra Tour
        </button>
        <button type="button" className="pcc-panel__link-btn" onClick={() => requestAppNavigate('attendance')}>
          Kiểm tra chấm công
        </button>
        <button
          type="button"
          className="pcc-panel__link-btn"
          onClick={() => document.getElementById('pcc-salary-preview')?.scrollIntoView({ behavior: 'smooth' })}
        >
          Xem bảng lương dự kiến
        </button>
      </div>

      {loading && <p className="pcc-panel__muted">Đang tải bảng lương dự kiến…</p>}
      {error && <p className="pcc-panel__error" role="alert">{error}</p>}
      {message && <p className="pcc-panel__ok" role="status">{message}</p>}

      {preview && !loading && (
        <>
          <div className="pcc-panel__checklist" aria-label="Checklist chốt kỳ">
            <h4>Checklist trước khi gửi</h4>
            <ul>
              {checklistRows.map((row) => (
                <li key={row.title} className={row.ok ? 'is-ok' : 'is-warn'}>
                  <span>{row.title}</span>
                  <strong>{row.label}</strong>
                </li>
              ))}
            </ul>
          </div>

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

          <div className="pcc-panel__salary" id="pcc-salary-preview">
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
            {(preview.infoNotes ?? []).map((note) => (
              <p key={note} className="pcc-panel__muted">{note}</p>
            ))}
            {preview.attendanceReview.summary.missingDates?.length > 0 && (
              <details open>
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
            <>
              <div className="pcc-panel__confirmations" aria-label="Xác nhận trước khi gửi">
                <h4>Xác nhận trước khi gửi</h4>
                <p className="pcc-panel__muted">Chỉ xác nhận dữ liệu trong kỳ đang gửi — không yêu cầu kỳ cũ.</p>
                {CLOSE_CONFIRMATION_ITEMS.map((item) => (
                  <label key={item.key} className="pcc-panel__confirm-item">
                    <input
                      type="checkbox"
                      checked={Boolean(confirmations[item.key])}
                      onChange={(e) => {
                        setConfirmations((prev) => ({
                          ...prev,
                          [item.key]: e.target.checked,
                        }))
                      }}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="pcc-panel__submit"
                disabled={submitDisabled}
                title={
                  submitDisabled
                    ? (!confirmationsComplete
                      ? 'Cần tick đủ 3 xác nhận'
                      : (preview.blockReasons.find((r) => !r.includes('Ngoại lệ')) || 'Chưa đủ điều kiện gửi'))
                    : undefined
                }
                onClick={handleSubmit}
              >
                {submitting ? 'Đang gửi…' : `Gửi chốt lương ${cycleLabel}`}
              </button>
            </>
          )}
        </>
      )}
    </section>
  )
}
