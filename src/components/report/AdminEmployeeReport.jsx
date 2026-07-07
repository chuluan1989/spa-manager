import { useMemo, useState } from 'react'
import BranchBanner from '../common/BranchBanner'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import {
  canSelectBranch,
  getCurrentUserBranch,
  getCurrentUserBranchName,
  isAdmin,
} from '../../constants/auth'
import { loadBranches } from '../../constants/branches'
import { getActiveEmployeesByBranch, getAllActiveEmployees } from '../../utils/employeeStorage'
import { formatCurrency } from '../../utils/invoice'
import { loadInvoices } from '../../utils/invoiceStorage'
import {
  PAY_CYCLE_OPTIONS,
  PAY_CYCLES,
  computeAdminEmployeeReports,
  computeEmployeeDailyReports,
  formatDisplayDate,
  getCurrentMonthValue,
  getPayPeriodRange,
} from '../../utils/salaryReport'

function DailyDetailTable({ detail }) {
  if (!detail) return null

  return (
    <section className="admin-employee-report__detail">
      <div className="admin-employee-report__detail-header">
        <h3>Chi tiết: {detail.employeeName}</h3>
        <p>
          {detail.branchName} — {detail.cycleLabel}
        </p>
      </div>

      {detail.days.length === 0 ? (
        <p className="report-table-card__empty">Chưa có dữ liệu trong kỳ này</p>
      ) : (
        <>
          {detail.days.map((day) => (
            <article key={day.date} className="salary-report__day">
              <h4 className="salary-report__day-title">
                Ngày {day.displayDate} — {day.invoiceCount} hóa đơn/tour
              </h4>
              <div className="report-table-card__wrap">
                <table className="report-table-card__table salary-report__table">
                  <thead>
                    <tr>
                      <th>Dịch vụ đã làm</th>
                      <th>Số lượng</th>
                      <th>Doanh số dịch vụ</th>
                      <th>Hoa hồng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.services.map((service) => (
                      <tr key={`${day.date}-${service.serviceId || service.serviceName}`}>
                        <td>{service.serviceName}</td>
                        <td className="report-table-card__num">{service.quantity}</td>
                        <td className="report-table-card__money">{formatCurrency(service.revenue)}</td>
                        <td className="report-table-card__money report-table-card__commission">
                          {formatCurrency(service.commission)}
                        </td>
                      </tr>
                    ))}
                    <tr className="salary-report__row-tips">
                      <td colSpan={3}>Tips trong ngày</td>
                      <td className="report-table-card__money">{formatCurrency(day.tips)}</td>
                    </tr>
                    <tr className="salary-report__row-total">
                      <td colSpan={3}><strong>Hoa hồng trong ngày</strong></td>
                      <td className="report-table-card__money report-table-card__commission">
                        <strong>{formatCurrency(day.serviceCommission)}</strong>
                      </td>
                    </tr>
                    <tr className="salary-report__row-total">
                      <td colSpan={3}><strong>Tổng lương ngày</strong></td>
                      <td className="report-table-card__money salary-report__salary">
                        <strong>{formatCurrency(day.totalSalary)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          ))}

          <div className="salary-report__period-total">
            <h4 className="salary-report__period-total-title">Tổng cuối kỳ — {detail.employeeName}</h4>
            <div className="salary-report__period-total-grid">
              <div><span>Tổng doanh số kỳ</span><strong>{formatCurrency(detail.periodTotals.serviceRevenue)}</strong></div>
              <div><span>Tổng tips kỳ</span><strong>{formatCurrency(detail.periodTotals.tips)}</strong></div>
              <div><span>Tổng hoa hồng kỳ</span><strong className="salary-report__commission">{formatCurrency(detail.periodTotals.serviceCommission)}</strong></div>
              <div><span>Tổng lương kỳ</span><strong className="salary-report__salary">{formatCurrency(detail.periodTotals.totalSalary)}</strong></div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

export default function AdminEmployeeReport() {
  const lockedBranch = !canSelectBranch()
  const initialMonth = getCurrentMonthValue()
  const initialRange = getPayPeriodRange(initialMonth, PAY_CYCLES.PERIOD_1)

  const [filters, setFilters] = useState(() => ({
    fromDate: initialRange.fromDate,
    toDate: initialRange.toDate,
    month: initialMonth,
    branchId: lockedBranch ? getCurrentUserBranch() : '',
    employeeId: '',
    cycle: PAY_CYCLES.PERIOD_1,
    discountFilter: '',
  }))
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')

  const syncVersion = useDataSyncVersion()
  const invoices = useMemo(() => loadInvoices(), [syncVersion])

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      branchId: lockedBranch ? getCurrentUserBranch() : filters.branchId,
    }),
    [filters, lockedBranch],
  )

  const branchEmployees = useMemo(
    () => (
      effectiveFilters.branchId
        ? getActiveEmployeesByBranch(effectiveFilters.branchId)
        : getAllActiveEmployees()
    ),
    [effectiveFilters.branchId],
  )

  const report = useMemo(
    () => computeAdminEmployeeReports(invoices, effectiveFilters),
    [invoices, effectiveFilters],
  )

  const selectedDetail = useMemo(() => {
    if (!selectedEmployeeId) return null
    return computeEmployeeDailyReports(invoices, selectedEmployeeId, effectiveFilters)
  }, [invoices, selectedEmployeeId, effectiveFilters])

  const updateFilter = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const handleMonthChange = (month) => {
    const { fromDate, toDate } = getPayPeriodRange(month, filters.cycle)
    setFilters((prev) => ({ ...prev, month, fromDate, toDate }))
    setSelectedEmployeeId('')
  }

  const handleCycleChange = (cycle) => {
    const { fromDate, toDate } = getPayPeriodRange(filters.month, cycle)
    setFilters((prev) => ({ ...prev, cycle, fromDate, toDate }))
    setSelectedEmployeeId('')
  }

  const handleBranchChange = (branchId) => {
    setFilters((prev) => ({ ...prev, branchId, employeeId: '' }))
    setSelectedEmployeeId('')
  }

  const handleDateChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
    setSelectedEmployeeId('')
  }

  return (
    <div className="admin-employee-report">
      <section className="report__filters">
        {lockedBranch && (
          <div className="report__field report__field--banner">
            <BranchBanner branchName={getCurrentUserBranchName()} />
          </div>
        )}

        <label className="report__field">
          <span>Từ ngày</span>
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => handleDateChange('fromDate', e.target.value)}
          />
        </label>

        <label className="report__field">
          <span>Đến ngày</span>
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => handleDateChange('toDate', e.target.value)}
          />
        </label>

        <label className="report__field">
          <span>Tháng</span>
          <input
            type="month"
            value={filters.month}
            onChange={(e) => handleMonthChange(e.target.value)}
          />
        </label>

        {canSelectBranch() && (
          <label className="report__field">
            <span>Chi nhánh</span>
            <select value={filters.branchId} onChange={(e) => handleBranchChange(e.target.value)}>
              <option value="">Tất cả chi nhánh</option>
              {loadBranches().map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="report__field">
          <span>Nhân viên</span>
          <select
            value={filters.employeeId}
            onChange={(e) => {
              updateFilter('employeeId', e.target.value)
              setSelectedEmployeeId(e.target.value)
            }}
          >
            <option value="">Tất cả nhân viên</option>
            {branchEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
        </label>

        <label className="report__field">
          <span>Chu kỳ lương</span>
          <select value={filters.cycle} onChange={(e) => handleCycleChange(e.target.value)}>
            {PAY_CYCLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="report__field">
          <span>Khuyến mãi</span>
          <select value={filters.discountFilter} onChange={(e) => updateFilter('discountFilter', e.target.value)}>
            <option value="">Tất cả hóa đơn</option>
            <option value="with">Chỉ có giảm giá</option>
            <option value="without">Không giảm giá</option>
          </select>
        </label>
      </section>

      <p className="salary-report__period">
        Kỳ báo cáo: {report.cycleLabel} — {formatDisplayDate(report.fromDate)} đến {formatDisplayDate(report.toDate)}
        {isAdmin() && (
          <span className="admin-employee-report__source"> · Dữ liệu từ hóa đơn/tour đã đồng bộ Cloud</span>
        )}
      </p>

      <section className="report-table-card">
        <h3 className="report-table-card__title">Báo cáo nhân viên</h3>

        {report.employees.length === 0 ? (
          <p className="report-table-card__empty">Chưa có dữ liệu trong kỳ này</p>
        ) : (
          <div className="report-table-card__wrap">
            <table className="report-table-card__table admin-employee-report__summary-table">
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th>Chi nhánh</th>
                  <th>Số HĐ/Tour</th>
                  <th>Tổng dịch vụ</th>
                  <th>Doanh số dịch vụ</th>
                  <th>Tips</th>
                  <th>Hoa hồng DV</th>
                  <th>Tổng lương</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.employees.map((row) => (
                  <tr key={row.employeeId || row.employeeName}>
                    <td>{row.employeeName}</td>
                    <td>{row.branchName}</td>
                    <td className="report-table-card__num">{row.invoiceCount}</td>
                    <td className="report-table-card__num">{row.serviceCount}</td>
                    <td className="report-table-card__money">{formatCurrency(row.serviceRevenue)}</td>
                    <td className="report-table-card__money">{formatCurrency(row.tips)}</td>
                    <td className="report-table-card__money report-table-card__commission">
                      {formatCurrency(row.serviceCommission)}
                    </td>
                    <td className="report-table-card__money salary-report__salary">
                      {formatCurrency(row.totalSalary)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-employee-report__detail-btn"
                        onClick={() => setSelectedEmployeeId(row.employeeId)}
                      >
                        Xem chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="admin-employee-report__totals-row">
                  <td colSpan={2}><strong>Tổng kỳ</strong></td>
                  <td className="report-table-card__num"><strong>{report.periodTotals.invoiceCount}</strong></td>
                  <td />
                  <td className="report-table-card__money"><strong>{formatCurrency(report.periodTotals.serviceRevenue)}</strong></td>
                  <td className="report-table-card__money"><strong>{formatCurrency(report.periodTotals.tips)}</strong></td>
                  <td className="report-table-card__money report-table-card__commission">
                    <strong>{formatCurrency(report.periodTotals.serviceCommission)}</strong>
                  </td>
                  <td className="report-table-card__money salary-report__salary">
                    <strong>{formatCurrency(report.periodTotals.totalSalary)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <DailyDetailTable detail={selectedDetail} />
    </div>
  )
}
