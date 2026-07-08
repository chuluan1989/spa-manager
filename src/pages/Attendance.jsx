import { useEffect, useMemo, useState } from 'react'
import AttendanceEditModal from '../components/attendance/AttendanceEditModal'
import {
  canAccessAttendancePage,
  canSelectBranch,
  getCurrentUserBranch,
  isAdmin,
} from '../constants/auth'
import { getActiveBranches } from '../constants/branches'
import { getAttendanceStatusLabel } from '../constants/attendanceTypes'
import { loadEmployees } from '../utils/employeeStorage'
import { formatCurrency } from '../utils/invoice'
import { getMonthStartDate, getTodayDate } from '../utils/invoiceStorage'
import { useAttendanceData } from '../hooks/useAttendanceData'
import { buildAttendanceStats } from '../utils/attendancePenalties'
import { getBranchName } from '../utils/branchStorage'
import { fetchAttendanceServerDate } from '../repositories/attendanceRepository'
import './Attendance.css'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

export default function Attendance() {
  if (!canAccessAttendancePage()) {
    return (
      <div className="attendance-page">
        <p>Bạn không có quyền truy cập module Chấm công.</p>
      </div>
    )
  }

  return <AttendancePage />
}

function AttendancePage() {
  const [todayDate, setTodayDate] = useState('')
  const [month, setMonth] = useState(() => getTodayDate().slice(0, 7))
  const [branchId, setBranchId] = useState(isAdmin() ? '' : getCurrentUserBranch())
  const [employeeId, setEmployeeId] = useState('')
  const [editingRecord, setEditingRecord] = useState(null)

  useEffect(() => {
    fetchAttendanceServerDate()
      .then((server) => setTodayDate(server.date))
      .catch(() => setTodayDate(getTodayDate()))
  }, [])

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
      return {
        date: todayDate || getTodayDate(),
        branchId: canSelectBranch() ? branchId : getCurrentUserBranch(),
        employeeId,
      }
    }
    return {
      fromDate: monthRange.fromDate,
      toDate: monthRange.toDate,
      branchId: canSelectBranch() ? branchId : getCurrentUserBranch(),
      employeeId,
    }
  }, [screen, todayDate, monthRange, branchId, employeeId])

  const { records, loading, error, reload } = useAttendanceData(filters)
  const stats = useMemo(() => buildAttendanceStats(records), [records])

  const employees = useMemo(() => {
    const scopedBranch = canSelectBranch() ? branchId : getCurrentUserBranch()
    return loadEmployees().filter((employee) =>
      !scopedBranch || employee.branchId === scopedBranch,
    )
  }, [branchId])

  return (
    <div className="attendance-page">
      <header className="attendance-page__header">
        <div>
          <h1>Chấm công</h1>
          <p>Điểm danh realtime qua Supabase — Quản lý theo chi nhánh, nhân viên và tháng.</p>
        </div>
        <div className="attendance-page__live">
          <span>Hôm nay (server)</span>
          <strong>{todayDate ? formatDate(todayDate) : '...'}</strong>
        </div>
      </header>

      <nav className="attendance-page__tabs">
        <button type="button" className={screen === 'today' ? 'is-active' : ''} onClick={() => setScreen('today')}>
          Hôm nay
        </button>
        <button type="button" className={screen === 'month' ? 'is-active' : ''} onClick={() => setScreen('month')}>
          Theo tháng
        </button>
      </nav>

      <section className="attendance-page__filters">
        {canSelectBranch() && (
          <label>
            <span>Chi nhánh</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Tất cả</option>
              {getActiveBranches().map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Nhân viên</span>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Tất cả</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
        </label>
        {screen === 'month' && (
          <label>
            <span>Tháng</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        )}
      </section>

      <section className="attendance-page__stats">
        <article><span>Tổng</span><strong>{stats.total}</strong></article>
        <article><span>Đúng giờ</span><strong>{stats.onTime}</strong></article>
        <article><span>Đi trễ</span><strong>{stats.late}</strong></article>
        <article><span>Về sớm</span><strong>{stats.early}</strong></article>
        <article><span>Nghỉ có phép</span><strong>{stats.offPermitted}</strong></article>
        <article><span>Nghỉ không phép</span><strong>{stats.offUnpermitted}</strong></article>
        <article><span>T7-CN-Lễ</span><strong>{stats.weekend}</strong></article>
        <article className="is-penalty"><span>Tổng trừ</span><strong>{formatCurrency(stats.totalPenalty)}</strong></article>
      </section>

      {error && <p className="attendance-page__error" role="alert">{error}</p>}
      {loading && <p className="attendance-page__loading">Đang tải dữ liệu chấm công...</p>}

      {!loading && (
        <div className="attendance-page__table-wrap">
          <table className="attendance-page__table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Nhân viên</th>
                <th>Chi nhánh</th>
                <th>Trạng thái</th>
                <th>Lý do</th>
                <th>Tiền trừ</th>
                <th>Giờ điểm danh</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr>
                  <td colSpan={8} className="attendance-page__empty">Chưa có dữ liệu điểm danh.</td>
                </tr>
              )}
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{formatDate(record.date)}</td>
                  <td>{record.employeeName}</td>
                  <td>{getBranchName(record.branchId) || record.branchId}</td>
                  <td>{getAttendanceStatusLabel(record.status)}</td>
                  <td>{record.reason || '—'}</td>
                  <td className="is-money">{formatCurrency(record.penaltyAmount)}</td>
                  <td>{record.submittedAt ? new Date(record.submittedAt).toLocaleTimeString('vi-VN') : '—'}</td>
                  <td>
                    <button type="button" className="attendance-page__edit" onClick={() => setEditingRecord(record)}>
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingRecord && (
        <AttendanceEditModal
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}
