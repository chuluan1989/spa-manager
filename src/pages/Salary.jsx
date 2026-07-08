import { useEffect, useMemo, useState } from 'react'
import PayrollAdjustmentModal from '../components/salary/PayrollAdjustmentModal'
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
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  getScopedBranchId,
  isAdmin,
  isEmployee,
  isBranchManager,
} from '../constants/auth'
import { usePayrollData } from '../hooks/usePayrollData'
import { sortBranchesForPayroll, getPayrollBranchDisplayTitle } from '../constants/branchPayrollDisplay'
import { getActiveBranches, getBranchName } from '../utils/branchStorage'
import { getEmployeeById } from '../utils/employeeStorage'
import { buildWalletTimeline, isPayrollMonthLocked } from '../utils/payrollEngine'
import {
  addPayrollAdjustment,
  lockPayrollMonth,
  unlockPayrollMonth,
} from '../utils/payrollService'
import { aggregateBranchSummaries, mergeEmployeePayrollRows } from '../utils/payrollViewHelpers'
import { getCurrentMonthValue } from '../utils/salaryReport'
import './Salary.css'

const LEVEL = {
  BRANCHES: 'branches',
  EMPLOYEES: 'employees',
  PROFILE: 'profile',
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
  const [month, setMonth] = useState(getCurrentMonthValue())
  const [selectedBranchId, setSelectedBranchId] = useState(getInitialBranchId)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() =>
    (isEmployee() ? getCurrentUserEmployeeId() : ''),
  )
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchBranchId = useMemo(() => {
    if (isEmployee()) return getScopedBranchId(getCurrentUserBranch())
    if (level === LEVEL.BRANCHES) return getScopedBranchId('')
    return getScopedBranchId(selectedBranchId)
  }, [level, selectedBranchId])

  const fetchEmployeeId = useMemo(() => {
    if (level === LEVEL.PROFILE) {
      return isEmployee() ? getCurrentUserEmployeeId() : selectedEmployeeId
    }
    return ''
  }, [level, selectedEmployeeId])

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
  } = usePayrollData({ month, branchId: fetchBranchId, employeeId: fetchEmployeeId })

  const visibleBranches = useMemo(() => {
    const all = sortBranchesForPayroll(getActiveBranches())
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
    }),
    [employees, report.rows, selectedBranchId, search, statusFilter],
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
    return buildWalletTimeline(targetId, invoices, attendance, adjustments)
  }, [selectedEmployeeId, invoices, attendance, adjustments])

  const isLocked = isPayrollMonthLocked(month, fetchBranchId, locks)

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
    setSelectedBranchId(row.branchId)
    setLevel(LEVEL.PROFILE)
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
      if (emp.status === 'inactive' || emp.status === 'archived') return false
      if (fetchBranchId && emp.branchId !== fetchBranchId) return false
      if (isEmployee()) return emp.id === getCurrentUserEmployeeId()
      return true
    }),
    [employees, fetchBranchId],
  )

  return (
    <div className="salary-page erp-page">
      <header className="salary-page__header erp-header">
        <div>
          <h1>Live Payroll</h1>
          <p>Lương cập nhật theo thời gian thực — Hóa đơn, Tips, Chấm công, Thưởng/Phạt.</p>
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
        <label>
          Tháng
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>

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
                <option value="inactive">Nghỉ việc</option>
                <option value="archived">Lưu trữ</option>
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
          <PayrollEmployeeList rows={employeeRows} onSelectEmployee={handleSelectEmployee} />
        </>
      )}

      {!loading && !error && level === LEVEL.PROFILE && profileRow && (
        <PayrollEmployeeProfile
          employee={profileRow}
          stats={profileRow}
          walletEntries={walletEntries}
          invoices={invoices}
          attendance={attendance}
          adjustments={adjustments}
          month={month}
          fromDate={report.fromDate}
          toDate={report.toDate}
          auditLogs={auditLogs}
          locks={locks}
          onReload={reload}
        />
      )}

      {!loading && !error && level === LEVEL.PROFILE && !profileRow && (
        <p className="salary-page__empty">Không tìm thấy hồ sơ lương.</p>
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
    </div>
  )
}
