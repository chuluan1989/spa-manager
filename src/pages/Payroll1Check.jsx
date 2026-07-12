import { useEffect, useMemo, useState } from 'react'
import { ATTENDANCE_STATUS_OPTIONS, getAttendanceStatusLabel } from '../constants/attendanceTypes'
import { getCurrentUserEmployeeId } from '../constants/auth'
import { formatCurrency } from '../utils/invoice'
import { getPayroll1PeriodStart } from '../utils/payroll1Policy'
import { getIctTodayDate } from '../utils/ictTime'
import { loadEmployeePayroll1Status, markPayroll1DayReview } from '../utils/payroll1Service'
import { submitEmployeeAttendanceBackfill } from '../utils/attendanceService'
import { fetchAttendanceByEmployeeAndDate } from '../repositories/attendanceRepository'
import { setInvoiceCreateDatePrefill } from '../utils/navigationPrefill'
import { getEmployeeById } from '../utils/employeeStorage'
import Payroll1Progress from '../components/payroll1/Payroll1Progress'
import '../components/payroll1/payroll1.css'

export default function Payroll1CheckPage({ onNavigate }) {
  const employeeId = getCurrentUserEmployeeId()
  const employee = getEmployeeById(employeeId)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busyDate, setBusyDate] = useState('')

  const [backfillDate, setBackfillDate] = useState('')
  const [backfillStatus, setBackfillStatus] = useState(ATTENDANCE_STATUS_OPTIONS[0]?.id ?? '')
  const [backfillReason, setBackfillReason] = useState('')
  const [existingForDate, setExistingForDate] = useState(null)
  const [savingBackfill, setSavingBackfill] = useState(false)

  const periodStart = getPayroll1PeriodStart()
  const today = getIctTodayDate()

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await loadEmployeePayroll1Status(employeeId)
      setStatus(next)
    } catch (err) {
      setError(err?.message ?? 'Không tải được trạng thái kỳ lương 1.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [employeeId])

  useEffect(() => {
    let cancelled = false
    async function checkExisting() {
      if (!backfillDate || !employeeId) {
        setExistingForDate(null)
        return
      }
      try {
        const row = await fetchAttendanceByEmployeeAndDate(employeeId, backfillDate)
        if (!cancelled) setExistingForDate(row)
      } catch {
        if (!cancelled) setExistingForDate(null)
      }
    }
    checkExisting()
    return () => { cancelled = true }
  }, [backfillDate, employeeId])

  const missingAttendanceOptions = useMemo(
    () => status?.missingAttendanceDates ?? [],
    [status],
  )

  const showToast = (message, isError = false) => {
    setToast({ message, isError })
    window.setTimeout(() => setToast(''), 3500)
  }

  const handleMark = async (dayDate, reviewStatus) => {
    setBusyDate(dayDate)
    try {
      await markPayroll1DayReview({ employeeId, dayDate, reviewStatus })
      showToast(reviewStatus === 'no_tour'
        ? 'Đã ghi nhận ngày không phát sinh tour.'
        : 'Đã xác nhận kiểm tra hóa đơn ngày này.')
      await reload()
    } catch (err) {
      showToast(err?.message ?? 'Không lưu được xác nhận.', true)
    } finally {
      setBusyDate('')
    }
  }

  const handleAddInvoice = (dayDate) => {
    setInvoiceCreateDatePrefill(dayDate)
    onNavigate?.('invoices')
  }

  const handleBackfill = async () => {
    if (!backfillDate || !backfillStatus) return
    setSavingBackfill(true)
    try {
      await submitEmployeeAttendanceBackfill({
        employeeId,
        date: backfillDate,
        status: backfillStatus,
        reason: backfillReason,
        minDate: periodStart,
      })
      showToast('Đã bổ sung chấm công.')
      setBackfillReason('')
      setExistingForDate(null)
      await reload()
    } catch (err) {
      if (err?.existing) {
        setExistingForDate(err.existing)
        showToast('Ngày này đã có chấm công.', true)
      } else {
        showToast(err?.message ?? 'Không lưu được chấm công.', true)
      }
    } finally {
      setSavingBackfill(false)
    }
  }

  if (!employee) {
    return <p>Không tìm thấy hồ sơ nhân viên.</p>
  }

  return (
    <div className="payroll1-page">
      <header className="payroll1-page__head">
        <h1>Kiểm tra dữ liệu kỳ lương 1</h1>
        <p>
          Từ {periodStart.split('-').reverse().join('/')} đến hôm nay ({today.split('-').reverse().join('/')}).
          Không bắt buộc mỗi ngày phải có hóa đơn — ngày không có tour hãy chọn “Không phát sinh tour”.
        </p>
      </header>

      {toast && (
        <div className={`payroll1-toast${toast.isError ? ' payroll1-toast--error' : ''}`}>
          {toast.message}
        </div>
      )}
      {error && <div className="payroll1-toast payroll1-toast--error">{error}</div>}
      {loading && <p>Đang tải...</p>}

      {status && <Payroll1Progress status={status} />}

      {status && (
        <div className="payroll1-status-cards">
          <div className="payroll1-status-card">
            <span>Hồ sơ</span>
            <strong className={status.profileComplete ? 'payroll1-notice__ok' : 'payroll1-notice__warn'}>
              {status.profileStatusLabel}
            </strong>
          </div>
          <div className="payroll1-status-card">
            <span>Chấm công</span>
            <strong className={status.attendanceComplete ? 'payroll1-notice__ok' : 'payroll1-notice__warn'}>
              {status.attendanceStatusLabel}
            </strong>
          </div>
          <div className="payroll1-status-card">
            <span>Hóa đơn</span>
            <strong className={status.invoiceReviewComplete ? 'payroll1-notice__ok' : 'payroll1-notice__warn'}>
              {status.invoiceStatusLabel}
            </strong>
          </div>
          <div className="payroll1-status-card">
            <span>Nhập hóa đơn</span>
            <strong className={status.invoiceCreateLocked ? 'payroll1-notice__warn' : 'payroll1-notice__ok'}>
              {status.invoiceCreateLocked ? 'Đang khóa' : 'Được phép'}
            </strong>
          </div>
        </div>
      )}

      <section className="payroll1-backfill">
        <h3 style={{ margin: 0 }}>Bổ sung chấm công (01/07 → hôm nay)</h3>
        <div className="payroll1-backfill__row">
          <label>
            Ngày cần bổ sung
            <input
              type="date"
              min={periodStart}
              max={today}
              value={backfillDate}
              onChange={(e) => setBackfillDate(e.target.value)}
              list="payroll1-missing-dates"
            />
            <datalist id="payroll1-missing-dates">
              {missingAttendanceOptions.map((date) => (
                <option key={date} value={date} />
              ))}
            </datalist>
          </label>
          <label>
            Trạng thái
            <select value={backfillStatus} onChange={(e) => setBackfillStatus(e.target.value)}>
              {ATTENDANCE_STATUS_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Lý do (nếu có)
          <textarea
            rows={2}
            value={backfillReason}
            onChange={(e) => setBackfillReason(e.target.value)}
            placeholder="Ghi chú / lý do..."
          />
        </label>
        {existingForDate && (
          <p className="payroll1-notice__warn" style={{ margin: 0 }}>
            Ngày này đã chấm công: {getAttendanceStatusLabel(existingForDate.status)}. Không tạo bản ghi trùng.
            Admin có thể sửa nếu sai.
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={handleBackfill}
            disabled={savingBackfill || !backfillDate || Boolean(existingForDate)}
          >
            {savingBackfill ? 'Đang lưu...' : 'Lưu chấm công bổ sung'}
          </button>
        </div>
      </section>

      <div className="payroll1-table-wrap">
        <table className="payroll1-table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Số tour</th>
              <th>Tổng giá vé</th>
              <th>Tổng Tips</th>
              <th>Chấm công</th>
              <th>Trạng thái HĐ</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {(status?.dayRows ?? []).map((row) => (
              <tr key={row.date}>
                <td>{row.dateLabel}</td>
                <td>{row.tourCount}</td>
                <td>{formatCurrency(row.ticketTotal)}</td>
                <td>{formatCurrency(row.tipsTotal)}</td>
                <td>
                  {row.attendance
                    ? getAttendanceStatusLabel(row.attendanceStatus)
                    : <span className="payroll1-badge payroll1-badge--warn">Thiếu</span>}
                </td>
                <td>
                  <span className={`payroll1-badge ${row.reviewed ? 'payroll1-badge--ok' : 'payroll1-badge--warn'}`}>
                    {row.statusLabel}
                  </span>
                </td>
                <td>
                  <div className="payroll1-table__actions">
                    <button type="button" onClick={() => handleAddInvoice(row.date)}>
                      Nhập bổ sung hóa đơn
                    </button>
                    <button
                      type="button"
                      disabled={busyDate === row.date || row.reviewStatus === 'checked'}
                      onClick={() => handleMark(row.date, 'checked')}
                    >
                      Đã kiểm tra
                    </button>
                    <button
                      type="button"
                      disabled={busyDate === row.date || row.reviewStatus === 'no_tour'}
                      onClick={() => handleMark(row.date, 'no_tour')}
                    >
                      Ngày này không phát sinh tour
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
