import { useMemo, useState } from 'react'
import { PAYROLL_ADJUSTMENT_TYPES, PAYROLL_DETAIL_CATEGORIES, PAYROLL_WALLET_SOURCE } from '../../constants/payrollTypes'
import {
  buildAdjustmentHistory,
  buildInvoiceRevenueList,
  buildTipsBreakdown,
  computeAttendanceStats,
} from '../../utils/payrollLiveHelpers'
import { PAY_CYCLES } from '../../utils/salaryReport'
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
import { ATTENDANCE_STATUS } from '../../constants/attendanceTypes'

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
  cycle,
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

  const attendanceUnitBreakdown = useMemo(() => {
    if (!attendance || !employeeId) return null
    if (cycle !== PAY_CYCLES.PERIOD_2) return null

    // Quy đổi sang đơn vị nửa ngày như quy định chấm công.
    const unitByStatus = {
      [ATTENDANCE_STATUS.FULL_DAY_PERMITTED]: 2,
      [ATTENDANCE_STATUS.HALF_MORNING_PERMITTED]: 1,
      [ATTENDANCE_STATUS.HALF_EVENING_PERMITTED]: 1,
      [ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED]: 2,
      [ATTENDANCE_STATUS.HALF_MORNING_UNPERMITTED]: 1,
      [ATTENDANCE_STATUS.HALF_EVENING_UNPERMITTED]: 1,
    }

    const permittedStatuses = new Set([
      ATTENDANCE_STATUS.FULL_DAY_PERMITTED,
      ATTENDANCE_STATUS.HALF_MORNING_PERMITTED,
      ATTENDANCE_STATUS.HALF_EVENING_PERMITTED,
    ])
    const unpermittedStatuses = new Set([
      ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED,
      ATTENDANCE_STATUS.HALF_MORNING_UNPERMITTED,
      ATTENDANCE_STATUS.HALF_EVENING_UNPERMITTED,
    ])

    const isPermitted = (s) => permittedStatuses.has(s)
    const isUnpermitted = (s) => unpermittedStatuses.has(s)

    let permittedUnits = 0
    let unpermittedUnits = 0
    let lateCount = 0
    let earlyCount = 0
    let weekendHolidayCount = 0
    let totalPenalty = 0

    // attendance đang là tập đã lọc theo khoảng ngày đúng cho Kỳ 2 (01–lastDay)
    for (const row of attendance) {
      if (!row || row.employeeId !== employeeId) continue
      totalPenalty += Number(row.penaltyAmount ?? 0)

      const status = row.status
      const unit = unitByStatus[status] ?? 0
      if (unit > 0) {
        if (isPermitted(status)) permittedUnits += unit
        if (isUnpermitted(status)) unpermittedUnits += unit
      }

      if (status === ATTENDANCE_STATUS.LATE_2H_UNPERMITTED) lateCount += 1
      if (status === ATTENDANCE_STATUS.EARLY_2H_UNPERMITTED) earlyCount += 1
      if ([ATTENDANCE_STATUS.FULL_DAY_WEEKEND, ATTENDANCE_STATUS.HALF_MORNING_WEEKEND, ATTENDANCE_STATUS.HALF_EVENING_WEEKEND].includes(status)) {
        weekendHolidayCount += 1
      }
    }

    const permittedFreeUnits = Math.min(6, permittedUnits)
    const permittedExceedUnits = Math.max(0, permittedUnits - 6)

    return {
      permittedUnits,
      permittedFreeUnits,
      permittedExceedUnits,
      unpermittedUnits,
      lateCount,
      earlyCount,
      weekendHolidayCount,
      totalPenalty,
    }
  }, [attendance, employeeId, cycle])

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
          <PayrollAttendanceStats stats={attendanceStats} cycle={cycle} breakdown={attendanceUnitBreakdown} />
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
