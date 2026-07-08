import { useMemo, useState } from 'react'
import { PAYROLL_DETAIL_CATEGORIES, PAYROLL_WALLET_SOURCE } from '../../constants/payrollTypes'
import { filterWalletByCategory } from '../../utils/payrollEngine'
import PayrollAuditHistory from './PayrollAuditHistory'
import PayrollPayslipPanel from './PayrollPayslipPanel'
import PayrollWallet from './PayrollWallet'

const HISTORY_TABS = [
  { id: 'all', label: 'Tất cả', category: '' },
  { id: 'commission', label: 'Hoa hồng', category: PAYROLL_DETAIL_CATEGORIES.COMMISSION },
  { id: 'tips', label: 'Tips', category: PAYROLL_DETAIL_CATEGORIES.TIPS },
  { id: 'bonus', label: 'Thưởng', category: PAYROLL_DETAIL_CATEGORIES.BONUS },
  { id: 'penalty', label: 'Phạt', category: PAYROLL_DETAIL_CATEGORIES.PENALTY },
  { id: 'advance', label: 'Ứng lương', category: PAYROLL_DETAIL_CATEGORIES.ADVANCE },
  { id: 'reduction', label: 'Giảm lương', category: PAYROLL_DETAIL_CATEGORIES.REDUCTION },
  { id: 'adjustment', label: 'Điều chỉnh', category: PAYROLL_DETAIL_CATEGORIES.ADJUSTMENT },
  { id: 'attendance', label: 'Chấm công', category: 'attendance' },
]

const PROFILE_VIEWS = [
  { id: 'wallet', label: 'Ví lương' },
  { id: 'history', label: 'Lịch sử' },
  { id: 'audit', label: 'Nhật ký' },
  { id: 'payslip', label: 'Phiếu lương' },
]

function filterAttendanceEntries(entries) {
  return entries.filter((entry) => entry.source === PAYROLL_WALLET_SOURCE.ATTENDANCE)
}

export default function PayrollEmployeeProfile({
  employee,
  stats,
  walletEntries,
  month,
  fromDate,
  toDate,
  auditLogs,
  adjustments,
  locks,
  onReload,
}) {
  const [view, setView] = useState('wallet')
  const [historyTab, setHistoryTab] = useState('all')
  const [payslipOpen, setPayslipOpen] = useState(false)

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

      {view === 'wallet' && (
        <PayrollWallet entries={walletEntries} employee={null} stats={null} mode="timeline" />
      )}

      {view === 'history' && (
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
      )}

      {view === 'audit' && (
        <PayrollAuditHistory
          logs={auditLogs.filter(
            (log) => log.entityType === 'payroll_adjustment'
              && adjustments.some((adj) => adj.id === log.entityId && adj.employeeId === employee?.employeeId),
          )}
          adjustments={adjustments.filter((adj) => adj.employeeId === employee?.employeeId)}
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
