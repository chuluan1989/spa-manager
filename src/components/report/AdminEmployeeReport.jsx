import { useCallback, useEffect, useMemo, useState } from 'react'
import BranchBanner from '../common/BranchBanner'
import AdminEmployeeDetail from './AdminEmployeeDetail'
import {
  canDeleteInvoice,
  canEditInvoice,
  canSelectBranch,
  getCurrentUserBranch,
  getCurrentUserBranchName,
  isAdmin,
} from '../../constants/auth'
import { loadBranches } from '../../constants/branches'
import { getActiveEmployeesByBranch, getAllActiveEmployees } from '../../utils/employeeStorage'
import { getActiveServicesForBranch, loadServices } from '../../utils/serviceStorage'
import { formatCurrency } from '../../utils/invoice'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { fetchInvoicesFiltered, subscribeInvoicesChanges } from '../../repositories/invoicesRepository'
import { fetchAttendanceFiltered, subscribeAttendanceChanges } from '../../repositories/attendanceRepository'
import { mergeAttendanceIntoEmployeeReports } from '../../utils/attendancePenalties'
import { deleteInvoice } from '../../utils/invoiceStorage'
import { setInvoiceEditPrefill } from '../../utils/navigationPrefill'
import { computeEmployeeInvoiceDetailReport } from '../../utils/employeeInvoiceReport'
import {
  PAY_CYCLE_OPTIONS,
  PAY_CYCLES,
  computeAdminEmployeeReports,
  formatDisplayDate,
  getCurrentMonthValue,
  getPayPeriodRange,
} from '../../utils/salaryReport'

export default function AdminEmployeeReport({ onNavigate }) {
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
    customerSearch: '',
    serviceId: '',
  }))
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [invoices, setInvoices] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      branchId: lockedBranch ? getCurrentUserBranch() : filters.branchId,
    }),
    [filters, lockedBranch],
  )

  const loadFromSupabase = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setFetchError('Supabase chưa cấu hình — báo cáo nhân viên yêu cầu dữ liệu Cloud.')
      setInvoices([])
      setLoading(false)
      return
    }

    setLoading(true)
    setFetchError('')
    try {
      const [invoiceData, attendanceData] = await Promise.all([
        fetchInvoicesFiltered({
          fromDate: effectiveFilters.fromDate,
          toDate: effectiveFilters.toDate,
          branchId: effectiveFilters.branchId,
          customerSearch: effectiveFilters.customerSearch,
        }),
        fetchAttendanceFiltered({
          fromDate: effectiveFilters.fromDate,
          toDate: effectiveFilters.toDate,
          branchId: effectiveFilters.branchId,
        }),
      ])
      setInvoices(Array.isArray(invoiceData) ? invoiceData : [])
      setAttendanceRecords(Array.isArray(attendanceData) ? attendanceData : [])
    } catch (error) {
      setFetchError(error?.message ?? 'Không thể tải hóa đơn từ Supabase.')
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [effectiveFilters, refreshKey])

  useEffect(() => {
    loadFromSupabase()
  }, [loadFromSupabase])

  useEffect(() => subscribeAttendanceChanges(() => {
    setRefreshKey((key) => key + 1)
  }), [])

  useEffect(() => subscribeInvoicesChanges(() => {
    setRefreshKey((key) => key + 1)
  }), [])

  const branchEmployees = useMemo(
    () => (
      effectiveFilters.branchId
        ? getActiveEmployeesByBranch(effectiveFilters.branchId)
        : getAllActiveEmployees()
    ),
    [effectiveFilters.branchId],
  )

  const serviceOptions = useMemo(() => {
    if (effectiveFilters.branchId) {
      return getActiveServicesForBranch(effectiveFilters.branchId)
    }
    return loadServices().filter((service) => service.isActive !== false)
  }, [effectiveFilters.branchId])

  const report = useMemo(() => {
    const base = computeAdminEmployeeReports(invoices, effectiveFilters)
    return mergeAttendanceIntoEmployeeReports(base, attendanceRecords)
  }, [invoices, attendanceRecords, effectiveFilters])

  const selectedDetail = useMemo(() => {
    if (!selectedEmployeeId) return null
    return computeEmployeeInvoiceDetailReport(invoices, selectedEmployeeId, effectiveFilters)
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
    setFilters((prev) => ({ ...prev, branchId, employeeId: '', serviceId: '' }))
    setSelectedEmployeeId('')
  }

  const handleDateChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
    setSelectedEmployeeId('')
  }

  const handleEditInvoice = (invoice) => {
    setDetailInvoice(null)
    setInvoiceEditPrefill(invoice.id)
    onNavigate?.('invoices')
  }

  const handleDeleteInvoice = async (invoice) => {
    if (!canDeleteInvoice()) return
    if (!window.confirm(`Xóa hóa đơn khách "${invoice.customerName || '—'}" ngày ${invoice.date}?`)) return

    const result = await deleteInvoice(invoice.id)
    if (!result.success) {
      window.alert(result.error ?? 'Không thể xóa hóa đơn.')
      return
    }
    setDetailInvoice(null)
    setRefreshKey((key) => key + 1)
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
          <span>Khách hàng</span>
          <input
            type="search"
            placeholder="Tên hoặc SĐT..."
            value={filters.customerSearch}
            onChange={(e) => updateFilter('customerSearch', e.target.value)}
          />
        </label>

        <label className="report__field">
          <span>Dịch vụ</span>
          <select value={filters.serviceId} onChange={(e) => updateFilter('serviceId', e.target.value)}>
            <option value="">Tất cả dịch vụ</option>
            {serviceOptions.map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
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
          <span className="admin-employee-report__source"> · Dữ liệu trực tiếp từ Supabase</span>
        )}
        {loading && <span className="admin-employee-report__loading"> · Đang tải...</span>}
      </p>

      {fetchError && (
        <div className="admin-employee-report__error" role="alert">{fetchError}</div>
      )}

      <section className="report-table-card">
        <h3 className="report-table-card__title">Báo cáo nhân viên</h3>

        {!loading && report.employees.length === 0 ? (
          <p className="report-table-card__empty">Chưa có dữ liệu trong kỳ này</p>
        ) : (
          <div className="report-table-card__wrap">
            <table className="report-table-card__table admin-employee-report__summary-table">
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th>Chi nhánh</th>
                  <th>Số HĐ/Tour</th>
                  <th>Khách yêu cầu</th>
                  <th>Tổng dịch vụ</th>
                  <th>Doanh thu tiền vé</th>
                  <th>Tips</th>
                  <th>Hoa hồng</th>
                  <th>Tổng lương</th>
                  <th>Trừ chấm công</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.employees.map((row) => (
                  <tr
                    key={row.employeeId || row.employeeName}
                    className={selectedEmployeeId === row.employeeId ? 'admin-employee-report__row--active' : ''}
                  >
                    <td>{row.employeeName}</td>
                    <td>{row.branchName}</td>
                    <td className="report-table-card__num">{row.invoiceCount}</td>
                    <td className="report-table-card__num">{row.customerRequestedCount ?? 0}</td>
                    <td className="report-table-card__num">{row.serviceCount}</td>
                    <td className="report-table-card__money">{formatCurrency(row.serviceRevenue)}</td>
                    <td className="report-table-card__money">{formatCurrency(row.tips)}</td>
                    <td className="report-table-card__money report-table-card__commission">
                      {formatCurrency(row.serviceCommission)}
                    </td>
                    <td className="report-table-card__money salary-report__salary">
                      {formatCurrency(row.totalSalary)}
                    </td>
                    <td className="report-table-card__money report-table-card__commission">
                      {formatCurrency(row.attendancePenalty ?? 0)}
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
              {report.employees.length > 0 && (
                <tfoot>
                  <tr className="admin-employee-report__totals-row">
                    <td colSpan={2}><strong>Tổng kỳ</strong></td>
                    <td className="report-table-card__num"><strong>{report.periodTotals.invoiceCount}</strong></td>
                    <td className="report-table-card__num"><strong>{report.periodTotals.customerRequestedCount ?? 0}</strong></td>
                    <td />
                    <td className="report-table-card__money"><strong>{formatCurrency(report.periodTotals.serviceRevenue)}</strong></td>
                    <td className="report-table-card__money"><strong>{formatCurrency(report.periodTotals.tips)}</strong></td>
                    <td className="report-table-card__money report-table-card__commission">
                      <strong>{formatCurrency(report.periodTotals.serviceCommission)}</strong>
                    </td>
                    <td className="report-table-card__money salary-report__salary">
                      <strong>{formatCurrency(report.periodTotals.totalSalary)}</strong>
                    </td>
                    <td className="report-table-card__money report-table-card__commission">
                      <strong>{formatCurrency(report.periodTotals.attendancePenalty ?? 0)}</strong>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      <AdminEmployeeDetail
        detail={selectedDetail}
        onClose={() => setSelectedEmployeeId('')}
        onEdit={handleEditInvoice}
        onDelete={handleDeleteInvoice}
        allowDelete={canDeleteInvoice()}
        detailInvoice={detailInvoice}
        onViewInvoice={setDetailInvoice}
        onCloseDetail={() => setDetailInvoice(null)}
        canEditInvoice={canEditInvoice}
      />
    </div>
  )
}
