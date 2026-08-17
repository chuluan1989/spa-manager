import { useMemo, useState } from 'react'
import {
  canExportReport,
  canSelectBranch,
  isAdmin,
} from '../../constants/auth'
import { loadBranches } from '../../constants/branches'
import { formatCurrency } from '../../utils/invoice'
import { getMonthStartDate, getTodayDate } from '../../utils/invoiceStorage'
import {
  buildDefaultManagementFilters,
  useManagementReportsData,
} from '../../hooks/useManagementReportsData'
import {
  EMPLOYEE_INVOICE_DRILL_MODES,
  buildBranchEmployeeInsights,
  buildEmployeeDailyRevenue,
  buildEmployeeInvoiceList,
} from '../../utils/managementReports/managementMetrics'
import {
  buildRevenueInsights,
  buildTopMovers,
  resolveKpiTone,
} from '../../utils/managementReports/managementInsights'
import {
  exportManagementBranchCsv,
  exportManagementEmployeeCsv,
} from '../../utils/managementReports/managementReportsExport'
import './ManagementReports.css'

function TrendCell({ trend, previousValue, formatPrev }) {
  if (!trend) return <span className="mgmt-trend is-neutral">—</span>
  const title = previousValue != null
    ? `Kỳ trước: ${formatPrev ? formatPrev(previousValue) : previousValue}`
    : trend.label
  const tone = resolveKpiTone(trend)
  return (
    <span className={`mgmt-trend is-${tone}`} title={title}>
      {trend.direction === 'up' || trend.direction === 'new' ? '↑ ' : trend.direction === 'down' ? '↓ ' : ''}
      {trend.label}
    </span>
  )
}

function TopMoversPanel({ title, rows, onSelect }) {
  const byRevenue = buildTopMovers(rows, { metric: 'revenue', limit: 5 })
  const byRequested = buildTopMovers(rows, { metric: 'customerRequestedTourRate', limit: 5 })

  const RowList = ({ list, trendKey, empty }) => (
    <ul className="mgmt-top__list">
      {list.length === 0 && <li className="mgmt-muted">{empty}</li>}
      {list.map((row) => (
        <li key={`${trendKey}-${row.id}`}>
          <button type="button" onClick={() => onSelect?.(row.id)}>
            {row.name}
          </button>
          <TrendCell trend={row[trendKey]} />
        </li>
      ))}
    </ul>
  )

  return (
    <section className="mgmt-top" aria-label={title}>
      <h3>{title}</h3>
      <div className="mgmt-top__grid">
        <div>
          <h4>TOP tăng · Doanh thu</h4>
          <RowList list={byRevenue.gainers} trendKey="revenueTrend" empty="Không có" />
        </div>
        <div>
          <h4>TOP giảm · Doanh thu</h4>
          <RowList list={byRevenue.losers} trendKey="revenueTrend" empty="Không có" />
        </div>
        <div>
          <h4>TOP tăng · Tỷ lệ YC</h4>
          <RowList list={byRequested.gainers} trendKey="customerRequestedTourRateTrend" empty="Không có" />
        </div>
        <div>
          <h4>TOP giảm · Tỷ lệ YC</h4>
          <RowList list={byRequested.losers} trendKey="customerRequestedTourRateTrend" empty="Không có" />
        </div>
      </div>
    </section>
  )
}

function InsightBlock({ row }) {
  const insights = buildRevenueInsights(row)
  if (!insights.length) return null
  return (
    <div className="mgmt-insight">
      <h4>Insight</h4>
      <ul>
        {insights.map((item) => (
          <li key={item.id} className={`is-${item.tone || 'neutral'}${item.isHeadline ? ' is-headline' : ''}`}>
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatMoneyOrDash(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return formatCurrency(value)
}

function formatRate(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value}%`
}

function sortRows(rows, sortKey, sortDir) {
  const dir = sortDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity
    const bv = b[sortKey] ?? -Infinity
    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av).localeCompare(String(bv), 'vi') * dir
    }
    return (Number(av) - Number(bv)) * dir
  })
}

const DRILL_MODE_LABELS = {
  [EMPLOYEE_INVOICE_DRILL_MODES.PRIMARY]: 'Tour chính',
  [EMPLOYEE_INVOICE_DRILL_MODES.SUPPORT]: 'Tour hỗ trợ',
  [EMPLOYEE_INVOICE_DRILL_MODES.REQUESTED]: 'Khách yêu cầu',
  [EMPLOYEE_INVOICE_DRILL_MODES.ALL]: 'Tất cả tour',
}

function EmployeeInvoiceDrillTable({ invoices }) {
  if (invoices.length === 0) {
    return <p className="mgmt-muted">Không có hóa đơn trong bộ lọc này.</p>
  }

  return (
    <div className="mgmt-drill-wrap">
      <table className="mgmt-drill-table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Mã HĐ</th>
            <th>Khách hàng</th>
            <th>SĐT</th>
            <th>CN phục vụ</th>
            <th>Dịch vụ</th>
            <th>Thành tiền</th>
            <th>NV chính</th>
            <th>NV hỗ trợ</th>
            <th>Khách YC</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td>{inv.date}{inv.time ? ` ${inv.time}` : ''}</td>
              <td className="mgmt-mono">{inv.id}</td>
              <td>{inv.customerName}</td>
              <td>{inv.customerPhone || '—'}</td>
              <td>{inv.branchName}</td>
              <td className="mgmt-drill-services">{inv.serviceNames}</td>
              <td className="is-num">{formatMoneyOrDash(inv.revenue)}</td>
              <td>{inv.employeeName}</td>
              <td>{inv.supportEmployeeName || '—'}</td>
              <td>{inv.customerRequested ? 'Có' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ManagementReports({ onNavigate }) {
  const [view, setView] = useState('branch')
  const [filters, setFilters] = useState(() => buildDefaultManagementFilters())
  const [selectedBranchId, setSelectedBranchId] = useState(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
  const [employeeDrillMode, setEmployeeDrillMode] = useState(EMPLOYEE_INVOICE_DRILL_MODES.PRIMARY)

  const data = useManagementReportsData(filters)

  const branches = useMemo(() => loadBranches().filter((b) => b?.id), [])

  const filteredEmployees = useMemo(() => {
    const q = filters.employeeQuery.trim().toLowerCase()
    let rows = data.employeeRows ?? []
    if (q) {
      rows = rows.filter((row) =>
        `${row.name} ${row.branchName}`.toLowerCase().includes(q),
      )
    }
    return sortRows(rows, filters.sortKey, filters.sortDir)
  }, [data.employeeRows, filters.employeeQuery, filters.sortKey, filters.sortDir])

  const filteredBranches = useMemo(() => {
    let rows = data.branchRows ?? []
    if (filters.branchId) {
      rows = rows.filter((row) => row.branchId === filters.branchId)
    }
    return sortRows(rows, filters.sortKey, filters.sortDir)
  }, [data.branchRows, filters.branchId, filters.sortKey, filters.sortDir])

  const selectedBranch = filteredBranches.find((r) => r.id === selectedBranchId)
    || data.branchRows?.find((r) => r.id === selectedBranchId)
  const selectedEmployee = filteredEmployees.find((r) => r.id === selectedEmployeeId)
    || data.employeeRows?.find((r) => r.id === selectedEmployeeId)

  const branchInsights = useMemo(() => {
    if (!selectedBranch) return null
    return buildBranchEmployeeInsights(
      selectedBranch.branchId,
      data.employeeRows ?? [],
      data.currentInvoices ?? [],
      filters.fromDate,
      filters.toDate,
    )
  }, [selectedBranch, data.employeeRows, data.currentInvoices, filters.fromDate, filters.toDate])

  const employeeInvoices = useMemo(() => {
    if (!selectedEmployee) return []
    return buildEmployeeInvoiceList(
      data.currentInvoices ?? [],
      selectedEmployee.employeeId,
      employeeDrillMode,
    )
  }, [selectedEmployee, data.currentInvoices, employeeDrillMode])

  const employeeTrend = useMemo(() => {
    if (!selectedEmployee) return []
    return buildEmployeeDailyRevenue(
      data.currentInvoices ?? [],
      selectedEmployee.employeeId,
      filters.fromDate,
      filters.toDate,
    )
  }, [selectedEmployee, data.currentInvoices, filters.fromDate, filters.toDate])

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const setQuickMonth = () => {
    setFilters((prev) => ({
      ...prev,
      fromDate: getMonthStartDate(),
      toDate: getTodayDate(),
    }))
  }

  const handleExport = () => {
    if (!canExportReport()) return
    if (view === 'branch') {
      exportManagementBranchCsv(filteredBranches, filters, data.compare)
    } else {
      exportManagementEmployeeCsv(filteredEmployees, filters, data.compare)
    }
  }

  const toggleSort = (key) => {
    setFilters((prev) => ({
      ...prev,
      sortKey: key,
      sortDir: prev.sortKey === key && prev.sortDir === 'desc' ? 'asc' : 'desc',
    }))
  }

  const selectEmployee = (employeeId, drillMode = EMPLOYEE_INVOICE_DRILL_MODES.PRIMARY) => {
    setSelectedEmployeeId(employeeId)
    setEmployeeDrillMode(drillMode)
  }

  const openEmployeeDrill = (event, employeeId, drillMode) => {
    event.stopPropagation()
    selectEmployee(employeeId, drillMode)
  }

  const employeeColSpan = filters.branchId || !isAdmin() ? 11 : 12

  return (
    <div className="mgmt-reports">
      <header className="mgmt-reports__header">
        <div>
          <h2>Báo cáo quản trị</h2>
          <p>
            So sánh kỳ hiện tại với
            {' '}
            {data.compare?.fromDate && data.compare?.toDate
              ? `${data.compare.fromDate} → ${data.compare.toDate}`
              : '—'}
            {data.compare?.mode === 'mtd-same-days' ? ' (cùng số ngày tháng trước)' : ''}
            {data.compare?.mode === 'full-month' ? ' (cả tháng trước)' : ''}
          </p>
        </div>
        <div className="mgmt-reports__actions">
          <button type="button" className="mgmt-btn" onClick={data.reload} disabled={data.loading}>
            {data.loading ? 'Đang tải…' : 'Làm mới'}
          </button>
          {canExportReport() && (
            <button type="button" className="mgmt-btn mgmt-btn--primary" onClick={handleExport}>
              Xuất Excel
            </button>
          )}
        </div>
      </header>

      <div className="mgmt-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={view === 'branch' ? 'is-active' : ''}
          aria-selected={view === 'branch'}
          onClick={() => { setView('branch'); setSelectedEmployeeId(null) }}
        >
          Chi nhánh
        </button>
        <button
          type="button"
          role="tab"
          className={view === 'employee' ? 'is-active' : ''}
          aria-selected={view === 'employee'}
          onClick={() => { setView('employee'); setSelectedBranchId(null) }}
        >
          Nhân viên
        </button>
      </div>

      <div className="mgmt-filters">
        <label>
          Từ ngày
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => updateFilter('fromDate', e.target.value)}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => updateFilter('toDate', e.target.value)}
          />
        </label>
        <button type="button" className="mgmt-btn" onClick={setQuickMonth}>Tháng này</button>
        {canSelectBranch() && (
          <label>
            Chi nhánh
            <select
              value={filters.branchId}
              onChange={(e) => updateFilter('branchId', e.target.value)}
            >
              <option value="">Tất cả</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        )}
        {view === 'employee' && (
          <label className="mgmt-filters__search">
            Tìm nhân viên
            <input
              type="search"
              value={filters.employeeQuery}
              placeholder="Tên nhân viên…"
              onChange={(e) => updateFilter('employeeQuery', e.target.value)}
            />
          </label>
        )}
      </div>

      {data.error ? <p className="mgmt-error">{data.error}</p> : null}

      {view === 'branch' && (
        <TopMoversPanel
          title="TOP tăng / giảm — Chi nhánh"
          rows={filteredBranches}
          onSelect={(id) => setSelectedBranchId(id)}
        />
      )}

      {view === 'employee' && (
        <TopMoversPanel
          title="TOP tăng / giảm — Nhân viên"
          rows={filteredEmployees}
          onSelect={(id) => selectEmployee(id)}
        />
      )}

      {view === 'branch' && (
        <div className="mgmt-layout">
          <div className="mgmt-table-wrap">
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th><button type="button" onClick={() => toggleSort('name')}>Tên</button></th>
                  <th><button type="button" onClick={() => toggleSort('revenue')}>Doanh thu</button></th>
                  <th>Tăng/giảm</th>
                  <th><button type="button" onClick={() => toggleSort('totalCustomerCount')}>Tổng khách</button></th>
                  <th><button type="button" onClick={() => toggleSort('invoiceCount')}>Tổng tour</button></th>
                  <th><button type="button" onClick={() => toggleSort('customerRequestedTourCount')}>Khách yêu cầu</button></th>
                  <th><button type="button" onClick={() => toggleSort('customerRequestedTourRate')}>Tỷ lệ YC/tour</button></th>
                  <th><button type="button" onClick={() => toggleSort('tips')}>Tips</button></th>
                  <th><button type="button" onClick={() => toggleSort('cashAmount')}>Tiền mặt</button></th>
                  <th><button type="button" onClick={() => toggleSort('bankTransferAmount')}>Chuyển khoản</button></th>
                  <th><button type="button" onClick={() => toggleSort('totalCollected')}>Tổng thu</button></th>
                  <th><button type="button" onClick={() => toggleSort('ticketRevenuePerInvoice')}>Tiền vé/HĐ</button></th>
                  <th><button type="button" onClick={() => toggleSort('tipsPerInvoice')}>Tips/HĐ</button></th>
                </tr>
              </thead>
              <tbody>
                {filteredBranches.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedBranchId === row.id ? 'is-selected' : ''}
                    onClick={() => setSelectedBranchId(row.id)}
                  >
                    <td>{row.name}</td>
                    <td className="is-num">{formatMoneyOrDash(row.revenue)}</td>
                    <td>
                      <TrendCell
                        trend={row.revenueTrend}
                        previousValue={row.previous?.revenue}
                        formatPrev={formatMoneyOrDash}
                      />
                    </td>
                    <td className="is-num">{row.totalCustomerCount}</td>
                    <td className="is-num">{row.invoiceCount}</td>
                    <td className="is-num">{row.customerRequestedTourCount}</td>
                    <td className="is-num">{formatRate(row.customerRequestedTourRate)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.tips)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.cashAmount)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.bankTransferAmount)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.totalCollected)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.ticketRevenuePerInvoice)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.tipsPerInvoice)}</td>
                  </tr>
                ))}
                {!data.loading && filteredBranches.length === 0 && (
                  <tr><td colSpan={13} className="mgmt-empty">Không có dữ liệu chi nhánh.</td></tr>
                )}
              </tbody>
              {data.systemRow && filteredBranches.length > 0 && (
                <tfoot>
                  <tr className="is-total">
                    <td>{data.systemRow.name}</td>
                    <td className="is-num">{formatMoneyOrDash(data.systemRow.revenue)}</td>
                    <td>
                      <TrendCell
                        trend={data.systemRow.revenueTrend}
                        previousValue={data.systemRow.previous?.revenue}
                        formatPrev={formatMoneyOrDash}
                      />
                    </td>
                    <td className="is-num">{data.systemRow.totalCustomerCount}</td>
                    <td className="is-num">{data.systemRow.invoiceCount}</td>
                    <td className="is-num">{data.systemRow.customerRequestedTourCount}</td>
                    <td className="is-num">{formatRate(data.systemRow.customerRequestedTourRate)}</td>
                    <td className="is-num">{formatMoneyOrDash(data.systemRow.tips)}</td>
                    <td className="is-num">{formatMoneyOrDash(data.systemRow.cashAmount)}</td>
                    <td className="is-num">{formatMoneyOrDash(data.systemRow.bankTransferAmount)}</td>
                    <td className="is-num">{formatMoneyOrDash(data.systemRow.totalCollected)}</td>
                    <td className="is-num">{formatMoneyOrDash(data.systemRow.ticketRevenuePerInvoice)}</td>
                    <td className="is-num">{formatMoneyOrDash(data.systemRow.tipsPerInvoice)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {selectedBranch && (
            <aside className="mgmt-detail">
              <header>
                <h3>{selectedBranch.name}</h3>
                <button type="button" className="mgmt-btn" onClick={() => setSelectedBranchId(null)}>Đóng</button>
              </header>
              <dl className="mgmt-detail__grid">
                <div><dt>Doanh thu</dt><dd className={`mgmt-kpi is-${resolveKpiTone(selectedBranch.revenueTrend)}`}>{formatMoneyOrDash(selectedBranch.revenue)}</dd></div>
                <div><dt>vs kỳ trước</dt><dd><TrendCell trend={selectedBranch.revenueTrend} previousValue={selectedBranch.previous?.revenue} formatPrev={formatMoneyOrDash} /></dd></div>
                <div><dt>Tổng khách</dt><dd>{selectedBranch.totalCustomerCount}</dd></div>
                <div><dt>Khách yêu cầu (lượt tour)</dt><dd>{selectedBranch.customerRequestedTourCount}</dd></div>
                <div><dt>Tổng tour</dt><dd>{selectedBranch.invoiceCount}</dd></div>
                <div><dt>Tỷ lệ YC/tour</dt><dd>{formatRate(selectedBranch.customerRequestedTourRate)} <TrendCell trend={selectedBranch.customerRequestedTourRateTrend} previousValue={selectedBranch.previous?.customerRequestedTourRate} formatPrev={formatRate} /></dd></div>
                <div><dt>Tips</dt><dd>{formatMoneyOrDash(selectedBranch.tips)} <TrendCell trend={selectedBranch.tipsTrend} previousValue={selectedBranch.previous?.tips} formatPrev={formatMoneyOrDash} /></dd></div>
                <div><dt>Tiền mặt</dt><dd>{formatMoneyOrDash(selectedBranch.cashAmount)}</dd></div>
                <div><dt>Chuyển khoản</dt><dd>{formatMoneyOrDash(selectedBranch.bankTransferAmount)}</dd></div>
                <div><dt>Chưa xác định PTTT</dt><dd>{formatMoneyOrDash(selectedBranch.unknownPaymentAmount)}</dd></div>
                <div><dt>Tổng thu (khách trả)</dt><dd>{formatMoneyOrDash(selectedBranch.totalCollected)}</dd></div>
                <div><dt>Tỷ lệ tiền mặt</dt><dd>{`${Number(selectedBranch.cashRatePercent ?? 0).toFixed(1)}%`}</dd></div>
                <div><dt>Tỷ lệ chuyển khoản</dt><dd>{`${Number(selectedBranch.bankTransferRatePercent ?? 0).toFixed(1)}%`}</dd></div>
                <div><dt>Tiền vé/HĐ</dt><dd>{formatMoneyOrDash(selectedBranch.ticketRevenuePerInvoice)}</dd></div>
                <div><dt>Tips/HĐ</dt><dd>{formatMoneyOrDash(selectedBranch.tipsPerInvoice)}</dd></div>
                <div><dt>Invoice TB</dt><dd>{formatMoneyOrDash(selectedBranch.averageTicket)} <TrendCell trend={selectedBranch.averageTicketTrend} previousValue={selectedBranch.previous?.averageTicket} formatPrev={formatMoneyOrDash} /></dd></div>
                <div><dt>DT/ngày</dt><dd>{formatMoneyOrDash(selectedBranch.averageRevenuePerDay)}</dd></div>
                <div><dt>Lợi nhuận</dt><dd>{selectedBranch.profitAvailable ? formatMoneyOrDash(selectedBranch.profit) : '—'}</dd></div>
              </dl>

              <InsightBlock row={selectedBranch} />

              {branchInsights && (
                <>
                  <h4>Nhân viên</h4>
                  <p className="mgmt-muted">
                    Tăng mạnh nhất:
                    {' '}
                    {branchInsights.topGainer
                      ? `${branchInsights.topGainer.name} (${branchInsights.topGainer.revenueTrend?.label})`
                      : '—'}
                  </p>
                  <p className="mgmt-muted">
                    Giảm mạnh nhất:
                    {' '}
                    {branchInsights.topLoser
                      ? `${branchInsights.topLoser.name} (${branchInsights.topLoser.revenueTrend?.label})`
                      : '—'}
                  </p>
                  <ul className="mgmt-mini-list">
                    {branchInsights.employees.slice(0, 12).map((emp) => (
                      <li key={emp.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setView('employee')
                            selectEmployee(emp.id)
                            setSelectedBranchId(null)
                          }}
                        >
                          {emp.name}
                        </button>
                        <span>{formatRate(emp.customerRequestedTourRate)}</span>
                        <strong>{formatMoneyOrDash(emp.revenue)}</strong>
                      </li>
                    ))}
                  </ul>
                  <h4>Dịch vụ tạo DT nhiều nhất</h4>
                  <ul className="mgmt-mini-list">
                    {branchInsights.topServices.map((svc) => (
                      <li key={svc.id}>
                        <span>{svc.name}</span>
                        <strong>{formatMoneyOrDash(svc.revenue)}</strong>
                      </li>
                    ))}
                    {branchInsights.topServices.length === 0 && <li className="mgmt-muted">Không có dịch vụ.</li>}
                  </ul>
                </>
              )}
            </aside>
          )}
        </div>
      )}

      {view === 'employee' && (
        <div className="mgmt-layout mgmt-layout--employee">
          <div className="mgmt-table-wrap">
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th><button type="button" onClick={() => toggleSort('name')}>Tên</button></th>
                  {!filters.branchId && isAdmin() && <th>Chi nhánh</th>}
                  <th><button type="button" onClick={() => toggleSort('mainTourCount')}>Tour chính</button></th>
                  <th><button type="button" onClick={() => toggleSort('supportTourCount')}>Tour hỗ trợ</button></th>
                  <th><button type="button" onClick={() => toggleSort('totalTourCount')}>Tổng tour</button></th>
                  <th><button type="button" onClick={() => toggleSort('customerRequestedTourCount')}>Khách yêu cầu</button></th>
                  <th><button type="button" onClick={() => toggleSort('customerRequestedTourRate')}>Tỷ lệ YC (%)</button></th>
                  <th><button type="button" onClick={() => toggleSort('revenue')}>Doanh thu</button></th>
                  <th>Tăng/giảm</th>
                  <th><button type="button" onClick={() => toggleSort('tips')}>Tips</button></th>
                  <th><button type="button" onClick={() => toggleSort('totalSalary')}>Lương</button></th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedEmployeeId === row.id ? 'is-selected' : ''}
                    onClick={() => selectEmployee(row.id, EMPLOYEE_INVOICE_DRILL_MODES.PRIMARY)}
                  >
                    <td>{row.name}</td>
                    {!filters.branchId && isAdmin() && <td>{row.branchName}</td>}
                    <td className="is-num">
                      <button
                        type="button"
                        className="mgmt-drill-link"
                        onClick={(e) => openEmployeeDrill(e, row.id, EMPLOYEE_INVOICE_DRILL_MODES.PRIMARY)}
                      >
                        {row.mainTourCount ?? 0}
                      </button>
                    </td>
                    <td className="is-num">
                      <button
                        type="button"
                        className="mgmt-drill-link"
                        onClick={(e) => openEmployeeDrill(e, row.id, EMPLOYEE_INVOICE_DRILL_MODES.SUPPORT)}
                      >
                        {row.supportTourCount ?? 0}
                      </button>
                    </td>
                    <td className="is-num">{row.totalTourCount ?? row.invoiceCount ?? 0}</td>
                    <td className="is-num">
                      <button
                        type="button"
                        className="mgmt-drill-link"
                        onClick={(e) => openEmployeeDrill(e, row.id, EMPLOYEE_INVOICE_DRILL_MODES.REQUESTED)}
                      >
                        {row.customerRequestedTourCount ?? 0}
                      </button>
                    </td>
                    <td className="is-num">{formatRate(row.customerRequestedTourRate)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.revenue)}</td>
                    <td>
                      <TrendCell
                        trend={row.revenueTrend}
                        previousValue={row.previous?.revenue}
                        formatPrev={formatMoneyOrDash}
                      />
                    </td>
                    <td className="is-num">{formatMoneyOrDash(row.tips)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.totalSalary)}</td>
                  </tr>
                ))}
                {!data.loading && filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={employeeColSpan} className="mgmt-empty">
                      Không có dữ liệu nhân viên.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedEmployee && (
            <aside className="mgmt-detail">
              <header>
                <h3>{selectedEmployee.name}</h3>
                <button type="button" className="mgmt-btn" onClick={() => setSelectedEmployeeId(null)}>Đóng</button>
              </header>
              <p className="mgmt-muted">{selectedEmployee.branchName}</p>
              <dl className="mgmt-detail__grid">
                <div>
                  <dt>Tour chính</dt>
                  <dd>
                    <button
                      type="button"
                      className={`mgmt-drill-link${employeeDrillMode === EMPLOYEE_INVOICE_DRILL_MODES.PRIMARY ? ' is-active' : ''}`}
                      onClick={() => setEmployeeDrillMode(EMPLOYEE_INVOICE_DRILL_MODES.PRIMARY)}
                    >
                      {selectedEmployee.mainTourCount ?? 0}
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>Tour hỗ trợ</dt>
                  <dd>
                    <button
                      type="button"
                      className={`mgmt-drill-link${employeeDrillMode === EMPLOYEE_INVOICE_DRILL_MODES.SUPPORT ? ' is-active' : ''}`}
                      onClick={() => setEmployeeDrillMode(EMPLOYEE_INVOICE_DRILL_MODES.SUPPORT)}
                    >
                      {selectedEmployee.supportTourCount ?? 0}
                    </button>
                  </dd>
                </div>
                <div><dt>Tổng tour</dt><dd>{selectedEmployee.totalTourCount ?? selectedEmployee.invoiceCount ?? 0}</dd></div>
                <div>
                  <dt>Khách yêu cầu</dt>
                  <dd>
                    <button
                      type="button"
                      className={`mgmt-drill-link${employeeDrillMode === EMPLOYEE_INVOICE_DRILL_MODES.REQUESTED ? ' is-active' : ''}`}
                      onClick={() => setEmployeeDrillMode(EMPLOYEE_INVOICE_DRILL_MODES.REQUESTED)}
                    >
                      {selectedEmployee.customerRequestedTourCount ?? 0}
                    </button>
                  </dd>
                </div>
                <div><dt>Tỷ lệ YC / tour chính</dt><dd>{formatRate(selectedEmployee.customerRequestedTourRate)} <TrendCell trend={selectedEmployee.customerRequestedTourRateTrend} previousValue={selectedEmployee.previous?.customerRequestedTourRate} formatPrev={formatRate} /></dd></div>
                <div><dt>Doanh thu</dt><dd className={`mgmt-kpi is-${resolveKpiTone(selectedEmployee.revenueTrend)}`}>{formatMoneyOrDash(selectedEmployee.revenue)}</dd></div>
                <div><dt>Tips</dt><dd>{formatMoneyOrDash(selectedEmployee.tips)} <TrendCell trend={selectedEmployee.tipsTrend} previousValue={selectedEmployee.previous?.tips} formatPrev={formatMoneyOrDash} /></dd></div>
                <div><dt>Lương</dt><dd>{formatMoneyOrDash(selectedEmployee.totalSalary)} <TrendCell trend={selectedEmployee.totalSalaryTrend} previousValue={selectedEmployee.previous?.totalSalary} formatPrev={formatMoneyOrDash} /></dd></div>
                <div><dt>vs kỳ trước (DT)</dt><dd><TrendCell trend={selectedEmployee.revenueTrend} previousValue={selectedEmployee.previous?.revenue} formatPrev={formatMoneyOrDash} /></dd></div>
                <div><dt>Ngày làm hợp lệ</dt><dd>{selectedEmployee.workDays}</dd></div>
                <div><dt>DT/ngày làm</dt><dd>{formatMoneyOrDash(selectedEmployee.averageRevenuePerWorkDay)}</dd></div>
                <div><dt>Hạng DT trong CN</dt><dd>{selectedEmployee.revenueRankInBranch}/{selectedEmployee.revenueRankTotal}</dd></div>
              </dl>

              <InsightBlock row={selectedEmployee} />

              <h4>Xu hướng doanh thu theo ngày</h4>
              <div className="mgmt-bars" aria-label="Biểu đồ doanh thu ngày">
                {employeeTrend.map((point) => {
                  const max = Math.max(...employeeTrend.map((p) => p.revenue), 1)
                  const height = Math.round((point.revenue / max) * 100)
                  return (
                    <div key={point.date} className="mgmt-bars__col" title={`${point.date}: ${formatMoneyOrDash(point.revenue)}`}>
                      <div className="mgmt-bars__fill" style={{ height: `${height}%` }} />
                    </div>
                  )
                })}
                {employeeTrend.length === 0 && <p className="mgmt-muted">Không có dữ liệu.</p>}
              </div>

              <div className="mgmt-drill-tabs" role="tablist" aria-label="Lọc hóa đơn theo loại tour">
                {Object.entries(DRILL_MODE_LABELS).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    className={employeeDrillMode === mode ? 'is-active' : ''}
                    aria-selected={employeeDrillMode === mode}
                    onClick={() => setEmployeeDrillMode(mode)}
                  >
                    {label}
                    {mode === EMPLOYEE_INVOICE_DRILL_MODES.PRIMARY ? ` (${selectedEmployee.mainTourCount ?? 0})` : ''}
                    {mode === EMPLOYEE_INVOICE_DRILL_MODES.SUPPORT ? ` (${selectedEmployee.supportTourCount ?? 0})` : ''}
                    {mode === EMPLOYEE_INVOICE_DRILL_MODES.REQUESTED ? ` (${selectedEmployee.customerRequestedTourCount ?? 0})` : ''}
                    {mode === EMPLOYEE_INVOICE_DRILL_MODES.ALL ? ` (${selectedEmployee.totalTourCount ?? 0})` : ''}
                  </button>
                ))}
              </div>

              <h4>
                Hóa đơn —
                {' '}
                {DRILL_MODE_LABELS[employeeDrillMode] || 'Tour chính'}
                {' '}
                (
                {employeeInvoices.length}
                )
              </h4>
              <EmployeeInvoiceDrillTable invoices={employeeInvoices} />

              {typeof onNavigate === 'function' && (
                <button
                  type="button"
                  className="mgmt-btn mgmt-btn--primary"
                  onClick={() => onNavigate('invoices')}
                >
                  Mở Hóa đơn
                </button>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
