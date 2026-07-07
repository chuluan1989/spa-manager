import { useMemo, useState } from 'react'
import EmployeeSalaryPanel from '../components/report/EmployeeSalaryPanel'
import AdminEmployeeReport from '../components/report/AdminEmployeeReport'
import BranchBanner from '../components/common/BranchBanner'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import {
  canSelectBranch,
  canViewOverviewReport,
  canViewReport,
  getCurrentUserBranch,
  getCurrentUserBranchName,
  isEmployee,
} from '../constants/auth'
import { loadBranches } from '../constants/branches'
import { getActiveEmployeesByBranch, getAllActiveEmployees } from '../utils/employeeStorage'
import { formatCurrency } from '../utils/invoice'
import { getTodayDate, loadInvoices } from '../utils/invoiceStorage'
import { loadExpenses } from '../utils/expenseStorage'
import { computeReportData, getMonthStartDate } from '../utils/report'
import { consumeReportPrefill } from '../utils/navigationPrefill'
import './Report.css'

const INITIAL_FILTERS = () => ({
  fromDate: getTodayDate(),
  toDate: getTodayDate(),
  branchId: canSelectBranch() ? '' : getCurrentUserBranch(),
  employeeId: '',
  discountFilter: '',
})

function ReportTable({ title, headers, rows, emptyText }) {
  return (
    <section className="report-table-card">
      <h3 className="report-table-card__title">{title}</h3>
      {rows.length === 0 ? (
        <p className="report-table-card__empty">{emptyText}</p>
      ) : (
        <div className="report-table-card__wrap">
          <table className="report-table-card__table">
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>{row.cells}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const REPORT_TABS = {
  OVERVIEW: 'overview',
  SALARY: 'salary',
}

/**
 * Nhân viên chỉ được xem tổng doanh thu chi nhánh ở mức tổng quan,
 * không xem chi tiết chi phí/lợi nhuận/hoa hồng hay dữ liệu từng nhân viên khác.
 */
function EmployeeBranchOverview({ filters, updateFilter, report }) {
  return (
    <>
      <section className="report__filters">
        <label className="report__field">
          <span>Từ ngày</span>
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => updateFilter('fromDate', e.target.value)}
          />
        </label>
        <label className="report__field">
          <span>Đến ngày</span>
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => updateFilter('toDate', e.target.value)}
          />
        </label>
      </section>

      <section className="report__summary">
        <div className="report-card report-card--blue">
          <p className="report-card__label">Tổng doanh thu chi nhánh</p>
          <p className="report-card__value">{formatCurrency(report.summary.revenue)}</p>
        </div>
      </section>
    </>
  )
}

export default function Report() {
  const [activeTab, setActiveTab] = useState(
    isEmployee() ? REPORT_TABS.SALARY : REPORT_TABS.OVERVIEW,
  )
  const [filters, setFilters] = useState(() => {
    const prefill = consumeReportPrefill()
    return prefill ? { ...INITIAL_FILTERS(), ...prefill } : INITIAL_FILTERS()
  })
  const lockedBranch = !canSelectBranch()

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

  const syncVersion = useDataSyncVersion()

  const report = useMemo(
    () => computeReportData(loadInvoices(), loadExpenses(), effectiveFilters),
    [effectiveFilters, syncVersion],
  )

  if (!canViewReport()) {
    return (
      <div className="report report--denied">
        <h2 className="report__title">Không có quyền truy cập</h2>
        <p className="report__subtitle">Bạn không được phép xem báo cáo.</p>
      </div>
    )
  }

  const updateFilter = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const handleBranchChange = (branchId) => {
    setFilters((prev) => ({ ...prev, branchId, employeeId: '' }))
  }

  const setToday = () => {
    const today = getTodayDate()
    setFilters((prev) => ({ ...prev, fromDate: today, toDate: today }))
  }

  const setThisMonth = () => {
    setFilters((prev) => ({
      ...prev,
      fromDate: getMonthStartDate(),
      toDate: getTodayDate(),
    }))
  }

  const summaryCards = [
    { label: 'Tổng doanh thu', value: formatCurrency(report.summary.revenue), variant: 'blue' },
    { label: 'Tổng chi phí', value: formatCurrency(report.summary.expenses), variant: 'orange' },
    { label: 'Lợi nhuận', value: formatCurrency(report.summary.profit), variant: 'green' },
    { label: 'Tổng thanh toán', value: formatCurrency(report.summary.serviceTotal), variant: 'slate' },
    { label: 'Tổng tips', value: formatCurrency(report.summary.tips), variant: 'orange' },
    { label: 'Tổng hoa hồng dịch vụ', value: formatCurrency(report.summary.commission), variant: 'purple' },
    { label: 'Tổng số hóa đơn', value: String(report.summary.invoiceCount), variant: 'slate' },
  ]

  return (
    <div className="report">
      <header className="report__header">
        <div>
          <h2 className="report__title">Báo cáo</h2>
          <p className="report__subtitle">
            {activeTab === REPORT_TABS.OVERVIEW
              ? (isEmployee()
                ? 'Tổng quan doanh thu chi nhánh'
                : 'Thống kê từ hóa đơn và chi phí đã lưu')
              : (isEmployee()
                ? 'Báo cáo lương nhân viên theo chu kỳ từ hóa đơn đã lưu'
                : 'Doanh số và lương từng nhân viên theo ngày/tháng từ hóa đơn đã đồng bộ')}
          </p>
        </div>
        {activeTab === REPORT_TABS.OVERVIEW && (
          <div className="report__quick">
            <button type="button" className="report__quick-btn" onClick={setToday}>
              Hôm nay
            </button>
            <button type="button" className="report__quick-btn" onClick={setThisMonth}>
              Tháng này
            </button>
          </div>
        )}
      </header>

      <nav className="report__tabs" aria-label="Loại báo cáo">
        {canViewOverviewReport() && (
          <button
            type="button"
            className={`report__tab ${activeTab === REPORT_TABS.OVERVIEW ? 'report__tab--active' : ''}`}
            onClick={() => setActiveTab(REPORT_TABS.OVERVIEW)}
          >
            Tổng quan
          </button>
        )}
        <button
          type="button"
          className={`report__tab ${activeTab === REPORT_TABS.SALARY ? 'report__tab--active' : ''}`}
          onClick={() => setActiveTab(REPORT_TABS.SALARY)}
        >
          {isEmployee() ? 'Lương nhân viên' : 'Báo cáo nhân viên'}
        </button>
      </nav>

      {activeTab === REPORT_TABS.SALARY || !canViewOverviewReport() ? (
        isEmployee() ? <EmployeeSalaryPanel /> : <AdminEmployeeReport />
      ) : isEmployee() ? (
        <EmployeeBranchOverview filters={filters} updateFilter={updateFilter} report={report} />
      ) : (
        <>
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
            onChange={(e) => updateFilter('fromDate', e.target.value)}
          />
        </label>
        <label className="report__field">
          <span>Đến ngày</span>
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => updateFilter('toDate', e.target.value)}
          />
        </label>
        {canSelectBranch() && (
          <label className="report__field">
            <span>Chi nhánh</span>
            <select value={filters.branchId} onChange={(e) => handleBranchChange(e.target.value)}>
              <option value="">Tất cả chi nhánh</option>
              {loadBranches().map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="report__field">
          <span>Nhân viên</span>
          <select
            value={filters.employeeId}
            onChange={(e) => updateFilter('employeeId', e.target.value)}
          >
            <option value="">Tất cả nhân viên</option>
            {branchEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="report__field">
          <span>Khuyến mãi</span>
          <select
            value={filters.discountFilter}
            onChange={(e) => updateFilter('discountFilter', e.target.value)}
          >
            <option value="">Tất cả hóa đơn</option>
            <option value="with">Chỉ có giảm giá</option>
            <option value="without">Không giảm giá</option>
          </select>
        </label>
      </section>

      <section className="report__summary">
        {summaryCards.map((card) => (
          <div key={card.label} className={`report-card report-card--${card.variant}`}>
            <p className="report-card__label">{card.label}</p>
            <p className="report-card__value">{card.value}</p>
          </div>
        ))}
      </section>

      <div className="report__tables">
        <ReportTable
          title="Báo cáo theo chi nhánh"
          headers={['Chi nhánh', 'Số hóa đơn', 'Doanh thu', 'Chi phí', 'Lợi nhuận', 'Tips', 'Hoa hồng']}
          emptyText="Không có dữ liệu trong khoảng thời gian đã chọn."
          rows={report.byBranch.map((row) => ({
            key: row.branchId || row.branchName,
            cells: (
              <>
                <td>{row.branchName}</td>
                <td className="report-table-card__num">{row.invoiceCount}</td>
                <td className="report-table-card__money">{formatCurrency(row.revenue)}</td>
                <td className="report-table-card__money report-table-card__expense">
                  {formatCurrency(row.expenses)}
                </td>
                <td className={`report-table-card__money ${row.profit >= 0 ? 'report-table-card__profit' : 'report-table-card__loss'}`}>
                  {formatCurrency(row.profit)}
                </td>
                <td className="report-table-card__money">{formatCurrency(row.tips)}</td>
                <td className="report-table-card__money report-table-card__commission">
                  {formatCurrency(row.commission)}
                </td>
              </>
            ),
          }))}
        />

        <ReportTable
          title="Báo cáo theo nhân viên"
          headers={['Nhân viên', 'Chi nhánh', 'Số hóa đơn', 'Doanh thu', 'Tips', 'Hoa hồng']}
          emptyText="Không có dữ liệu trong khoảng thời gian đã chọn."
          rows={report.byEmployee.map((row) => ({
            key: row.employeeId || row.employeeName,
            cells: (
              <>
                <td>{row.employeeName}</td>
                <td>{row.branchName}</td>
                <td className="report-table-card__num">{row.invoiceCount}</td>
                <td className="report-table-card__money">{formatCurrency(row.revenue)}</td>
                <td className="report-table-card__money">{formatCurrency(row.tips)}</td>
                <td className="report-table-card__money report-table-card__commission">
                  {formatCurrency(row.commission)}
                </td>
              </>
            ),
          }))}
        />

        <ReportTable
          title="Báo cáo theo dịch vụ"
          headers={['Dịch vụ', 'Số lượt', 'Doanh thu dịch vụ', 'Hoa hồng dịch vụ']}
          emptyText="Không có dữ liệu dịch vụ trong khoảng thời gian đã chọn."
          rows={report.byService.map((row) => ({
            key: row.serviceId || row.serviceName,
            cells: (
              <>
                <td>{row.serviceName}</td>
                <td className="report-table-card__num">{row.count}</td>
                <td className="report-table-card__money">{formatCurrency(row.revenue)}</td>
                <td className="report-table-card__money report-table-card__commission">
                  {formatCurrency(row.commission)}
                </td>
              </>
            ),
          }))}
        />
      </div>

      <section className="report__rankings">
        <h3 className="report__rankings-title">Bảng xếp hạng</h3>
        <div className="report__tables">
          <ReportTable
            title="Top dịch vụ bán nhiều nhất"
            headers={['Hạng', 'Dịch vụ', 'Số lượt bán', 'Doanh thu dịch vụ', 'Hoa hồng dịch vụ']}
            emptyText="Chưa có dữ liệu"
            rows={report.topServices.map((row, index) => ({
              key: row.serviceId || row.serviceName,
              cells: (
                <>
                  <td className="report-table-card__rank">{index + 1}</td>
                  <td>{row.serviceName}</td>
                  <td className="report-table-card__num">{row.count}</td>
                  <td className="report-table-card__money">{formatCurrency(row.revenue)}</td>
                  <td className="report-table-card__money report-table-card__commission">
                    {formatCurrency(row.commission)}
                  </td>
                </>
              ),
            }))}
          />

          <ReportTable
            title="Top nhân viên bán nhiều dịch vụ nhất"
            headers={[
              'Hạng',
              'Nhân viên',
              'Chi nhánh',
              'Số hóa đơn',
              'Tổng số dịch vụ đã làm',
              'Tổng doanh thu',
              'Tổng tips',
              'Tổng hoa hồng',
            ]}
            emptyText="Chưa có dữ liệu"
            rows={report.topEmployeesByServices.map((row, index) => ({
              key: row.employeeId || row.employeeName,
              cells: (
                <>
                  <td className="report-table-card__rank">{index + 1}</td>
                  <td>{row.employeeName}</td>
                  <td>{row.branchName}</td>
                  <td className="report-table-card__num">{row.invoiceCount}</td>
                  <td className="report-table-card__num">{row.serviceCount}</td>
                  <td className="report-table-card__money">{formatCurrency(row.revenue)}</td>
                  <td className="report-table-card__money">{formatCurrency(row.tips)}</td>
                  <td className="report-table-card__money report-table-card__commission">
                    {formatCurrency(row.commission)}
                  </td>
                </>
              ),
            }))}
          />

          <ReportTable
            title="Top nhân viên doanh thu cao nhất"
            headers={[
              'Hạng',
              'Nhân viên',
              'Chi nhánh',
              'Số hóa đơn',
              'Tổng doanh thu',
              'Tổng hoa hồng',
            ]}
            emptyText="Chưa có dữ liệu"
            rows={report.topEmployeesByRevenue.map((row, index) => ({
              key: row.employeeId || row.employeeName,
              cells: (
                <>
                  <td className="report-table-card__rank">{index + 1}</td>
                  <td>{row.employeeName}</td>
                  <td>{row.branchName}</td>
                  <td className="report-table-card__num">{row.invoiceCount}</td>
                  <td className="report-table-card__money">{formatCurrency(row.revenue)}</td>
                  <td className="report-table-card__money report-table-card__commission">
                    {formatCurrency(row.commission)}
                  </td>
                </>
              ),
            }))}
          />
        </div>
      </section>
        </>
      )}
    </div>
  )
}
