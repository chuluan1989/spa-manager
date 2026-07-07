import { useMemo, useState } from 'react'
import BranchBanner from '../common/BranchBanner'
import {
  canSelectBranch,
  getCurrentUserBranch,
  getCurrentUserBranchName,
  getScopedEmployeeId,
  isEmployee,
} from '../../constants/auth'
import { loadBranches } from '../../constants/branches'
import { getActiveEmployeesByBranch, getAllActiveEmployees } from '../../utils/employeeStorage'
import { formatCurrency } from '../../utils/invoice'
import { loadInvoices } from '../../utils/invoiceStorage'
import {
  PAY_CYCLE_OPTIONS,
  PAY_CYCLES,
  computeSalaryReport,
  formatDisplayDate,
  getCurrentMonthValue,
} from '../../utils/salaryReport'

export default function EmployeeSalaryPanel() {
  const lockedBranch = !canSelectBranch()
  const lockedEmployee = isEmployee()

  const [filters, setFilters] = useState(() => ({
    month: getCurrentMonthValue(),
    branchId: lockedBranch ? getCurrentUserBranch() : '',
    employeeId: getScopedEmployeeId(),
    cycle: PAY_CYCLES.PERIOD_1,
  }))

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      branchId: lockedBranch ? getCurrentUserBranch() : filters.branchId,
      employeeId: getScopedEmployeeId(filters.employeeId),
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

  const salaryReport = useMemo(
    () => computeSalaryReport(loadInvoices(), effectiveFilters),
    [effectiveFilters],
  )

  const updateFilter = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const handleBranchChange = (branchId) => {
    setFilters((prev) => ({ ...prev, branchId, employeeId: lockedEmployee ? prev.employeeId : '' }))
  }

  return (
    <div className="salary-report">
      <section className="report__filters">
        {lockedBranch && (
          <div className="report__field report__field--banner">
            <BranchBanner branchName={getCurrentUserBranchName()} />
          </div>
        )}

        <label className="report__field">
          <span>Tháng</span>
          <input
            type="month"
            value={filters.month}
            onChange={(e) => updateFilter('month', e.target.value)}
          />
        </label>

        {canSelectBranch() && (
          <label className="report__field">
            <span>Chi nhánh</span>
            <select value={filters.branchId} onChange={(e) => handleBranchChange(e.target.value)}>
              <option value="">Tất cả chi nhánh</option>
              {loadBranches().map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        )}

        {!lockedEmployee && (
          <label className="report__field">
            <span>Nhân viên</span>
            <select
              value={filters.employeeId}
              onChange={(e) => updateFilter('employeeId', e.target.value)}
            >
              <option value="">Tất cả nhân viên</option>
              {branchEmployees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="report__field">
          <span>Chu kỳ lương</span>
          <select
            value={filters.cycle}
            onChange={(e) => updateFilter('cycle', e.target.value)}
          >
            {PAY_CYCLE_OPTIONS.filter((option) => option.value !== PAY_CYCLES.FULL).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </section>

      <p className="salary-report__period">
        Kỳ báo cáo: {salaryReport.cycleLabel} — {formatDisplayDate(salaryReport.fromDate)} đến {formatDisplayDate(salaryReport.toDate)}
      </p>

      {salaryReport.employees.length === 0 ? (
        <section className="report-table-card">
          <p className="report-table-card__empty">Không có dữ liệu lương trong kỳ đã chọn.</p>
        </section>
      ) : (
        salaryReport.employees.map((employee) => (
          <section key={employee.employeeId || employee.employeeName} className="salary-report__employee">
            <div className="salary-report__summary-card">
              <h3 className="salary-report__employee-name">{employee.employeeName}</h3>
              <div className="salary-report__summary-grid">
                <div><span>Chi nhánh</span><strong>{employee.branchName}</strong></div>
                <div><span>Chu kỳ</span><strong>{employee.cycleLabel}</strong></div>
                <div><span>Tổng số hóa đơn</span><strong>{employee.summary.invoiceCount}</strong></div>
                <div><span>Tổng số dịch vụ</span><strong>{employee.summary.serviceCount}</strong></div>
                <div><span>Doanh thu tiền vé</span><strong>{formatCurrency(employee.summary.revenue)}</strong></div>
                <div><span>Tổng tips</span><strong>{formatCurrency(employee.summary.tips)}</strong></div>
                <div><span>Tổng hoa hồng DV</span><strong className="salary-report__commission">{formatCurrency(employee.summary.serviceCommission)}</strong></div>
                <div><span>Tổng lương</span><strong className="salary-report__salary">{formatCurrency(employee.summary.totalSalary)}</strong></div>
              </div>
            </div>

            {employee.invoices.map((invoice) => (
              <div key={invoice.invoiceId} className="salary-report__day">
                <h4 className="salary-report__day-title">
                  Hóa đơn — {invoice.displayDate}
                  {invoice.salaryRole === 'support' ? ' (hỗ trợ)' : ''}
                  {invoice.customerName !== '—' ? ` (${invoice.customerName})` : ''}
                </h4>
                <div className="report-table-card__wrap">
                  <table className="report-table-card__table salary-report__table">
                    <thead>
                      <tr>
                        <th>Dịch vụ</th>
                        <th>Giá dịch vụ</th>
                        <th>% Hoa hồng</th>
                        <th>Tiền hoa hồng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.services.map((service, index) => (
                        <tr key={`${invoice.invoiceId}-${service.serviceId}-${index}`}>
                          <td>{service.serviceName}</td>
                          <td className="report-table-card__money">{formatCurrency(service.price)}</td>
                          <td className="report-table-card__num">{service.commissionPercent}%</td>
                          <td className="report-table-card__money report-table-card__commission">
                            {formatCurrency(service.commissionAmount)}
                          </td>
                        </tr>
                      ))}
                      {invoice.salaryRole === 'primary' && (
                        <tr className="salary-report__row-tips">
                          <td colSpan={3}>Tips</td>
                          <td className="report-table-card__money">{formatCurrency(invoice.tips)}</td>
                        </tr>
                      )}
                      <tr className="salary-report__row-total">
                        <td colSpan={3}><strong>Doanh thu tiền vé</strong></td>
                        <td className="report-table-card__money">{formatCurrency(invoice.totalRevenue)}</td>
                      </tr>
                      <tr className="salary-report__row-total">
                        <td colSpan={3}><strong>Tổng lương hóa đơn</strong></td>
                        <td className="report-table-card__money salary-report__salary">
                          <strong>{formatCurrency(invoice.totalSalary)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div className="salary-report__period-total">
              <h4 className="salary-report__period-total-title">Tổng cuối kỳ</h4>
              <div className="salary-report__period-total-grid">
                <div><span>Doanh thu tiền vé kỳ</span><strong>{formatCurrency(employee.periodTotals.revenue)}</strong></div>
                <div><span>Tổng tips kỳ</span><strong>{formatCurrency(employee.periodTotals.tips)}</strong></div>
                <div><span>Tổng hoa hồng kỳ</span><strong className="salary-report__commission">{formatCurrency(employee.periodTotals.serviceCommission)}</strong></div>
                <div><span>Tổng lương kỳ</span><strong className="salary-report__salary">{formatCurrency(employee.periodTotals.totalSalary)}</strong></div>
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  )
}
