import { useEffect, useMemo, useState } from 'react'
import AttendanceCreateModal from '../components/attendance/AttendanceCreateModal'
import AttendanceEditModal from '../components/attendance/AttendanceEditModal'
import AttendanceEmployeeView from '../components/attendance/AttendanceEmployeeView'
import AttendanceEditRequestsPanel from '../components/attendance/AttendanceEditRequestsPanel'
import AttendanceMonthMatrix from '../components/attendance/AttendanceMonthMatrix'
import ErpFilterBar from '../components/erp/ErpFilterBar'
import ErpKpiGrid from '../components/erp/ErpKpiGrid'
import ErpPageHeader from '../components/erp/ErpPageHeader'
import { ATTENDANCE_STATUS_OPTIONS, getAttendancePermitLabel, getAttendanceStatusLabel } from '../constants/attendanceTypes'
import { canAccessAttendancePage, canEditAttendance, canExportReport, canSelectBranch, getCurrentUserBranch, isAdmin, isEmployee } from '../constants/auth'
import { getActiveBranches } from '../constants/branches'
import ExportActions from '../components/common/ExportActions'
import { exportAttendanceCsv } from '../utils/attendanceExport'
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
import {
  AUTO_ABSENT_MISSING_APPLY_FROM_MESSAGE,
  getAttendanceDisplayNote,
  getAttendanceSourceLabel,
  getAutoAbsentConfigGate,
  getAutoAbsentGateMessage,
  isSystemAutoAbsentRecord,
  resolveAutoAbsentSettings,
} from '../utils/autoAbsentAttendance'
import { loadSystemSettings } from '../utils/systemSettingsStorage'
import { runAutoAbsentNightlyJob } from '../utils/autoAbsentAttendanceService'
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
            <th>Nguồn</th>
            <th>Có phép / Không phép</th>
            <th>Lý do</th>
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
              <td colSpan={12} className="attendance-page__empty">{emptyMessage}</td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.key} className={row.record ? '' : 'is-missing'}>
              <td>{formatDate(row.date)}</td>
              <td>{getBranchName(row.branchId) || row.branchId}</td>
              <td>{row.employeeName}</td>
              <td>{row.record ? getAttendanceStatusLabel(row.status) : (row.statusLabel ?? 'Chưa có dữ liệu')}</td>
              <td>{row.record ? getAttendanceSourceLabel(row.record) : '—'}</td>
              <td>{row.record ? getAttendancePermitLabel(row.status) : '—'}</td>
              <td>{row.reason || '—'}</td>
              <td className="is-money">{formatCurrency(row.penaltyAmount ?? 0)}</td>
              <td>{row.record ? (getAttendanceDisplayNote(row.record) || '—') : '—'}</td>
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
  const [screen, setScreen] = useState('records')
  const [todayDate, setTodayDate] = useState('')
  const [month, setMonth] = useState(() => getTodayDate().slice(0, 7))
  const [fromDate, setFromDate] = useState(() => `${getTodayDate().slice(0, 7)}-01`)
  const [toDate, setToDate] = useState(() => getTodayDate())
  const [branchId, setBranchId] = useState(isAdmin() ? '' : getCurrentUserBranch())
  const [employeeId, setEmployeeId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [editingRecord, setEditingRecord] = useState(null)
  const [creating, setCreating] = useState(false)
  const [autoJobBusy, setAutoJobBusy] = useState(false)
  const [autoJobMessage, setAutoJobMessage] = useState('')

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
    const scopedBranch = canSelectBranch() ? branchId : getCurrentUserBranch()
    if (screen === 'today') {
      return {
        date: todayDate || getTodayDate(),
        branchId: scopedBranch,
        employeeId,
        status: statusFilter,
      }
    }
    if (screen === 'month') {
      return {
        fromDate: monthRange.fromDate,
        toDate: monthRange.toDate,
        branchId: scopedBranch,
        employeeId,
        status: statusFilter,
      }
    }
    return {
      fromDate,
      toDate,
      branchId: scopedBranch,
      employeeId,
      status: statusFilter,
    }
  }, [screen, todayDate, monthRange, fromDate, toDate, branchId, employeeId, statusFilter])

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
      statusLabel: row.record ? undefined : 'Chưa có dữ liệu',
    }))
  }, [screen, todayDate, employees, records])

  const monthRows = useMemo(() => {
    if (screen === 'today') return []
    return [...records]
      .sort((a, b) => {
        const dateCompare = String(b.date).localeCompare(String(a.date))
        if (dateCompare !== 0) return dateCompare
        return String(a.employeeName ?? '').localeCompare(String(b.employeeName ?? ''), 'vi')
      })
      .filter((record) => {
        if (sourceFilter === 'system') return isSystemAutoAbsentRecord(record)
        if (sourceFilter === 'manual') return !isSystemAutoAbsentRecord(record)
        if (sourceFilter === 'unpermitted') return String(record.status || '').includes('unpermitted')
        return true
      })
      .map((record) => ({
        key: record.id,
        date: record.date,
        branchId: record.branchId,
        employeeName: record.employeeName ?? '—',
        status: record.status,
        record,
        penaltyAmount: record.penaltyAmount ?? 0,
        note: getAttendanceDisplayNote(record),
        reason: record.reason,
        submittedBy: isSystemAutoAbsentRecord(record)
          ? 'Hệ thống'
          : (record.submittedByName || record.submittedBy),
        updatedAt: record.updatedAt,
        submittedAt: record.submittedAt,
      }))
  }, [screen, records, sourceFilter])

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

  const handleExport = () => {
    if (!canExportReport()) return
    exportAttendanceCsv(records, filters)
  }

  const handleRunAutoAbsent = async () => {
    if (!isAdmin()) return
    setAutoJobBusy(true)
    setAutoJobMessage('')
    try {
      const settings = loadSystemSettings()
      const gate = getAutoAbsentConfigGate(settings)
      if (!gate.ok) {
        setAutoJobMessage(gate.message || getAutoAbsentGateMessage(gate.reason))
        return
      }
      const activeBranchIds = getActiveBranches().map((branch) => branch.id)
      const result = await runAutoAbsentNightlyJob({
        settings,
        employees,
        activeBranchIds,
      })
      setAutoJobMessage(
        result.gateReason
          ? `${getAutoAbsentGateMessage(result.gateReason)} (ngày ${result.targetDate}).`
          : `Đã chốt ngày ${result.targetDate}: tạo ${result.created}, bỏ qua ${result.skipped}.`,
      )
      reload()
    } catch (error) {
      setAutoJobMessage(error?.message ?? 'Không chạy được job tự động.')
    } finally {
      setAutoJobBusy(false)
    }
  }

  const autoAbsentSettings = resolveAutoAbsentSettings(loadSystemSettings())
  const autoAbsentConfigGate = getAutoAbsentConfigGate(autoAbsentSettings)
  const showMissingApplyFromWarning = autoAbsentSettings.autoAbsentEnabled
    && !autoAbsentSettings.autoAbsentApplyFrom

  const applyMonthRange = () => {
    setFromDate(`${month}-01`)
    const [yearStr, monthStr] = month.split('-')
    const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate()
    setToDate(`${month}-${String(lastDay).padStart(2, '0')}`)
  }

  return (
    <div className="attendance-page erp-page">
      <ErpPageHeader
        title="Chấm công"
        subtitle="Điểm danh realtime — lọc theo ngày, tháng, chi nhánh và nhân viên."
        badge={{ value: todayDate ? formatDate(todayDate) : '…', label: 'Hôm nay' }}
        actions={<ExportActions onExportExcel={handleExport} disabled={loading || records.length === 0} />}
      />

      <ErpFilterBar>
        <label>
          Tháng
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value)
              if (screen === 'records') {
                const nextMonth = e.target.value
                setFromDate(`${nextMonth}-01`)
                const [y, m] = nextMonth.split('-')
                const lastDay = new Date(Number(y), Number(m), 0).getDate()
                setToDate(`${nextMonth}-${String(lastDay).padStart(2, '0')}`)
              }
            }}
          />
        </label>
        {screen === 'records' && (
          <>
            <label>
              Từ ngày
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label>
              Đến ngày
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </>
        )}
      </ErpFilterBar>

      <nav className="attendance-page__tabs">
        <button type="button" className={screen === 'records' ? 'is-active' : ''} onClick={() => setScreen('records')}>
          Toàn hệ thống
        </button>
        <button type="button" className={screen === 'today' ? 'is-active' : ''} onClick={() => setScreen('today')}>
          Theo ngày
        </button>
        <button type="button" className={screen === 'month' ? 'is-active' : ''} onClick={() => { setScreen('month'); applyMonthRange() }}>
          Theo tháng
        </button>
        <button type="button" className={screen === 'requests' ? 'is-active' : ''} onClick={() => setScreen('requests')}>
          Yêu cầu chỉnh sửa
        </button>
      </nav>

      {screen === 'requests' ? (
        <AttendanceEditRequestsPanel />
      ) : (
        <>
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
        <label>
          <span>Trạng thái</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tất cả</option>
            {ATTENDANCE_STATUS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Nguồn / lọc nhanh</span>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">Tất cả nguồn</option>
            <option value="system">Tự động ghi nhận</option>
            <option value="manual">Nhân viên / Admin</option>
            <option value="unpermitted">Nghỉ không phép</option>
          </select>
        </label>
        {canEditAttendance(branchId || getCurrentUserBranch()) && (
          <button type="button" className="attendance-page__add" onClick={() => setCreating(true)}>
            + Thêm chấm công
          </button>
        )}
        {isAdmin() && (
          <button
            type="button"
            className="attendance-page__add"
            disabled={autoJobBusy || !autoAbsentConfigGate.ok}
            onClick={handleRunAutoAbsent}
            title={!autoAbsentConfigGate.ok ? autoAbsentConfigGate.message : undefined}
          >
            {autoJobBusy ? 'Đang chốt...' : 'Chốt nghỉ không phép (hôm qua)'}
          </button>
        )}
      </section>

      {isAdmin() && showMissingApplyFromWarning && (
        <p className="attendance-page__error" role="alert">
          {AUTO_ABSENT_MISSING_APPLY_FROM_MESSAGE}
        </p>
      )}
      {autoJobMessage && <p className="attendance-page__loading">{autoJobMessage}</p>}

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

      {!loading && (screen === 'month' || screen === 'records') && (
        <>
          <AttendanceRecordsTable
            rows={monthRows}
            emptyMessage="Chưa có bản ghi chấm công trong phạm vi lọc."
            onEdit={setEditingRecord}
            onCreate={() => setCreating(true)}
            canEditRow={canEditAttendance}
          />
          {screen === 'month' && (
            <>
              <h2 className="erp-section-title">Ma trận tháng</h2>
              <AttendanceMonthMatrix days={monthMatrix.days} rows={monthMatrix.rows} />
            </>
          )}
        </>
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
