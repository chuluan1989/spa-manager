import { useMemo, useState } from 'react'
import PayrollAdjustmentModal from '../components/salary/PayrollAdjustmentModal'
import PayrollAuditHistory from '../components/salary/PayrollAuditHistory'
import PayrollDashboard from '../components/salary/PayrollDashboard'
import PayrollDetailModal from '../components/salary/PayrollDetailModal'
import PayrollFilters from '../components/salary/PayrollFilters'
import PayrollPayslipPanel from '../components/salary/PayrollPayslipPanel'
import PayrollTable from '../components/salary/PayrollTable'
import PayrollWallet from '../components/salary/PayrollWallet'
import {
  canAccessSalaryPage,
  canLockPayroll,
  canManagePayroll,
  canSelectBranch,
  getCurrentUserBranch,
  getScopedBranchId,
  getScopedEmployeeId,
  isAdmin,
} from '../constants/auth'
import { PAYROLL_DETAIL_CATEGORIES, PAYROLL_DETAIL_LABELS } from '../constants/payrollTypes'
import { usePayrollData } from '../hooks/usePayrollData'
import { buildWalletTimeline, filterWalletByCategory, isPayrollMonthLocked } from '../utils/payrollEngine'
import {
  addPayrollAdjustment,
  lockPayrollMonth,
  unlockPayrollMonth,
} from '../utils/payrollService'
import { getBranchName } from '../utils/branchStorage'
import './Salary.css'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'table', label: 'Bảng lương' },
  { id: 'wallet', label: 'Ví nhân viên' },
  { id: 'history', label: 'Lịch sử điều chỉnh' },
]

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
  const [tab, setTab] = useState('dashboard')
  const [month, setMonth] = useState(getCurrentMonthValue())
  const [branchId, setBranchId] = useState(isAdmin() ? '' : getCurrentUserBranch())
  const [employeeId, setEmployeeId] = useState(getScopedEmployeeId(''))
  const [walletEmployeeId, setWalletEmployeeId] = useState(getScopedEmployeeId(''))
  const [detailModal, setDetailModal] = useState(null)
  const [payslipRow, setPayslipRow] = useState(null)
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const scopedBranch = getScopedBranchId(branchId)
  const scopedEmployee = getScopedEmployeeId(employeeId)

  const {
    employees,
    invoices,
    attendance,
    adjustments,
    locks,
    auditLogs,
    report,
    loading,
    error,
    reload,
  } = usePayrollData({ month, branchId: scopedBranch, employeeId: scopedEmployee })

  const scopedEmployees = useMemo(
    () => employees.filter((emp) => {
      if (emp.status === 'inactive' || emp.status === 'archived') return false
      if (scopedBranch && emp.branchId !== scopedBranch) return false
      if (scopedEmployee && emp.id !== scopedEmployee) return false
      return true
    }),
    [employees, scopedBranch, scopedEmployee],
  )

  const isLocked = isPayrollMonthLocked(month, scopedBranch, locks)

  const walletEmployee = useMemo(() => {
    const row = report.rows.find((r) => r.employeeId === walletEmployeeId)
    if (row) return row
    const emp = scopedEmployees.find((e) => e.id === walletEmployeeId)
    if (!emp) return null
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      branchName: getBranchName(emp.branchId) || '—',
      position: emp.position,
      avatar: emp.avatar,
    }
  }, [report.rows, walletEmployeeId, scopedEmployees])

  const walletEntries = useMemo(() => {
    if (!walletEmployeeId) return []
    return buildWalletTimeline(walletEmployeeId, invoices, attendance, adjustments)
  }, [walletEmployeeId, invoices, attendance, adjustments])

  const handleCellClick = (row, category) => {
    const entries = filterWalletByCategory(
      buildWalletTimeline(row.employeeId, invoices, attendance, adjustments),
      category,
    )
    if (category === PAYROLL_DETAIL_CATEGORIES.BASE) {
      setDetailModal({
        title: `${PAYROLL_DETAIL_LABELS.baseSalary} · ${row.employeeName}`,
        entries: [{ id: 'base', label: 'Lương cơ bản', amount: row.baseSalary, date: `${month}-01`, createdBy: 'Hệ thống' }],
        total: row.baseSalary,
      })
      return
    }
    if (category === PAYROLL_DETAIL_CATEGORIES.NET) {
      setDetailModal({
        title: `Lương thực nhận · ${row.employeeName}`,
        entries: filterWalletByCategory(
          buildWalletTimeline(row.employeeId, invoices, attendance, adjustments),
          '',
        ),
        total: row.netSalary,
      })
      return
    }
    setDetailModal({
      title: `${PAYROLL_DETAIL_LABELS[category] ?? category} · ${row.employeeName}`,
      entries,
      total: row[category],
    })
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
      await lockPayrollMonth({ month, branchId: scopedBranch, note: '' })
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
      await unlockPayrollMonth({ month, branchId: scopedBranch, reason })
      await reload()
    } catch (err) {
      window.alert(err?.message ?? 'Không thể mở khóa.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="salary-page">
      <header className="salary-page__header">
        <div>
          <h1>Lương</h1>
          <p>HRM lương — đồng bộ hóa đơn, chấm công, tips và điều chỉnh thủ công.</p>
        </div>
        <div className="salary-page__header-actions">
          {isLocked && <span className="salary-page__locked">🔒 Đã chốt lương</span>}
          {canManagePayroll() && !isLocked && (
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

      <nav className="salary-page__tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'is-active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <PayrollFilters
        month={month}
        branchId={scopedBranch}
        employeeId={scopedEmployee}
        onMonthChange={setMonth}
        onBranchChange={canSelectBranch() ? setBranchId : undefined}
        onEmployeeChange={setEmployeeId}
      />

      {tab === 'wallet' && (
        <div className="salary-page__wallet-picker">
          <label>
            Nhân viên (ví)
            <select value={walletEmployeeId} onChange={(e) => setWalletEmployeeId(e.target.value)}>
              <option value="">— Chọn nhân viên —</option>
              {scopedEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {loading && <p className="salary-page__loading">Đang tải dữ liệu lương…</p>}
      {error && <p className="salary-page__error">{error}</p>}

      {!loading && !error && tab === 'dashboard' && (
        <PayrollDashboard dashboard={report.dashboard} employeeCount={report.dashboard.employeeCount} />
      )}

      {!loading && !error && tab === 'table' && (
        <PayrollTable
          rows={report.rows}
          onCellClick={handleCellClick}
          onRowSelect={(row) => {
            setPayslipRow({ ...row, month, fromDate: report.fromDate, toDate: report.toDate })
          }}
          selectedEmployeeId={walletEmployeeId}
        />
      )}

      {!loading && !error && tab === 'wallet' && (
        <PayrollWallet
          entries={walletEntries}
          employee={walletEmployee}
          stats={report.rows.find((r) => r.employeeId === walletEmployeeId)}
        />
      )}

      {!loading && !error && tab === 'history' && (
        <PayrollAuditHistory
          logs={auditLogs}
          adjustments={adjustments}
          locks={locks}
          onReload={reload}
        />
      )}

      <PayrollDetailModal
        open={Boolean(detailModal)}
        onClose={() => setDetailModal(null)}
        title={detailModal?.title ?? ''}
        entries={detailModal?.entries ?? []}
        total={detailModal?.total}
      />

      <PayrollPayslipPanel payslip={payslipRow} onClose={() => setPayslipRow(null)} />

      <PayrollAdjustmentModal
        open={adjustmentOpen}
        onClose={() => setAdjustmentOpen(false)}
        onSubmit={handleAddAdjustment}
        employees={scopedEmployees}
        defaultMonth={month}
        defaultEmployeeId={scopedEmployee}
        defaultBranchId={scopedBranch}
        saving={saving}
      />
    </div>
  )
}
