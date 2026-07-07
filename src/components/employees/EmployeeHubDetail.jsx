import { useMemo, useState } from 'react'
import EmployeeProfileDetail from './EmployeeProfileDetail'
import { formatCurrency } from '../../utils/invoice'
import { computeEmployeeInvoiceDetailReport } from '../../utils/employeeInvoiceReport'
import {
  computeEmployeePeriodStats,
  computeEmployeeTodayStats,
} from '../../utils/employeeHubStats'
import {
  PAY_CYCLE_OPTIONS,
  PAY_CYCLES,
  computeEmployeeDailyReports,
  formatDisplayDate,
  getCurrentMonthValue,
  getPayPeriodRange,
} from '../../utils/salaryReport'
import { getStatusLabel } from '../../utils/employeeStorage'
import { isAdmin } from '../../constants/auth'
import './EmployeeHubDetail.css'

const TABS = [
  { id: 'profile', label: 'Hồ sơ' },
  { id: 'sales', label: 'Doanh số' },
  { id: 'salary', label: 'Lương' },
  { id: 'history', label: 'Lịch sử' },
]

function StatCard({ label, value, variant = '' }) {
  return (
    <div className={`employee-hub-stat ${variant ? `employee-hub-stat--${variant}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default function EmployeeHubDetail({ employee, invoices, month, onEdit }) {
  const [activeTab, setActiveTab] = useState('profile')
  const [salaryCycle, setSalaryCycle] = useState(PAY_CYCLES.FULL)

  const todayStats = useMemo(
    () => (employee ? computeEmployeeTodayStats(invoices, employee.id) : null),
    [employee, invoices],
  )

  const monthStats = useMemo(
    () => (employee ? computeEmployeePeriodStats(invoices, employee.id, { month, cycle: PAY_CYCLES.FULL }) : null),
    [employee, invoices, month],
  )

  const salesDetail = useMemo(() => {
    if (!employee) return null
    const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)
    return computeEmployeeInvoiceDetailReport(invoices, employee.id, {
      fromDate,
      toDate,
      month,
      cycle: PAY_CYCLES.FULL,
      branchId: '',
      employeeId: employee.id,
    })
  }, [employee, invoices, month])

  const salaryDetail = useMemo(() => {
    if (!employee) return null
    const { fromDate, toDate } = getPayPeriodRange(month, salaryCycle)
    return computeEmployeeDailyReports(invoices, employee.id, {
      fromDate,
      toDate,
      month,
      cycle: salaryCycle,
      branchId: '',
      employeeId: employee.id,
    })
  }, [employee, invoices, month, salaryCycle])

  if (!employee) {
    return (
      <div className="employee-hub-detail employee-hub-detail--empty">
        <p>Chọn nhân viên để xem hồ sơ, doanh số và lương</p>
      </div>
    )
  }

  const branchHistory = Array.isArray(employee.branchHistory) ? employee.branchHistory : []

  return (
    <div className="employee-hub-detail">
      <div className="employee-hub-detail__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`employee-hub-detail__tab ${activeTab === tab.id ? 'employee-hub-detail__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <EmployeeProfileDetail
          employee={employee}
          forceAdminFields={isAdmin()}
          showStats={false}
          onEdit={onEdit}
        />
      )}

      {activeTab === 'sales' && (
        <div className="employee-hub-detail__panel">
          <div className="employee-hub-detail__stats-grid">
            <StatCard label="Doanh thu tiền vé hôm nay" value={formatCurrency(todayStats?.serviceRevenue ?? 0)} variant="gold" />
            <StatCard label="Doanh thu tiền vé tháng" value={formatCurrency(monthStats?.serviceRevenue ?? 0)} variant="gold" />
            <StatCard label="Số khách/tour tháng" value={String(monthStats?.invoiceCount ?? 0)} />
            <StatCard label="Tips tháng" value={formatCurrency(monthStats?.tips ?? 0)} variant="tips" />
            <StatCard label="Hoa hồng tháng" value={formatCurrency(monthStats?.serviceCommission ?? 0)} variant="commission" />
            <StatCard label="Tổng lương tháng" value={formatCurrency(monthStats?.totalSalary ?? 0)} variant="salary" />
          </div>

          {!salesDetail?.days?.length ? (
            <p className="employee-hub-detail__empty">Chưa có hóa đơn trong tháng</p>
          ) : (
            salesDetail.days.map((day) => (
              <section key={day.date} className="employee-hub-sales-day">
                <h4>Ngày {day.displayDate}</h4>
                {day.invoices.map((inv) => (
                  <article key={inv.invoiceId} className="employee-hub-sales-inv">
                    <div className="employee-hub-sales-inv__time">{inv.invoiceTime}</div>
                    <div className="employee-hub-sales-inv__grid">
                      <div><span>Khách</span><strong>{inv.customerName}</strong></div>
                      <div><span>Dịch vụ</span><strong>{inv.serviceNames}</strong></div>
                      <div><span>Giá vé</span><strong>{formatCurrency(inv.ticketPrice)}</strong></div>
                      <div><span>KM</span><strong>{formatCurrency(inv.discount)}</strong></div>
                      <div><span>Doanh thu tiền vé</span><strong>{formatCurrency(inv.payment)}</strong></div>
                      <div><span>Tips</span><strong className="is-tips">{formatCurrency(inv.tips)}</strong></div>
                      <div><span>Hoa hồng</span><strong>{formatCurrency(inv.commission)}</strong></div>
                    </div>
                  </article>
                ))}
                <div className="employee-hub-sales-day__total">
                  Tổng ngày: {day.invoiceCount} HĐ · DT tiền vé {formatCurrency(day.serviceRevenue)} · Tips {formatCurrency(day.tips)} · HH {formatCurrency(day.serviceCommission)}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {activeTab === 'salary' && (
        <div className="employee-hub-detail__panel">
          <div className="employee-hub-detail__cycle">
            {PAY_CYCLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={salaryCycle === opt.value ? 'is-active' : ''}
                onClick={() => setSalaryCycle(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="employee-hub-detail__stats-grid">
            <StatCard label="Doanh thu tiền vé kỳ" value={formatCurrency(salaryDetail?.periodTotals?.serviceRevenue ?? 0)} />
            <StatCard label="Tips kỳ" value={formatCurrency(salaryDetail?.periodTotals?.tips ?? 0)} variant="tips" />
            <StatCard label="Hoa hồng kỳ" value={formatCurrency(salaryDetail?.periodTotals?.serviceCommission ?? 0)} variant="commission" />
            <StatCard label="Tổng lương kỳ" value={formatCurrency(salaryDetail?.periodTotals?.totalSalary ?? 0)} variant="salary" />
          </div>

          {!salaryDetail?.days?.length ? (
            <p className="employee-hub-detail__empty">Chưa có dữ liệu lương trong kỳ</p>
          ) : (
            salaryDetail.days.map((day) => (
              <section key={day.date} className="employee-hub-salary-day">
                <h4>{day.displayDate} — {day.invoiceCount} hóa đơn</h4>
                <div className="employee-hub-salary-day__row">
                  <span>Doanh thu tiền vé</span><strong>{formatCurrency(day.serviceRevenue)}</strong>
                </div>
                <div className="employee-hub-salary-day__row">
                  <span>Tips</span><strong className="is-tips">{formatCurrency(day.tips)}</strong>
                </div>
                <div className="employee-hub-salary-day__row">
                  <span>Hoa hồng</span><strong>{formatCurrency(day.serviceCommission)}</strong>
                </div>
                <div className="employee-hub-salary-day__row employee-hub-salary-day__row--total">
                  <span>Lương ngày</span><strong>{formatCurrency(day.totalSalary)}</strong>
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="employee-hub-detail__panel">
          <div className="employee-hub-history-block">
            <h4>Ngày vào làm</h4>
            <p>{employee.startDate ? formatDisplayDate(employee.startDate) : 'Chưa cập nhật'}</p>
          </div>
          <div className="employee-hub-history-block">
            <h4>Trạng thái hiện tại</h4>
            <p>{getStatusLabel(employee.status)}</p>
          </div>
          <div className="employee-hub-history-block">
            <h4>Lịch sử chuyển chi nhánh</h4>
            {branchHistory.length === 0 ? (
              <p className="employee-hub-detail__empty">Chưa có lịch sử chuyển</p>
            ) : (
              <ul className="employee-hub-history-list">
                {[...branchHistory].reverse().map((entry, index) => (
                  <li key={`${entry.changedAt}-${index}`}>
                    <strong>{entry.transferDate || formatDisplayDate((entry.changedAt || '').slice(0, 10))}</strong>
                    <span>
                      {entry.fromBranchName || entry.branchName || '—'}
                      {' → '}
                      {entry.toBranchName || '—'}
                    </span>
                    {entry.note && <em>{entry.note}</em>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
