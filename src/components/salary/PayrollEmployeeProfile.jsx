import { useMemo, useState } from 'react'
import { PAYROLL_ADJUSTMENT_TYPES, PAYROLL_DETAIL_CATEGORIES, PAYROLL_WALLET_SOURCE } from '../../constants/payrollTypes'
import {
  buildAdjustmentHistory,
  buildInvoiceRevenueList,
  buildTipsBreakdown,
  computeAttendanceStats,
} from '../../utils/payrollLiveHelpers'
import { filterWalletByCategory } from '../../utils/payrollEngine'
import PayrollAuditHistory from './PayrollAuditHistory'
import PayrollAttendanceStats, {
  PayrollAdjustmentHistory,
  PayrollRevenuePanel,
  PayrollTipsPanel,
} from './PayrollDetailPanels'
import PayrollLiveDashboard from './PayrollLiveDashboard'
import PayrollPayslipPanel from './PayrollPayslipPanel'
import PayrollWallet from './PayrollWallet'

const PROFILE_VIEWS = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'wallet', label: 'Ví lương' },
  { id: 'revenue', label: 'Doanh thu' },
  { id: 'tips', label: 'Tips' },
  { id: 'audit', label: 'Nhật ký' },
  { id: 'payslip', label: 'Phiếu lương' },
]

const HISTORY_TABS = [
  { id: 'all', label: 'Tất cả', category: '' },
  { id: 'commission', label: 'Hoa hồng', category: PAYROLL_DETAIL_CATEGORIES.COMMISSION },
  { id: 'tips', label: 'Tips', category: PAYROLL_DETAIL_CATEGORIES.TIPS },
  { id: 'bonus', label: 'Thưởng', category: PAYROLL_ADJUSTMENT_TYPES.BONUS },
  { id: 'penalty', label: 'Phạt', category: PAYROLL_ADJUSTMENT_TYPES.PENALTY },
  { id: 'advance', label: 'Ứng lương', category: PAYROLL_ADJUSTMENT_TYPES.ADVANCE },
  { id: 'reduction', label: 'Giảm lương', category: PAYROLL_ADJUSTMENT_TYPES.REDUCTION },
  { id: 'adjustment', label: 'Điều chỉnh', category: PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT },
  { id: 'attendance', label: 'Chấm công', category: 'attendance' },
]

function filterAttendanceEntries(entries) {
  return entries.filter((entry) => entry.source === PAYROLL_WALLET_SOURCE.ATTENDANCE)
}

export default function PayrollEmployeeProfile({
  employee,
  stats,
  walletEntries,
  invoices,
  attendance,
  adjustments,
  month,
  fromDate,
  toDate,
  auditLogs,
  locks,
  onReload,
}) {
  const [view, setView] = useState('overview')
  const [historyTab, setHistoryTab] = useState('all')
  const [payslipOpen, setPayslipOpen] = useState(false)

  const employeeId = employee?.employeeId

  const attendanceStats = useMemo(
    () => computeAttendanceStats(attendance ?? [], employeeId),
    [attendance, employeeId],
  )

  const revenueRows = useMemo(
    () => buildInvoiceRevenueList(invoices ?? [], employeeId),
    [invoices, employeeId],
  )

  const tipsRows = useMemo(
    () => buildTipsBreakdown(invoices ?? [], employeeId),
    [invoices, employeeId],
  )

  const bonusRows = useMemo(
    () => buildAdjustmentHistory(adjustments ?? [], employeeId, PAYROLL_ADJUSTMENT_TYPES.BONUS),
    [adjustments, employeeId],
  )

  const penaltyRows = useMemo(
    () => buildAdjustmentHistory(adjustments ?? [], employeeId, PAYROLL_ADJUSTMENT_TYPES.PENALTY),
    [adjustments, employeeId],
  )

  const reductionRows = useMemo(
    () => buildAdjustmentHistory(adjustments ?? [], employeeId, PAYROLL_ADJUSTMENT_TYPES.REDUCTION),
    [adjustments, employeeId],
  )

  const advanceRows = useMemo(
    () => buildAdjustmentHistory(adjustments ?? [], employeeId, PAYROLL_ADJUSTMENT_TYPES.ADVANCE),
    [adjustments, employeeId],
  )

  const filteredHistory = useMemo(() => {
    if (historyTab === 'attendance') return filterAttendanceEntries(walletEntries)
    const tab = HISTORY_TABS.find((item) => item.id === historyTab)
    return filterWalletByCategory(walletEntries, tab?.category ?? '')
  }, [walletEntries, historyTab])

  const payslip = stats ? { ...stats, month, fromDate, toDate } : null

  return (
    <section className="salary-profile">
      <PayrollWallet entries={[]} employee={employee} stats={stats} mode="header" />

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
          <PayrollLiveDashboard stats={stats} attendanceStats={attendanceStats} />
          <PayrollAttendanceStats stats={attendanceStats} />
          <div className="salary-profile__history">
            <div className="salary-profile__history-tabs">
              {HISTORY_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={historyTab === tab.id ? 'is-active' : ''}
                  onClick={() => setHistoryTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <PayrollWallet entries={filteredHistory} employee={null} stats={null} mode="timeline" />
          </div>
          <PayrollAdjustmentHistory title="Thưởng" rows={bonusRows} />
          <PayrollAdjustmentHistory title="Phạt (nhập tay)" rows={penaltyRows} />
          <PayrollAdjustmentHistory title="Giảm lương" rows={reductionRows} showCreator={false} />
          <PayrollAdjustmentHistory title="Ứng lương" rows={advanceRows} />
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
          logs={auditLogs.filter(
            (log) => log.entityType === 'payroll_adjustment'
              && adjustments.some((adj) => adj.id === log.entityId && adj.employeeId === employeeId),
          )}
          adjustments={adjustments.filter((adj) => adj.employeeId === employeeId)}
          locks={locks}
          onReload={onReload}
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
  )
}
