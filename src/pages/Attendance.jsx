import { useEffect, useMemo, useState } from 'react'
import AttendanceCreateModal from '../components/attendance/AttendanceCreateModal'
import AttendanceEditModal from '../components/attendance/AttendanceEditModal'
import AttendanceEmployeeView from '../components/attendance/AttendanceEmployeeView'
import AttendanceMonthMatrix from '../components/attendance/AttendanceMonthMatrix'
import ErpBranchCardGrid from '../components/erp/ErpBranchCardGrid'
import ErpBreadcrumb from '../components/erp/ErpBreadcrumb'
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
import { buildAttendanceStats } from '../utils/attendancePenalties'
import { getBranchName } from '../utils/branchStorage'
import {
  aggregateAttendanceBranchSummaries,
  buildAttendanceDayRoster,
  buildAttendanceMonthMatrix,
  formatAttendanceBranchStats,
} from '../utils/attendanceViewHelpers'
import { fetchAttendanceServerDate } from '../repositories/attendanceRepository'
import './Attendance.css'

const LEVEL = { BRANCHES: 'branches', DETAIL: 'detail' }

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
  const [level, setLevel] = useState(isAdmin() ? LEVEL.BRANCHES : LEVEL.DETAIL)
  const [screen, setScreen] = useState('month')
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

  const overviewFilters = useMemo(() => ({
    fromDate: monthRange.fromDate,
    toDate: monthRange.toDate,
    branchId: '',
    employeeId: '',
  }), [monthRange])

  const { records: allRecords, loading: overviewLoading } = useAttendanceData(
    level === LEVEL.BRANCHES ? overviewFilters : { fromDate: '', toDate: '', branchId: '', employeeId: '' },
  )

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

  const { records, loading, error, reload } = useAttendanceData(
    level === LEVEL.DETAIL ? filters : { fromDate: '', toDate: '', branchId: '', employeeId: '' },
  )

  const stats = useMemo(() => buildAttendanceStats(records), [records])
  const overviewStats = useMemo(() => buildAttendanceStats(allRecords), [allRecords])

  const visibleBranches = useMemo(() => {
    const all = getActiveBranches()
    if (isAdmin()) return all
    return all.filter((b) => b.id === getCurrentUserBranch())
  }, [])

  const branchSummaries = useMemo(
    () => aggregateAttendanceBranchSummaries(visibleBranches, allRecords),
    [visibleBranches, allRecords],
  )

  const employees = useMemo(() => {
    const scopedBranch = canSelectBranch() ? branchId : getCurrentUserBranch()
    return loadEmployees().filter((employee) => {
      if (!isEmployeeLoginEligible(employee)) return false
      return !scopedBranch || employee.branchId === scopedBranch
    })
  }, [branchId])

  const dayRoster = useMemo(() => {
    if (screen !== 'today') return []
    const targetDate = todayDate || getTodayDate()
    return buildAttendanceDayRoster(employees, records, targetDate)
  }, [screen, todayDate, employees, records])

  const monthMatrix = useMemo(
    () => buildAttendanceMonthMatrix(employees, records, month),
    [employees, records, month],
  )

  const breadcrumbItems = useMemo(() => {
    const items = [{ id: 'att', label: 'Chấm công', onClick: () => { setLevel(LEVEL.BRANCHES); setBranchId('') } }]
    if (level === LEVEL.BRANCHES) return items
    items.push({ id: 'branch', label: getBranchName(branchId) || 'Chi nhánh' })
    return items
  }, [level, branchId])

  const kpiItems = useMemo(() => [
    { label: 'Tổng điểm danh', value: overviewStats.total },
    { label: 'Đúng giờ', value: overviewStats.onTime, tone: 'green' },
    { label: 'Đi trễ', value: overviewStats.late, tone: 'penalty' },
    { label: 'Tổng phạt', value: formatCurrency(overviewStats.totalPenalty), tone: 'penalty' },
  ], [overviewStats])

  return (
    <div className="attendance-page erp-page">
      <ErpPageHeader
        title="Chấm công"
        subtitle="Điểm danh realtime — Tổng quan → Chi nhánh → Chi tiết điểm danh."
        badge={{ value: todayDate ? formatDate(todayDate) : '…', label: 'Hôm nay' }}
      />

      {isAdmin() && <ErpBreadcrumb items={breadcrumbItems} />}

      <ErpFilterBar>
        <label>
          Tháng
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </ErpFilterBar>

      {level === LEVEL.BRANCHES && isAdmin() && (
        <>
          <ErpKpiGrid items={kpiItems} />
          <h2 className="erp-section-title">Chi nhánh</h2>
          {overviewLoading ? (
            <p className="erp-loading">Đang tải...</p>
          ) : (
            <ErpBranchCardGrid
              branches={branchSummaries}
              onSelectBranch={(id) => {
                setBranchId(id)
                setLevel(LEVEL.DETAIL)
              }}
              renderStat={formatAttendanceBranchStats}
            />
          )}
        </>
      )}

      {level === LEVEL.DETAIL && (
        <>
          <nav className="attendance-page__tabs">
            <button type="button" className={screen === 'today' ? 'is-active' : ''} onClick={() => setScreen('today')}>
              Hôm nay
            </button>
            <button type="button" className={screen === 'month' ? 'is-active' : ''} onClick={() => setScreen('month')}>
              Theo tháng
            </button>
          </nav>

          <section className="attendance-page__filters">
            {canSelectBranch() && level === LEVEL.DETAIL && (
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

          {!loading && screen === 'month' && (
            <AttendanceMonthMatrix days={monthMatrix.days} rows={monthMatrix.rows} />
          )}

          {!loading && screen === 'today' && (
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
                  {dayRoster.length === 0 && (
                    <tr>
                      <td colSpan={10} className="attendance-page__empty">Chưa có nhân viên trong phạm vi.</td>
                    </tr>
                  )}
                  {dayRoster.map((row) => (
                    <tr key={row.employeeId} className={row.record ? '' : 'is-missing'}>
                      <td>{formatDate(row.date)}</td>
                      <td>{getBranchName(row.branchId) || row.branchId}</td>
                      <td>{row.employeeName}</td>
                      <td>{row.record ? getAttendanceStatusLabel(row.status) : 'Chưa chấm công'}</td>
                      <td>{row.record ? getAttendancePermitLabel(row.status) : '—'}</td>
                      <td className="is-money">{formatCurrency(row.penaltyAmount)}</td>
                      <td>{row.note || row.reason || '—'}</td>
                      <td>{row.submittedBy || '—'}</td>
                      <td>{formatDateTime(row.updatedAt || row.submittedAt)}</td>
                      <td>
                        {row.record ? (
                          <button type="button" className="attendance-page__edit" onClick={() => setEditingRecord(row.record)}>
                            Chi tiết
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="attendance-page__edit"
                            onClick={() => setCreating(true)}
                            disabled={!canEditAttendance(row.branchId)}
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
          )}
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
