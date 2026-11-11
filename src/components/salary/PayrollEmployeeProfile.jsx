import { useMemo, useState } from 'react'
import {
  buildInvoiceRevenueList,
  buildTipsBreakdown,
  computeAttendanceStats,
} from '../../utils/payrollLiveHelpers'
import PayrollAuditHistory from './PayrollAuditHistory'
import {
  PayrollRevenuePanel,
  PayrollTipsPanel,
} from './PayrollDetailPanels'
import PayrollOverview from './PayrollOverview'
import PayrollPayslipPanel from './PayrollPayslipPanel'
import PayrollWallet from './PayrollWallet'
import { computeAttendanceLeaveBreakdown } from '../../utils/attendancePenalties'
import { getAttendanceHolidayDates } from '../../utils/attendanceHolidayDates'

const PROFILE_VIEWS = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'wallet', label: 'Ví lương' },
  { id: 'revenue', label: 'Doanh thu' },
  { id: 'tips', label: 'Tips' },
  { id: 'audit', label: 'Nhật ký' },
  { id: 'payslip', label: 'Phiếu lương' },
]

function EmployeeSwitcher({ peers, currentId, onSwitch }) {
  const [query, setQuery] = useState('')
  if (!Array.isArray(peers) || peers.length === 0 || typeof onSwitch !== 'function') return null

  const filtered = peers.filter((peer) => {
    if (!query.trim()) return true
    return String(peer.employeeName ?? '').toLowerCase().includes(query.trim().toLowerCase())
  })

  return (
    <aside className="salary-profile__switcher" aria-label="Chọn nhân viên cùng chi nhánh">
      <div className="salary-profile__switcher-head">
        <strong>Nhân viên cùng chi nhánh</strong>
        <input
          type="search"
          className="salary-profile__switcher-search"
          placeholder="Tìm tên…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <ul className="salary-profile__switcher-list">
        {filtered.map((peer) => {
          const active = peer.employeeId === currentId
          return (
            <li key={peer.employeeId}>
              <button
                type="button"
                className={active ? 'is-active' : ''}
                onClick={() => onSwitch(peer.employeeId)}
              >
                <span>{peer.employeeName}</span>
                {active ? <em>Đang xem</em> : null}
              </button>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className="salary-profile__switcher-empty">Không có nhân viên khớp.</li>
        )}
      </ul>
    </aside>
  )
}

export default function PayrollEmployeeProfile({
  employee,
  stats,
  walletEntries,
  invoices,
  attendance,
  adjustments,
  month,
  cycle,
  fromDate,
  toDate,
  auditLogs,
  locks,
  onReload,
  viewBranchId = '',
  peerEmployees = [],
  onSwitchEmployee,
}) {
  const [view, setView] = useState('overview')
  const [payslipOpen, setPayslipOpen] = useState(false)

  const employeeId = employee?.employeeId

  const attendanceStats = useMemo(
    () => computeAttendanceStats(attendance ?? [], employeeId),
    [attendance, employeeId],
  )

  const attendanceUnitBreakdown = useMemo(() => {
    if (!attendance || !employeeId) return null
    const rows = attendance.filter((row) => row && row.employeeId === employeeId)
    return computeAttendanceLeaveBreakdown(rows, { holidays: getAttendanceHolidayDates() })
  }, [attendance, employeeId])

  const revenueRows = useMemo(
    () => buildInvoiceRevenueList(invoices ?? [], employeeId, viewBranchId),
    [invoices, employeeId, viewBranchId],
  )

  const tipsRows = useMemo(
    () => buildTipsBreakdown(invoices ?? [], employeeId, viewBranchId),
    [invoices, employeeId, viewBranchId],
  )

  const payslip = stats ? { ...stats, month, fromDate, toDate } : null

  return (
    <div className="salary-profile-layout">
      <EmployeeSwitcher
        peers={peerEmployees}
        currentId={employeeId}
        onSwitch={onSwitchEmployee}
      />
      <section className="salary-profile">
      {view !== 'overview' && (
        <PayrollWallet entries={[]} employee={employee} stats={stats} mode="header" />
      )}

      <nav className="salary-profile__tabs">
        {PROFILE_VIEWS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={view === tab.id ? 'is-active' : ''}
            onClick={() => {
              setView(tab.id)
              if (tab.id === 'payslip') setPayslipOpen(true)
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {view === 'overview' && (
        <div className="salary-profile__overview">
          <PayrollOverview
            employee={employee}
            stats={stats}
            attendanceStats={attendanceStats}
            breakdown={attendanceUnitBreakdown}
            cycle={cycle}
            month={month}
            fromDate={fromDate}
            toDate={toDate}
            locks={locks}
            viewBranchId={viewBranchId}
          />
        </div>
      )}

      {view === 'wallet' && (
        <PayrollWallet entries={walletEntries} employee={null} stats={null} mode="timeline" />
      )}

      {view === 'revenue' && (
        <PayrollRevenuePanel rows={revenueRows} />
      )}

      {view === 'tips' && (
        <PayrollTipsPanel rows={tipsRows} />
      )}

      {view === 'audit' && (
        <PayrollAuditHistory
          logs={auditLogs.filter((log) => {
            if (log.entityType === 'payroll_field' || log.entityType === 'payroll_board') {
              return log.entityId === employeeId
            }
            if (log.entityType === 'payroll_adjustment') {
              const empId = log.newValue?.employeeId || log.oldValue?.employeeId
              if (empId) return empId === employeeId
              return adjustments.some((adj) => adj.id === log.entityId && adj.employeeId === employeeId)
            }
            return false
          })}
        />
      )}

      {view === 'payslip' && payslip && (
        <div className="salary-profile__payslip-inline">
          <button type="button" className="salary-page__btn salary-page__btn--dark" onClick={() => setPayslipOpen(true)}>
            Mở phiếu lương
          </button>
        </div>
      )}

      {payslipOpen && payslip && (
        <PayrollPayslipPanel payslip={payslip} onClose={() => setPayslipOpen(false)} />
      )}
      </section>
    </div>
  )
}
