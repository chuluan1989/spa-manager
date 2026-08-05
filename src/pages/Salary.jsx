import { useEffect, useMemo, useState } from 'react'
import PayrollAdjustmentModal from '../components/salary/PayrollAdjustmentModal'
import PayrollEditBoardModal from '../components/salary/PayrollEditBoardModal'
import PayrollBranchGrid from '../components/salary/PayrollBranchGrid'
import PayrollBreadcrumb from '../components/salary/PayrollBreadcrumb'
import PayrollEmployeeList from '../components/salary/PayrollEmployeeList'
import PayrollEmployeeProfile from '../components/salary/PayrollEmployeeProfile'
import PayrollLiveIndicator from '../components/salary/PayrollLiveIndicator'
import {
  canAccessSalaryPage,
  canLockPayroll,
  canManagePayroll,
  canSelectBranch,
  getCurrentUser,
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  getCurrentUserRole,
  getRecordFetchBranchFilter,
  isAdmin,
  isEmployee,
  isBranchManager,
  ROLES,
} from '../constants/auth'
import { usePayrollData } from '../hooks/usePayrollData'
import { sortBranchesForPayroll, getPayrollBranchDisplayTitle } from '../constants/branchPayrollDisplay'
import { getCanonicalBranchesForDisplay, getBranchName } from '../utils/branchStorage'
import { getEmployeeById, EMPLOYEE_STATUS } from '../utils/employeeStorage'
import { isPayrollListEmployee } from '../utils/branchEmployeeMatch'
import { collectEmployeeIdsWithRecordBranchActivity, employeeCurrentlyAtBranch } from '../utils/employeeBranchTimeline'
import { buildWalletTimeline, isPayrollMonthLocked } from '../utils/payrollEngine'
import {
  addPayrollAdjustment,
  lockPayrollMonth,
  saveAdminPayrollBoardEdits,
  unlockPayrollMonth,
} from '../utils/payrollService'
import { aggregateBranchSummaries, mergeEmployeePayrollRows } from '../utils/payrollViewHelpers'
import {
  getVietnamCurrentMonthValue,
  getDefaultPayCycleForVietnamDate,
  getPrevPayCycle,
  PAY_CYCLES,
} from '../utils/salaryReport'
import PayrollReconciliationActions from '../components/salary/PayrollReconciliationActions'
import PayrollCycleClosePanel from '../components/salary/PayrollCycleClosePanel'
import PayrollCycleCloseAdminPanel from '../components/salary/PayrollCycleCloseAdminPanel'
import { getDefaultCloseCycleSelection } from '../utils/payrollCycleClose/payCycleCalendar'
import { listDuePayrollCloseTargets } from '../utils/payrollCycleClose/closeRemind'
import { getTodayDate } from '../utils/invoiceStorage'
import './Salary.css'

const LEVEL = {
  BRANCHES: 'branches',
  EMPLOYEES: 'employees',
  PROFILE: 'profile',
}

function getPreferredCloseCycleDefaults() {
  const due = listDuePayrollCloseTargets(getTodayDate())[0]
  if (due) return { billingMonth: due.billingMonth, cycle: due.cycle }
  return getDefaultCloseCycleSelection(getTodayDate())
}

function getInitialLevel() {
  if (isEmployee()) return LEVEL.PROFILE
  return LEVEL.BRANCHES
}

function getInitialBranchId() {
  if (isEmployee()) return getEmployeeById(getCurrentUserEmployeeId())?.branchId ?? getCurrentUserBranch()
  if (isAdmin()) return ''
  return getCurrentUserBranch()
}

export default function Salary() {
  if (!canAccessSalaryPage()) {
    return (
      <div className="salary-page">
        <p>Bạn không có quyền truy cập module Lương.</p>
      </div>
    )
  }

  return <SalaryPage />
}

function SalaryPage() {
  const [level, setLevel] = useState(getInitialLevel)
  const [month, setMonth] = useState(getVietnamCurrentMonthValue())
  const [cycle, setCycle] = useState(getDefaultPayCycleForVietnamDate(new Date()))
  const [selectedBranchId, setSelectedBranchId] = useState(getInitialBranchId)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() =>
    (isEmployee() ? getCurrentUserEmployeeId() : ''),
  )
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [editBoardOpen, setEditBoardOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const currentMonth = getVietnamCurrentMonthValue()
  const currentCycle = getDefaultPayCycleForVietnamDate(new Date())

  const formatMonthDisplay = (m) => {
    if (!m) return '—'
    const [y, mm] = m.split('-')
    return `${mm}/${y}`
  }

  const handleCurrentCycle = () => {
    setMonth(currentMonth)
    setCycle(currentCycle)
  }

  const handlePrevCycle = () => {
    const prev = getPrevPayCycle(month, cycle)
    if (prev?.month) setMonth(prev.month)
    if (prev?.cycle) setCycle(prev.cycle)
  }

  const fetchEmployeeId = useMemo(() => {
    // Nhân viên chỉ xem chính mình.
    if (isEmployee()) return getCurrentUserEmployeeId()
    // Admin/QL: luôn tải theo kỳ (employee-wide) để bảng tổng + dropdown khớp chi tiết.
    return ''
  }, [])

  const fetchBranchId = useMemo(() => {
    if (isEmployee()) return ''
    if (level === LEVEL.BRANCHES) return getRecordFetchBranchFilter('')
    return selectedBranchId
  }, [level, selectedBranchId])

  const employeeWide = !isEmployee() && (level === LEVEL.EMPLOYEES || level === LEVEL.PROFILE)
  const keepBranchRoster = !isEmployee() && level === LEVEL.PROFILE

  const {
    employees,
    invoices,
    attendance,
    adjustments,
    locks,
    auditLogs,
    report,
    loading,
    isRefreshing,
    error,
    liveUpdatedAt,
    reload,
  } = usePayrollData({
    month,
    branchId: fetchBranchId,
    employeeId: fetchEmployeeId,
    cycle,
    employeeWide,
    keepBranchRoster,
    rosterBranchId: selectedBranchId,
  })

  const visibleBranches = useMemo(() => {
    const all = sortBranchesForPayroll(getCanonicalBranchesForDisplay())
    if (isAdmin()) return all
    const branchId = getCurrentUserBranch()
    return all.filter((branch) => branch.id === branchId)
  }, [])

  useEffect(() => {
    if (isBranchManager() && !isEmployee() && visibleBranches.length === 1 && level === LEVEL.BRANCHES) {
      setSelectedBranchId(visibleBranches[0].id)
      setLevel(LEVEL.EMPLOYEES)
    }
  }, [visibleBranches, level])

  const branchSummaries = useMemo(
    () => aggregateBranchSummaries(visibleBranches, employees, report.rows),
    [visibleBranches, employees, report.rows],
  )

  const employeeRows = useMemo(
    () => mergeEmployeePayrollRows(employees, report.rows, {
      branchId: selectedBranchId,
      search,
      status: statusFilter,
      // Chỉ NV thuộc chi nhánh nhân sự; net/HH/tips đã employee-wide từ report.
      homeBranchOnly: true,
    }),
    [employees, report.rows, selectedBranchId, search, statusFilter],
  )

  /** Danh sách NV cùng CN để chuyển nhanh trong chi tiết (không phụ thuộc search). */
  const branchPeerRows = useMemo(
    () => mergeEmployeePayrollRows(employees, report.rows, {
      branchId: selectedBranchId,
      status: statusFilter,
      homeBranchOnly: true,
    }),
    [employees, report.rows, selectedBranchId, statusFilter],
  )

  const profileRow = useMemo(() => {
    const targetId = isEmployee() ? getCurrentUserEmployeeId() : selectedEmployeeId
    const fromReport = report.rows.find((row) => row.employeeId === targetId)
    if (fromReport) return fromReport
    const emp = employees.find((e) => e.id === targetId)
    if (!emp) return null
    return mergeEmployeePayrollRows([emp], report.rows)[0]
  }, [report.rows, employees, selectedEmployeeId])

  const walletEntries = useMemo(() => {
    const targetId = isEmployee() ? getCurrentUserEmployeeId() : selectedEmployeeId
    if (!targetId) return []
    const viewBranchId = isEmployee() ? getCurrentUserBranch() : selectedBranchId
    return buildWalletTimeline(targetId, invoices, attendance, adjustments, {
      invoiceBranchId: viewBranchId || '',
    })
  }, [selectedEmployeeId, selectedBranchId, invoices, attendance, adjustments])

  const isLocked = isPayrollMonthLocked(month, fetchBranchId, locks)
  const payrollDebug = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('payrollDebug') === '1'
    || window.localStorage?.getItem('spa-payroll-debug') === '1'
  )
  const adminActionsGate = {
    role: getCurrentUserRole(),
    rolesAdmin: ROLES.ADMIN,
    isAdmin: isAdmin(),
    level,
    levelIsProfile: level === LEVEL.PROFILE,
    profileRow: Boolean(profileRow),
    profileEmployeeId: profileRow?.employeeId || null,
    isLocked,
    loading,
    saving,
    sessionUser: getCurrentUser(),
    wouldRenderAdminActions: isAdmin() && level === LEVEL.PROFILE && Boolean(profileRow),
  }

  const breadcrumbItems = useMemo(() => {
    if (isEmployee()) return []

    const items = [{ id: 'system', label: 'Hệ thống', level: LEVEL.BRANCHES }]
    if (level === LEVEL.BRANCHES) return items

    items.push({
      id: 'branch',
      label: getPayrollBranchDisplayTitle(selectedBranchId, getBranchName(selectedBranchId)),
      level: LEVEL.EMPLOYEES,
      meta: { branchId: selectedBranchId },
    })

    if (level === LEVEL.PROFILE && profileRow) {
      items.push({ id: 'employee', label: profileRow.employeeName, level: null })
    }

    return items
  }, [level, selectedBranchId, profileRow])

  const handleNavigate = (targetLevel, meta = {}) => {
    if (targetLevel === LEVEL.BRANCHES) {
      setLevel(LEVEL.BRANCHES)
      setSelectedBranchId('')
      setSelectedEmployeeId('')
      setSearch('')
      return
    }
    if (targetLevel === LEVEL.EMPLOYEES) {
      setLevel(LEVEL.EMPLOYEES)
      setSelectedBranchId(meta.branchId ?? selectedBranchId)
      setSelectedEmployeeId('')
    }
  }

  const handleSelectBranch = (branchId) => {
    setSelectedBranchId(branchId)
    setLevel(LEVEL.EMPLOYEES)
    setSearch('')
    setStatusFilter('')
  }

  const handleSelectEmployee = (row) => {
    setSelectedEmployeeId(row.employeeId)
    setSelectedBranchId(row.branchId || selectedBranchId || row.homeBranchId)
    setLevel(LEVEL.PROFILE)
  }

  /** Đổi NV trong chi tiết — giữ tháng / kỳ / CN / filter. */
  const handleSwitchEmployee = (employeeId) => {
    if (!employeeId || employeeId === selectedEmployeeId) return
    setSelectedEmployeeId(employeeId)
  }

  const handleAddAdjustment = async (payload) => {
    setSaving(true)
    try {
      await addPayrollAdjustment(payload, locks)
      await reload()
    } catch (err) {
      window.alert(err?.message ?? 'Không thể lưu khoản phát sinh.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEditBoard = async (payload) => {
    setSaving(true)
    try {
      await saveAdminPayrollBoardEdits(payload)
      await reload()
    } catch (err) {
      window.alert(err?.message ?? 'Không thể sửa bảng lương.')
      throw err
    } finally {
      setSaving(false)
    }
  }

  const handleLock = async () => {
    if (!window.confirm(`Chốt lương tháng ${month}? Sau khi chốt không ai được sửa.`)) return
    setSaving(true)
    try {
      await lockPayrollMonth({ month, branchId: fetchBranchId, note: '' })
      await reload()
    } catch (err) {
      window.alert(err?.message ?? 'Không thể chốt lương.')
    } finally {
      setSaving(false)
    }
  }

  const handleUnlock = async () => {
    const reason = window.prompt('Lý do mở khóa lương:')
    if (!reason?.trim()) return
    setSaving(true)
    try {
      await unlockPayrollMonth({ month, branchId: fetchBranchId, reason })
      await reload()
    } catch (err) {
      window.alert(err?.message ?? 'Không thể mở khóa.')
    } finally {
      setSaving(false)
    }
  }

  const scopedEmployeesForModal = useMemo(
    () => employees.filter((emp) => {
      if (!isPayrollListEmployee(emp, '')) return false
      if (fetchBranchId) {
        const activityIds = collectEmployeeIdsWithRecordBranchActivity(fetchBranchId, [
          ...invoices,
          ...attendance,
          ...adjustments,
        ])
        if (!employeeCurrentlyAtBranch(emp, fetchBranchId) && !activityIds.has(emp.id)) return false
      }
      if (isEmployee()) return emp.id === getCurrentUserEmployeeId()
      return true
    }),
    [employees, fetchBranchId, invoices, attendance, adjustments],
  )

  return (
    <div className="salary-page erp-page">
      <header className="salary-page__header erp-header">
        <div>
          <h1>Live Payroll</h1>
          <p>Lương tháng {formatMonthDisplay(month)} — {cycle === PAY_CYCLES.PERIOD_1 ? 'Kỳ 1' : 'Kỳ 2'}</p>
          <p>Lương cập nhật theo thời gian thực — Hóa đơn, Tips, Chấm công, Thưởng/Phạt.</p>
          <p className="salary-page__scope" role="note">
            <strong>Tổng thu nhập toàn kỳ của nhân viên.</strong>
            {' '}Lương thực nhận cộng đủ mọi chi nhánh có phát sinh.
            Danh sách / số hóa đơn trên chi tiết chỉ theo <strong>chi nhánh đang xem</strong>
            (khớp màn Hóa đơn). Kỳ theo <strong>ngày phục vụ (date)</strong> — không dùng created_at.
          </p>
        </div>
        <div className="salary-page__header-actions">
          <PayrollLiveIndicator updatedAt={liveUpdatedAt} isRefreshing={isRefreshing} />
          {isLocked && <span className="salary-page__locked">🔒 Đã chốt lương</span>}
          {canManagePayroll() && !isLocked && level === LEVEL.PROFILE && (
            <button type="button" className="salary-page__btn" onClick={() => setAdjustmentOpen(true)}>
              + Thêm phát sinh
            </button>
          )}
          {canLockPayroll() && !isLocked && (
            <button type="button" className="salary-page__btn salary-page__btn--dark" onClick={handleLock} disabled={saving}>
              🔒 Chốt lương
            </button>
          )}
          {canLockPayroll() && isLocked && (
            <button type="button" className="salary-page__btn" onClick={handleUnlock} disabled={saving}>
              Mở khóa
            </button>
          )}
        </div>
      </header>

      {!isEmployee() && (
        <PayrollBreadcrumb items={breadcrumbItems} onNavigate={handleNavigate} />
      )}

      <div className="salary-page__toolbar">
        {payrollDebug && (
          <pre
            style={{
              flex: '1 1 100%',
              margin: 0,
              padding: 10,
              borderRadius: 10,
              background: '#111',
              color: '#fbbf24',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
            }}
          >
            {`payrollDebug gate\n${JSON.stringify(adminActionsGate, null, 2)}`}
          </pre>
        )}
        <label>
          Tháng
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>

        <label>
          Kỳ lương
          <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
            <option value={PAY_CYCLES.PERIOD_1}>Kỳ 1 (01–15)</option>
            <option value={PAY_CYCLES.PERIOD_2}>Kỳ 2 (16–cuối)</option>
          </select>
        </label>

        <button type="button" className="salary-page__btn salary-page__btn--dark" onClick={handleCurrentCycle}>
          Kỳ hiện tại
        </button>
        <button type="button" className="salary-page__btn" onClick={handlePrevCycle}>
          Kỳ trước
        </button>

        {level === LEVEL.EMPLOYEES && (
          <>
            <label>
              Tìm kiếm
              <input
                type="search"
                placeholder="Tên hoặc SĐT"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Trạng thái
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Đang làm</option>
                <option value={EMPLOYEE_STATUS.RESIGNED}>Nghỉ việc</option>
                <option value={EMPLOYEE_STATUS.ARCHIVED}>Lưu trữ</option>
                <option value="all">Tất cả</option>
              </select>
            </label>
          </>
        )}

        {canSelectBranch() && level === LEVEL.EMPLOYEES && (
          <label>
            Chi nhánh
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value)
                setLevel(LEVEL.EMPLOYEES)
                setSelectedEmployeeId('')
              }}
            >
              {visibleBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}
        <PayrollReconciliationActions
          level={level}
          month={month}
          cycle={cycle}
          branchId={level === LEVEL.EMPLOYEES ? selectedBranchId : fetchBranchId}
          branchName={getPayrollBranchDisplayTitle(selectedBranchId || fetchBranchId, getBranchName(selectedBranchId || fetchBranchId))}
          fromDate={report.fromDate}
          toDate={report.toDate}
          employeeRows={level === LEVEL.EMPLOYEES ? employeeRows : report.rows}
          profileContext={level === LEVEL.PROFILE && profileRow ? {
            employee: employees.find((emp) => emp.id === profileRow.employeeId),
            payrollRow: profileRow,
            invoices,
            attendanceRecords: attendance,
            adjustments,
            month,
            cycle,
            fromDate: report.fromDate,
            toDate: report.toDate,
          } : null}
          disabled={
            loading
            || (level === LEVEL.PROFILE
              ? !profileRow
              : (level === LEVEL.EMPLOYEES ? employeeRows : report.rows).length === 0)
          }
          adminActions={isAdmin() && level === LEVEL.PROFILE && profileRow ? (
            <button
              type="button"
              className="salary-page__btn salary-page__btn--admin"
              disabled={loading || saving || isLocked}
              title={isLocked ? 'Kỳ đã chốt — cần Mở khóa trước khi sửa' : 'Sửa bảng lương Admin'}
              onClick={() => setEditBoardOpen(true)}
            >
              Sửa bảng lương
            </button>
          ) : null}
        />
      </div>

      {loading && <p className="salary-page__loading">Đang tải dữ liệu lương…</p>}
      {error && <p className="salary-page__error">{error}</p>}

      {!loading && !error && level === LEVEL.BRANCHES && (
        <>
          <h2 className="salary-page__section-title">Danh sách chi nhánh</h2>
          <PayrollBranchGrid branches={branchSummaries} onSelectBranch={handleSelectBranch} />
        </>
      )}

      {!loading && !error && level === LEVEL.EMPLOYEES && (
        <>
          <div className="salary-page__section-head">
            <h2>{getPayrollBranchDisplayTitle(selectedBranchId, getBranchName(selectedBranchId))}</h2>
            <span>{employeeRows.length} nhân viên</span>
          </div>
          <p className="salary-page__scope salary-page__scope--inline" role="note">
            Danh sách nhân viên theo chi nhánh nhân sự. Cột lương thực nhận = tổng mọi chi nhánh;
            vào chi tiết thì danh sách hóa đơn chỉ của chi nhánh đang xem.
          </p>
          <PayrollEmployeeList rows={employeeRows} onSelectEmployee={handleSelectEmployee} />
        </>
      )}

      {!loading && !error && level === LEVEL.PROFILE && profileRow && (
        <>
          <p className="salary-page__scope salary-page__scope--inline" role="note">
            Danh sách hóa đơn / ví theo <strong>chi nhánh đang xem</strong>.
            Lương thực nhận vẫn cộng đủ thu nhập mọi chi nhánh (kể cả hỗ trợ liên CN).
          </p>
          <PayrollEmployeeProfile
            employee={profileRow}
            stats={profileRow}
            walletEntries={walletEntries}
            invoices={invoices}
            attendance={attendance}
            adjustments={adjustments}
            month={month}
            cycle={cycle}
            fromDate={report.fromDate}
            toDate={report.toDate}
            auditLogs={auditLogs}
            locks={locks}
            onReload={reload}
            viewBranchId={isEmployee() ? getCurrentUserBranch() : selectedBranchId}
            peerEmployees={isEmployee() ? [] : branchPeerRows}
            onSwitchEmployee={isEmployee() ? undefined : handleSwitchEmployee}
          />
          <PayrollCycleClosePanel
            employeeId={profileRow.employeeId}
            canSubmit={
              isEmployee()
                ? profileRow.employeeId === getCurrentUserEmployeeId()
                : false
            }
            defaultBillingMonth={getPreferredCloseCycleDefaults().billingMonth}
            defaultCycle={getPreferredCloseCycleDefaults().cycle}
          />
        </>
      )}

      {!loading && !error && level === LEVEL.PROFILE && !profileRow && (
        <p className="salary-page__empty">Không tìm thấy hồ sơ lương.</p>
      )}

      {!isEmployee() && (isAdmin() || isBranchManager()) && (
        <PayrollCycleCloseAdminPanel />
      )}

      <PayrollAdjustmentModal
        open={adjustmentOpen}
        onClose={() => setAdjustmentOpen(false)}
        onSubmit={handleAddAdjustment}
        employees={scopedEmployeesForModal}
        defaultMonth={month}
        defaultEmployeeId={isEmployee() ? getCurrentUserEmployeeId() : selectedEmployeeId}
        defaultBranchId={fetchBranchId}
        saving={saving}
      />

      {isAdmin() && profileRow && (
        <PayrollEditBoardModal
          open={editBoardOpen}
          onClose={() => setEditBoardOpen(false)}
          onSave={handleSaveEditBoard}
          employee={employees.find((emp) => emp.id === profileRow.employeeId)}
          payrollRow={profileRow}
          month={month}
          cycle={cycle}
          fromDate={report.fromDate}
          toDate={report.toDate}
          invoices={invoices}
          attendance={attendance}
          adjustments={adjustments}
          locks={locks}
          saving={saving}
        />
      )}
    </div>
  )
}
