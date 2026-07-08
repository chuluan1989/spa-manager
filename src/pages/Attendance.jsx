import { useEffect, useMemo, useState } from 'react'
import AttendanceCreateModal from '../components/attendance/AttendanceCreateModal'
import AttendanceEditModal from '../components/attendance/AttendanceEditModal'
import AttendanceEmployeeView from '../components/attendance/AttendanceEmployeeView'
import AttendanceMonthMatrix from '../components/attendance/AttendanceMonthMatrix'
import ErpFilterBar from '../components/erp/ErpFilterBar'
import ErpKpiGrid from '../components/erp/ErpKpiGrid'
import ErpPageHeader from '../components/erp/ErpPageHeader'
import {
  canAccessAttendancePage,
  canEditAttendance,
  canSelectBranch,
  getCurrentUserBranch,
  isAdmin,
  isEmployee,
} from '../constants/auth'
import { getActiveBranches } from '../constants/branches'
import { getAttendancePermitLabel, getAttendanceStatusLabel } from '../constants/attendanceTypes'
import { isEmployeeLoginEligible, loadEmployees } from '../utils/employeeStorage'
import { formatCurrency } from '../utils/invoice'
import { getTodayDate } from '../utils/invoiceStorage'
import { useAttendanceData } from '../hooks/useAttendanceData'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import { buildAttendanceStats } from '../utils/attendancePenalties'
import { getBranchName } from '../utils/branchStorage'
import {
  buildAttendanceDayRoster,
  buildAttendanceMonthMatrix,
} from '../utils/attendanceViewHelpers'
import { fetchAttendanceServerDate } from '../repositories/attendanceRepository'
import './Attendance.css'

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

function AttendanceRecordsTable({
  rows,
  emptyMessage,
  onEdit,
  onCreate,
  canEditRow,
}) {
  return (
    <div className="attendance-page__table-wrap">
      <table className="attendance-page__table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Chi nhánh</th>
            <th>Nhân viên</th>
            <th>Trạng thái</th>
            <th>Có phép / Không phép</th>
            <th>Số tiền phạt</th>
            <th>Ghi chú</th>
            <th>Người cập nhật</th>
            <th>Thời gian cập nhật</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="attendance-page__empty">{emptyMessage}</td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.key} className={row.record ? '' : 'is-missing'}>
              <td>{formatDate(row.date)}</td>
              <td>{getBranchName(row.branchId) || row.branchId}</td>
              <td>{row.employeeName}</td>
              <td>{row.record ? getAttendanceStatusLabel(row.status) : (row.statusLabel ?? 'Chưa chấm công')}</td>
              <td>{row.record ? getAttendancePermitLabel(row.status) : '—'}</td>
              <td className="is-money">{formatCurrency(row.penaltyAmount ?? 0)}</td>
              <td>{row.note || row.reason || '—'}</td>
              <td>{row.submittedBy || '—'}</td>
              <td>{formatDateTime(row.updatedAt || row.submittedAt)}</td>
              <td>
                {row.record ? (
                  <button type="button" className="attendance-page__edit" onClick={() => onEdit(row.record)}>
                    Chi tiết
                  </button>
                ) : (
                  <button
                    type="button"
                    className="attendance-page__edit"
                    onClick={onCreate}
                    disabled={!canEditRow(row.branchId)}
                  >
                    Thêm
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Attendance() {
  if (isEmployee()) {
    return <AttendanceEmployeeView />
  }

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
  const syncVersion = useDataSyncVersion()
  const [screen, setScreen] = useState('today')
  const [todayDate, setTodayDate] = useState('')
  const [month, setMonth] = useState(() => getTodayDate().slice(0, 7))
  const [branchId, setBranchId] = useState(isAdmin() ? '' : getCurrentUserBranch())
  const [employeeId, setEmployeeId] = useState('')
  const [editingRecord, setEditingRecord] = useState(null)
  const [creating, setCreating] = useState(false)

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
    return loadEmployees().filter((employee) => {
      if (!isEmployeeLoginEligible(employee)) return false
      return !scopedBranch || employee.branchId === scopedBranch
    })
  }, [branchId, syncVersion])

  const dayRoster = useMemo(() => {
    if (screen !== 'today') return []
    const targetDate = todayDate || getTodayDate()
    return buildAttendanceDayRoster(employees, records, targetDate).map((row) => ({
      ...row,
      key: row.employeeId,
    }))
  }, [screen, todayDate, employees, records])

  const monthRows = useMemo(() => {
    if (screen !== 'month') return []
    return [...records]
      .sort((a, b) => {
        const dateCompare = String(b.date).localeCompare(String(a.date))
        if (dateCompare !== 0) return dateCompare
        return String(a.employeeName ?? '').localeCompare(String(b.employeeName ?? ''), 'vi')
      })
      .map((record) => ({
        key: record.id,
        date: record.date,
        branchId: record.branchId,
        employeeName: record.employeeName ?? '—',
        status: record.status,
        record,
        penaltyAmount: record.penaltyAmount ?? 0,
        note: record.note,
        reason: record.reason,
        submittedBy: record.submittedByName || record.submittedBy,
        updatedAt: record.updatedAt,
        submittedAt: record.submittedAt,
      }))
  }, [screen, records])

  const monthMatrix = useMemo(
    () => buildAttendanceMonthMatrix(employees, records, month),
    [employees, records, month],
  )

  const kpiItems = useMemo(() => [
    { label: 'Tổng điểm danh', value: stats.total },
    { label: 'Đúng giờ', value: stats.onTime, tone: 'green' },
    { label: 'Đi trễ', value: stats.late, tone: 'penalty' },
    { label: 'Tổng phạt', value: formatCurrency(stats.totalPenalty), tone: 'penalty' },
  ], [stats])

  return (
    <div className="attendance-page erp-page">
      <ErpPageHeader
        title="Chấm công"
        subtitle="Điểm danh realtime — lọc theo ngày, tháng, chi nhánh và nhân viên."
        badge={{ value: todayDate ? formatDate(todayDate) : '…', label: 'Hôm nay' }}
      />

      <ErpFilterBar>
        <label>
          Tháng
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </ErpFilterBar>

      <nav className="attendance-page__tabs">
        <button type="button" className={screen === 'today' ? 'is-active' : ''} onClick={() => setScreen('today')}>
          Theo ngày
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
        {canEditAttendance(branchId || getCurrentUserBranch()) && (
          <button type="button" className="attendance-page__add" onClick={() => setCreating(true)}>
            + Thêm chấm công
          </button>
        )}
      </section>

      <ErpKpiGrid items={kpiItems} />

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

      {!loading && screen === 'today' && (
        <AttendanceRecordsTable
          rows={dayRoster}
          emptyMessage="Chưa có nhân viên trong phạm vi."
          onEdit={setEditingRecord}
          onCreate={() => setCreating(true)}
          canEditRow={canEditAttendance}
        />
      )}

      {!loading && screen === 'month' && (
        <>
          <AttendanceRecordsTable
            rows={monthRows}
            emptyMessage="Chưa có bản ghi chấm công trong tháng này."
            onEdit={setEditingRecord}
            onCreate={() => setCreating(true)}
            canEditRow={canEditAttendance}
          />
          <h2 className="erp-section-title">Ma trận tháng</h2>
          <AttendanceMonthMatrix days={monthMatrix.days} rows={monthMatrix.rows} />
        </>
      )}

      {creating && (
        <AttendanceCreateModal
          employees={employees}
          defaultBranchId={branchId || getCurrentUserBranch()}
          defaultDate={todayDate || getTodayDate()}
          onClose={() => setCreating(false)}
          onSaved={reload}
        />
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
