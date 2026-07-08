import { useMemo, useState } from 'react'
import { getAttendancePermitLabel, getAttendanceStatusLabel } from '../../constants/attendanceTypes'
import { getCurrentUserEmployeeId } from '../../constants/auth'
import { formatCurrency } from '../../utils/invoice'
import { getTodayDate } from '../../utils/invoiceStorage'
import { useAttendanceData } from '../../hooks/useAttendanceData'
import { buildAttendanceStats } from '../../utils/attendancePenalties'
import { getBranchName } from '../../utils/branchStorage'
import AttendanceMonthMatrix from './AttendanceMonthMatrix'
import { buildAttendanceMonthMatrix } from '../../utils/attendanceViewHelpers'
import { getEmployeeById } from '../../utils/employeeStorage'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('vi-VN')
}

export default function AttendanceEmployeeView() {
  const employee = getEmployeeById(getCurrentUserEmployeeId())
  const [screen, setScreen] = useState('today')
  const [month, setMonth] = useState(() => getTodayDate().slice(0, 7))
  const todayDate = getTodayDate()

  const monthRange = useMemo(() => {
    const [yearStr, monthStr] = month.split('-')
    const year = Number(yearStr)
    const monthNum = Number(monthStr)
    const lastDay = new Date(year, monthNum, 0).getDate()
    return {
      fromDate: `${month}-01`,
      toDate: `${month}-${String(lastDay).padStart(2, '0')}`,
    }
  }, [month])

  const filters = useMemo(() => {
    if (screen === 'today') {
      return { date: todayDate, employeeId: employee?.id ?? '' }
    }
    return {
      fromDate: monthRange.fromDate,
      toDate: monthRange.toDate,
      employeeId: employee?.id ?? '',
    }
  }, [screen, todayDate, monthRange, employee?.id])

  const { records, loading, error } = useAttendanceData(filters)
  const stats = useMemo(() => buildAttendanceStats(records), [records])
  const matrix = useMemo(
    () => buildAttendanceMonthMatrix(employee ? [employee] : [], records, month),
    [employee, records, month],
  )

  if (!employee) {
    return <p className="attendance-page__empty">Không tìm thấy hồ sơ nhân viên.</p>
  }

  return (
    <div className="attendance-page erp-page">
      <header className="attendance-page__self-head">
        <div>
          <h1>Chấm công của tôi</h1>
          <p>{employee.name} · {getBranchName(employee.branchId)}</p>
        </div>
        <span className="attendance-page__today-badge">Hôm nay: {formatDate(todayDate)}</span>
      </header>

      <nav className="attendance-page__tabs">
        <button type="button" className={screen === 'today' ? 'is-active' : ''} onClick={() => setScreen('today')}>
          Hôm nay
        </button>
        <button type="button" className={screen === 'month' ? 'is-active' : ''} onClick={() => setScreen('month')}>
          Theo tháng
        </button>
      </nav>

      {screen === 'month' && (
        <label className="attendance-page__month-filter">
          Tháng
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      )}

      <section className="attendance-page__stats">
        <article><span>Tổng</span><strong>{stats.total}</strong></article>
        <article><span>Đúng giờ</span><strong>{stats.onTime}</strong></article>
        <article><span>Đi trễ</span><strong>{stats.late}</strong></article>
        <article className="is-penalty"><span>Tổng phạt</span><strong>{formatCurrency(stats.totalPenalty)}</strong></article>
      </section>

      {error && <p className="attendance-page__error">{error}</p>}
      {loading && <p className="attendance-page__loading">Đang tải...</p>}

      {!loading && screen === 'month' && (
        <AttendanceMonthMatrix days={matrix.days} rows={matrix.rows} />
      )}

      {!loading && screen === 'today' && (
        <div className="attendance-page__table-wrap">
          <table className="attendance-page__table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Trạng thái</th>
                <th>Có phép / Không phép</th>
                <th>Số tiền phạt</th>
                <th>Ghi chú</th>
                <th>Thời gian cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="attendance-page__empty">Hôm nay chưa có dữ liệu chấm công.</td>
                </tr>
              ) : records.map((record) => (
                <tr key={record.id}>
                  <td>{formatDate(record.date)}</td>
                  <td>{getAttendanceStatusLabel(record.status)}</td>
                  <td>{getAttendancePermitLabel(record.status)}</td>
                  <td className="is-money">{formatCurrency(record.penaltyAmount)}</td>
                  <td>{record.note || record.reason || '—'}</td>
                  <td>{formatDateTime(record.updatedAt || record.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
