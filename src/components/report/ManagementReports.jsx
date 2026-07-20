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
  buildBranchEmployeeInsights,
  buildEmployeeDailyRevenue,
  buildEmployeeInvoiceList,
} from '../../utils/managementReports/managementMetrics'
import {
  exportManagementBranchCsv,
  exportManagementEmployeeCsv,
} from '../../utils/managementReports/managementReportsExport'
import './ManagementReports.css'

function TrendCell({ trend, previousValue, formatPrev }) {
  if (!trend) return <span className="mgmt-trend is-none">—</span>
  const title = previousValue != null
    ? `Kỳ trước: ${formatPrev ? formatPrev(previousValue) : previousValue}`
    : trend.label
  return (
    <span className={`mgmt-trend is-${trend.direction}`} title={title}>
      {trend.direction === 'up' ? '↑ ' : trend.direction === 'down' ? '↓ ' : ''}
      {trend.label}
    </span>
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

export default function ManagementReports({ onNavigate }) {
  const [view, setView] = useState('branch')
  const [filters, setFilters] = useState(() => buildDefaultManagementFilters())
  const [selectedBranchId, setSelectedBranchId] = useState(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)

  const data = useManagementReportsData(filters)

  const branches = useMemo(() => loadBranches().filter((b) => b?.id), [])

  const filteredEmployees = useMemo(() => {
    const q = filters.employeeQuery.trim().toLowerCase()
    let rows = data.employeeRows ?? []
    if (filters.branchId) {
      rows = rows.filter((row) => row.branchId === filters.branchId)
    }
    if (q) {
      rows = rows.filter((row) =>
        `${row.name} ${row.branchName}`.toLowerCase().includes(q),
      )
    }
    return sortRows(rows, filters.sortKey, filters.sortDir)
  }, [data.employeeRows, filters.branchId, filters.employeeQuery, filters.sortKey, filters.sortDir])

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
    return buildEmployeeInvoiceList(data.currentInvoices ?? [], selectedEmployee.employeeId)
  }, [selectedEmployee, data.currentInvoices])

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
        <div className="mgmt-layout">
          <div className="mgmt-table-wrap">
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th><button type="button" onClick={() => toggleSort('name')}>Tên</button></th>
                  <th><button type="button" onClick={() => toggleSort('revenue')}>Doanh thu</button></th>
                  <th>Tăng/giảm</th>
                  <th><button type="button" onClick={() => toggleSort('totalCustomerCount')}>Tổng khách</button></th>
                  <th><button type="button" onClick={() => toggleSort('requestedCustomerCount')}>Khách yêu cầu</button></th>
                  <th><button type="button" onClick={() => toggleSort('requestedRate')}>Tỷ lệ YC</button></th>
                  <th><button type="button" onClick={() => toggleSort('tips')}>Tips</button></th>
                  <th><button type="button" onClick={() => toggleSort('averageRevenuePerCustomer')}>DT/khách</button></th>
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
                    <td className="is-num">{row.requestedCustomerCount}</td>
                    <td className="is-num">{formatRate(row.requestedRate)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.tips)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.averageRevenuePerCustomer)}</td>
                  </tr>
                ))}
                {!data.loading && filteredBranches.length === 0 && (
                  <tr><td colSpan={8} className="mgmt-empty">Không có dữ liệu chi nhánh.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedBranch && (
            <aside className="mgmt-detail">
              <header>
                <h3>{selectedBranch.name}</h3>
                <button type="button" className="mgmt-btn" onClick={() => setSelectedBranchId(null)}>Đóng</button>
              </header>
              <dl className="mgmt-detail__grid">
                <div><dt>Doanh thu</dt><dd>{formatMoneyOrDash(selectedBranch.revenue)}</dd></div>
                <div><dt>vs kỳ trước</dt><dd><TrendCell trend={selectedBranch.revenueTrend} previousValue={selectedBranch.previous?.revenue} formatPrev={formatMoneyOrDash} /></dd></div>
                <div><dt>Tổng khách</dt><dd>{selectedBranch.totalCustomerCount}</dd></div>
                <div><dt>Khách yêu cầu</dt><dd>{selectedBranch.requestedCustomerCount}</dd></div>
                <div><dt>Tỷ lệ YC</dt><dd>{formatRate(selectedBranch.requestedRate)} <TrendCell trend={selectedBranch.requestedRateTrend} previousValue={selectedBranch.previous?.requestedRate} formatPrev={formatRate} /></dd></div>
                <div><dt>Tips</dt><dd>{formatMoneyOrDash(selectedBranch.tips)} <TrendCell trend={selectedBranch.tipsTrend} previousValue={selectedBranch.previous?.tips} formatPrev={formatMoneyOrDash} /></dd></div>
                <div><dt>DT/khách</dt><dd>{formatMoneyOrDash(selectedBranch.averageRevenuePerCustomer)}</dd></div>
                <div><dt>DT/ngày</dt><dd>{formatMoneyOrDash(selectedBranch.averageRevenuePerDay)}</dd></div>
                <div><dt>Lợi nhuận</dt><dd>{selectedBranch.profitAvailable ? formatMoneyOrDash(selectedBranch.profit) : '—'}</dd></div>
              </dl>

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
                            setSelectedEmployeeId(emp.id)
                            setSelectedBranchId(null)
                          }}
                        >
                          {emp.name}
                        </button>
                        <span>{formatRate(emp.requestedRate)}</span>
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
        <div className="mgmt-layout">
          <div className="mgmt-table-wrap">
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th><button type="button" onClick={() => toggleSort('name')}>Tên</button></th>
                  {!filters.branchId && isAdmin() && <th>Chi nhánh</th>}
                  <th><button type="button" onClick={() => toggleSort('revenue')}>Doanh thu</button></th>
                  <th>Tăng/giảm</th>
                  <th><button type="button" onClick={() => toggleSort('totalCustomerCount')}>Tổng khách</button></th>
                  <th><button type="button" onClick={() => toggleSort('requestedCustomerCount')}>Khách yêu cầu</button></th>
                  <th><button type="button" onClick={() => toggleSort('requestedRate')}>Tỷ lệ YC</button></th>
                  <th><button type="button" onClick={() => toggleSort('tips')}>Tips</button></th>
                  <th><button type="button" onClick={() => toggleSort('averageRevenuePerCustomer')}>DT/khách</button></th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedEmployeeId === row.id ? 'is-selected' : ''}
                    onClick={() => setSelectedEmployeeId(row.id)}
                  >
                    <td>{row.name}</td>
                    {!filters.branchId && isAdmin() && <td>{row.branchName}</td>}
                    <td className="is-num">{formatMoneyOrDash(row.revenue)}</td>
                    <td>
                      <TrendCell
                        trend={row.revenueTrend}
                        previousValue={row.previous?.revenue}
                        formatPrev={formatMoneyOrDash}
                      />
                    </td>
                    <td className="is-num">{row.totalCustomerCount}</td>
                    <td className="is-num">{row.requestedCustomerCount}</td>
                    <td className="is-num">{formatRate(row.requestedRate)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.tips)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.averageRevenuePerCustomer)}</td>
                  </tr>
                ))}
                {!data.loading && filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={filters.branchId || !isAdmin() ? 8 : 9} className="mgmt-empty">
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
                <div><dt>Doanh thu</dt><dd>{formatMoneyOrDash(selectedEmployee.revenue)}</dd></div>
                <div><dt>vs kỳ trước</dt><dd><TrendCell trend={selectedEmployee.revenueTrend} previousValue={selectedEmployee.previous?.revenue} formatPrev={formatMoneyOrDash} /></dd></div>
                <div><dt>Tổng khách</dt><dd>{selectedEmployee.totalCustomerCount}</dd></div>
                <div><dt>Khách yêu cầu</dt><dd>{selectedEmployee.requestedCustomerCount}</dd></div>
                <div><dt>Tỷ lệ YC</dt><dd>{formatRate(selectedEmployee.requestedRate)} <TrendCell trend={selectedEmployee.requestedRateTrend} previousValue={selectedEmployee.previous?.requestedRate} formatPrev={formatRate} /></dd></div>
                <div><dt>Tips</dt><dd>{formatMoneyOrDash(selectedEmployee.tips)} <TrendCell trend={selectedEmployee.tipsTrend} previousValue={selectedEmployee.previous?.tips} formatPrev={formatMoneyOrDash} /></dd></div>
                <div><dt>DT/khách</dt><dd>{formatMoneyOrDash(selectedEmployee.averageRevenuePerCustomer)}</dd></div>
                <div><dt>Ngày làm hợp lệ</dt><dd>{selectedEmployee.workDays}</dd></div>
                <div><dt>DT/ngày làm</dt><dd>{formatMoneyOrDash(selectedEmployee.averageRevenuePerWorkDay)}</dd></div>
                <div><dt>Hạng DT trong CN</dt><dd>{selectedEmployee.revenueRankInBranch}/{selectedEmployee.revenueRankTotal}</dd></div>
                <div><dt>Hạng tỷ lệ YC</dt><dd>{selectedEmployee.requestedRateRankInBranch}/{selectedEmployee.requestedRateRankTotal}</dd></div>
              </dl>

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

              <h4>Hóa đơn liên quan</h4>
              <ul className="mgmt-invoice-list">
                {employeeInvoices.slice(0, 40).map((inv) => (
                  <li key={inv.id}>
                    <div>
                      <strong>{inv.date} {inv.time}</strong>
                      <span>{inv.customerName}{inv.customerRequested ? ' · Yêu cầu' : ''}</span>
                    </div>
                    <div className="is-num">
                      <strong>{formatMoneyOrDash(inv.revenue)}</strong>
                      <span>Tips {formatMoneyOrDash(inv.tips)}</span>
                    </div>
                  </li>
                ))}
                {employeeInvoices.length === 0 && <li className="mgmt-muted">Không có hóa đơn trong kỳ.</li>}
              </ul>

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
