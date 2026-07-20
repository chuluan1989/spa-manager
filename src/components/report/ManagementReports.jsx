import { useMemo, useState } from 'react'
import {
  canExportReport,
  canSelectBranch,
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
  buildRevenueInsights,
  buildTopMovers,
  resolveKpiTone,
} from '../../utils/managementReports/managementInsights'
import {
  BENCHMARK_METRICS,
  DEFAULT_BENCHMARK_SORT,
  buildBenchmarkTopBottom,
  sortBenchmarkRows,
} from '../../utils/managementReports/benchmarkSort'
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

function formatMoneyOrDash(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return formatCurrency(value)
}

function formatRate(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value}%`
}

function formatNum(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—'
  return Number(value).toLocaleString('vi-VN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

function formatBenchmarkValue(row, metric) {
  const value = row[metric.key]
  if (metric.format === 'money') return formatMoneyOrDash(value)
  if (metric.format === 'rate') return formatRate(value)
  if (metric.format === 'score') return value == null ? '—' : formatNum(value, 1)
  return formatNum(value, metric.key.includes('Per') ? 2 : 1)
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

function EvolutionPanel({ evolution }) {
  if (!evolution?.months?.length) return null
  return (
    <div className="mgmt-evolution">
      <header className="mgmt-evolution__head">
        <h4>Self Evolution · 3 tháng</h4>
        <span className={`mgmt-pill is-${evolution.conclusion?.tone || 'neutral'}`}>
          {evolution.conclusion?.label || '—'}
        </span>
      </header>
      <div className="mgmt-evolution__table-wrap">
        <table className="mgmt-evolution__table">
          <thead>
            <tr>
              <th>Chỉ số</th>
              {evolution.months.map((m) => (
                <th key={m.monthKey}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evolution.series.map((series) => (
              <tr key={series.key}>
                <td>{series.label}</td>
                {series.points.map((point) => (
                  <td key={`${series.key}-${point.monthKey}`}>
                    <span className="mgmt-evolution__val">
                      {series.key.includes('Rate')
                        ? formatRate(point.value)
                        : series.key.toLowerCase().includes('revenue') || series.key === 'tips' || series.key.includes('Revenue')
                          ? formatMoneyOrDash(point.value)
                          : formatNum(point.value, 2)}
                    </span>
                    {point.arrow !== '—' && (
                      <span className={`mgmt-evolution__arrow is-${point.trend?.direction || 'flat'}`}>
                        {point.arrow}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CeoPanel({ row, entityLabel }) {
  if (!row) {
    return (
      <section className="mgmt-ceo" aria-label="CEO Dashboard">
        <h3>CEO Dashboard</h3>
        <p className="mgmt-muted">Chọn một {entityLabel} trên bảng để xem hạng, điểm và xu hướng 3 tháng.</p>
      </section>
    )
  }

  return (
    <section className="mgmt-ceo" aria-label="CEO Dashboard">
      <header className="mgmt-ceo__head">
        <div>
          <h3>CEO Dashboard</h3>
          <p className="mgmt-ceo__name">{row.name}{row.branchName ? ` · ${row.branchName}` : ''}</p>
        </div>
        <div className={`mgmt-score is-${row.performanceGradeId || 'none'}`}>
          <strong>{row.performanceScore != null ? formatNum(row.performanceScore, 1) : '—'}</strong>
          <span>{row.performanceGrade || '—'}</span>
        </div>
      </header>
      <dl className="mgmt-ceo__grid">
        <div>
          <dt>Hạng trong CN</dt>
          <dd>
            {row.performanceRankInBranch != null
              ? `${row.performanceRankInBranch}/${row.performanceRankInBranchTotal}`
              : row.revenuePerWorkDayRankInBranch != null
                ? `${row.revenuePerWorkDayRankInBranch}/${row.revenuePerWorkDayRankInBranchTotal}`
                : '—'}
          </dd>
        </div>
        <div>
          <dt>Hạng hệ thống</dt>
          <dd>
            {row.performanceRankSystem != null
              ? `${row.performanceRankSystem}/${row.performanceRankSystemTotal}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Xu hướng 3 tháng</dt>
          <dd className={`is-${row.performanceTrendTone || 'neutral'}`}>{row.performanceTrendLabel || '—'}</dd>
        </div>
        <div>
          <dt>Hiệu suất/ngày</dt>
          <dd>{formatMoneyOrDash(row.revenuePerWorkDay)}</dd>
        </div>
        <div>
          <dt>Chỉ số nổi bật</dt>
          <dd>{row.strongestMetric?.label || '—'}{row.strongestMetric ? ` (${formatNum(row.strongestMetric.value, 0)})` : ''}</dd>
        </div>
        <div>
          <dt>Chỉ số yếu nhất</dt>
          <dd>{row.weakestMetric?.label || '—'}{row.weakestMetric ? ` (${formatNum(row.weakestMetric.value, 0)})` : ''}</dd>
        </div>
      </dl>
    </section>
  )
}

function BenchmarkPanel({ title, rows, sortKey, onSelect }) {
  const metric = sortKey || DEFAULT_BENCHMARK_SORT
  const board = buildBenchmarkTopBottom(rows, { metric, limit: 5 })
  const metricMeta = BENCHMARK_METRICS.find((m) => m.key === metric)
  const momRevenue = buildTopMovers(rows, { metric: 'revenue', limit: 5 })

  return (
    <section className="mgmt-top" aria-label={title}>
      <h3>{title}</h3>
      <p className="mgmt-muted">
        Benchmark theo <strong>{metricMeta?.label || metric}</strong> (ưu tiên hiệu suất/ngày). TOP / BOTTOM cùng kỳ.
      </p>
      <div className="mgmt-top__grid">
        <div>
          <h4>TOP · {metricMeta?.label || metric}</h4>
          <ul className="mgmt-top__list">
            {board.top.length === 0 && <li className="mgmt-muted">Không có</li>}
            {board.top.map((row) => (
              <li key={`top-${row.id}`}>
                <button type="button" onClick={() => onSelect?.(row.id)}>{row.name}</button>
                <span>{formatBenchmarkValue(row, metricMeta || { key: metric, format: 'number' })}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>BOTTOM · {metricMeta?.label || metric}</h4>
          <ul className="mgmt-top__list">
            {board.bottom.length === 0 && <li className="mgmt-muted">Không có</li>}
            {board.bottom.map((row) => (
              <li key={`bot-${row.id}`}>
                <button type="button" onClick={() => onSelect?.(row.id)}>{row.name}</button>
                <span>{formatBenchmarkValue(row, metricMeta || { key: metric, format: 'number' })}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>TOP tăng · Doanh thu (MoM)</h4>
          <ul className="mgmt-top__list">
            {momRevenue.gainers.length === 0 && <li className="mgmt-muted">Không có</li>}
            {momRevenue.gainers.map((row) => (
              <li key={`up-${row.id}`}>
                <button type="button" onClick={() => onSelect?.(row.id)}>{row.name}</button>
                <TrendCell trend={row.revenueTrend} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>TOP giảm · Doanh thu (MoM)</h4>
          <ul className="mgmt-top__list">
            {momRevenue.losers.length === 0 && <li className="mgmt-muted">Không có</li>}
            {momRevenue.losers.map((row) => (
              <li key={`down-${row.id}`}>
                <button type="button" onClick={() => onSelect?.(row.id)}>{row.name}</button>
                <TrendCell trend={row.revenueTrend} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

export default function ManagementReports({ onNavigate }) {
  const [view, setView] = useState('employee')
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
    return sortBenchmarkRows(rows, filters.sortKey, filters.sortDir)
  }, [data.employeeRows, filters.branchId, filters.employeeQuery, filters.sortKey, filters.sortDir])

  const filteredBranches = useMemo(
    () => sortBenchmarkRows(data.branchRows ?? [], filters.sortKey, filters.sortDir),
    [data.branchRows, filters.sortKey, filters.sortDir],
  )

  const selectedBranch = filteredBranches.find((row) => row.id === selectedBranchId) ?? null
  const selectedEmployee = filteredEmployees.find((row) => row.id === selectedEmployeeId) ?? null
  const ceoRow = view === 'branch' ? selectedBranch : selectedEmployee

  const branchInsights = useMemo(() => {
    if (!selectedBranch) return null
    return buildBranchEmployeeInsights(
      selectedBranch.id,
      data.employeeRows,
      data.currentInvoices ?? [],
      filters.fromDate,
      filters.toDate,
    )
  }, [selectedBranch, data.employeeRows, data.currentInvoices, filters.fromDate, filters.toDate])

  const employeeTrend = useMemo(() => {
    if (!selectedEmployee) return []
    return buildEmployeeDailyRevenue(
      data.currentInvoices ?? [],
      selectedEmployee.id,
      filters.fromDate,
      filters.toDate,
    )
  }, [selectedEmployee, data.currentInvoices, filters.fromDate, filters.toDate])

  const employeeInvoices = useMemo(() => {
    if (!selectedEmployee) return []
    return buildEmployeeInvoiceList(data.currentInvoices ?? [], selectedEmployee.id).slice(0, 20)
  }, [selectedEmployee, data.currentInvoices])

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const toggleSort = (key) => {
    setFilters((prev) => ({
      ...prev,
      sortKey: key,
      sortDir: prev.sortKey === key && prev.sortDir === 'desc' ? 'asc' : 'desc',
    }))
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

  const compareCaption = data.compare?.fromDate
    ? `So sánh kỳ hiện tại với ${data.compare.fromDate} → ${data.compare.toDate}`
      + (data.compare.mode === 'mtd-same-days' ? ' (cùng số ngày tháng trước)' : '')
      + (data.compare.mode === 'full-month' ? ' (cả tháng trước)' : '')
    : ''

  return (
    <div className="mgmt-reports">
      <div className="mgmt-reports__header">
        <div>
          <h2>Báo cáo quản trị V2</h2>
          <p className="mgmt-reports__compare">{compareCaption}</p>
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
      </div>

      <div className="mgmt-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'branch'}
          className={view === 'branch' ? 'is-active' : ''}
          onClick={() => setView('branch')}
        >
          Chi nhánh
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'employee'}
          className={view === 'employee' ? 'is-active' : ''}
          onClick={() => setView('employee')}
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
        <label className="mgmt-filters__sort">
          Sắp xếp benchmark
          <select
            value={filters.sortKey}
            onChange={(e) => updateFilter('sortKey', e.target.value)}
          >
            {BENCHMARK_METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      {data.error ? <p className="mgmt-error">{data.error}</p> : null}

      <CeoPanel
        row={ceoRow}
        entityLabel={view === 'branch' ? 'chi nhánh' : 'nhân viên'}
      />

      {view === 'branch' && (
        <BenchmarkPanel
          title="Benchmark — Chi nhánh"
          rows={filteredBranches}
          sortKey={filters.sortKey}
          onSelect={(id) => setSelectedBranchId(id)}
        />
      )}

      {view === 'employee' && (
        <BenchmarkPanel
          title="Benchmark — Nhân viên"
          rows={filteredEmployees}
          sortKey={filters.sortKey}
          onSelect={(id) => setSelectedEmployeeId(id)}
        />
      )}

      {view === 'branch' && (
        <div className="mgmt-layout">
          <div className="mgmt-table-wrap">
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th><button type="button" onClick={() => toggleSort('name')}>Tên</button></th>
                  <th><button type="button" onClick={() => toggleSort('performanceScore')}>Score</button></th>
                  <th><button type="button" onClick={() => toggleSort('workDays')}>Ngày công</button></th>
                  <th><button type="button" onClick={() => toggleSort('revenuePerWorkDay')}>DT/ngày</button></th>
                  <th><button type="button" onClick={() => toggleSort('revenue')}>Doanh thu</button></th>
                  <th><button type="button" onClick={() => toggleSort('totalCustomerCount')}>Khách</button></th>
                  <th><button type="button" onClick={() => toggleSort('customersPerWorkDay')}>Khách/ngày</button></th>
                  <th><button type="button" onClick={() => toggleSort('requestedRate')}>Tỷ lệ YC</button></th>
                  <th><button type="button" onClick={() => toggleSort('tipsPerWorkDay')}>Tips/ngày</button></th>
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
                    <td className="is-num">
                      {formatNum(row.performanceScore, 1)}
                      <div className="mgmt-sub">{row.performanceGrade}</div>
                    </td>
                    <td className="is-num">{formatNum(row.workDays, 1)}</td>
                    <td className="is-num">
                      {formatMoneyOrDash(row.revenuePerWorkDay)}
                      <div><TrendCell trend={row.revenuePerWorkDayTrend} /></div>
                    </td>
                    <td className="is-num">
                      {formatMoneyOrDash(row.revenue)}
                      <div><TrendCell trend={row.revenueTrend} /></div>
                    </td>
                    <td className="is-num">{row.totalCustomerCount}</td>
                    <td className="is-num">{formatNum(row.customersPerWorkDay, 2)}</td>
                    <td className="is-num">{formatRate(row.requestedRate)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.tipsPerWorkDay)}</td>
                  </tr>
                ))}
                {!data.loading && filteredBranches.length === 0 && (
                  <tr><td colSpan={9} className="mgmt-empty">Không có dữ liệu chi nhánh.</td></tr>
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
                <div>
                  <dt>Performance Score</dt>
                  <dd className={`mgmt-kpi is-${resolveKpiTone(selectedBranch.revenuePerWorkDayTrend)}`}>
                    {formatNum(selectedBranch.performanceScore, 1)} · {selectedBranch.performanceGrade}
                  </dd>
                </div>
                <div><dt>Ngày công</dt><dd>{formatNum(selectedBranch.workDays, 1)} <TrendCell trend={selectedBranch.workDaysTrend} /></dd></div>
                <div><dt>DT/ngày làm</dt><dd className={`mgmt-kpi is-${resolveKpiTone(selectedBranch.revenuePerWorkDayTrend)}`}>{formatMoneyOrDash(selectedBranch.revenuePerWorkDay)}</dd></div>
                <div><dt>Doanh thu</dt><dd>{formatMoneyOrDash(selectedBranch.revenue)}</dd></div>
                <div><dt>Khách / ngày</dt><dd>{formatNum(selectedBranch.customersPerWorkDay, 2)}</dd></div>
                <div><dt>YC / ngày</dt><dd>{formatNum(selectedBranch.requestedPerWorkDay, 2)}</dd></div>
                <div><dt>Tỷ lệ YC</dt><dd>{formatRate(selectedBranch.requestedRate)}</dd></div>
                <div><dt>Tips / ngày</dt><dd>{formatMoneyOrDash(selectedBranch.tipsPerWorkDay)}</dd></div>
                <div><dt>DT/khách</dt><dd>{formatMoneyOrDash(selectedBranch.averageRevenuePerCustomer)}</dd></div>
              </dl>
              <InsightBlock row={selectedBranch} />
              <EvolutionPanel evolution={selectedBranch.evolution} />
              {branchInsights && (
                <>
                  <h4>Nhân viên</h4>
                  <ul className="mgmt-mini-list">
                    {branchInsights.employees.slice(0, 8).map((emp) => (
                      <li key={emp.id}>
                        <button type="button" onClick={() => { setView('employee'); setSelectedEmployeeId(emp.id) }}>
                          {emp.name}
                        </button>
                        <span>{formatMoneyOrDash(emp.revenuePerWorkDay)}/ngày</span>
                      </li>
                    ))}
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
                  <th>CN</th>
                  <th><button type="button" onClick={() => toggleSort('performanceScore')}>Score</button></th>
                  <th><button type="button" onClick={() => toggleSort('workDays')}>Ngày công</button></th>
                  <th><button type="button" onClick={() => toggleSort('revenuePerWorkDay')}>DT/ngày</button></th>
                  <th><button type="button" onClick={() => toggleSort('revenue')}>Doanh thu</button></th>
                  <th><button type="button" onClick={() => toggleSort('customersPerWorkDay')}>Khách/ngày</button></th>
                  <th><button type="button" onClick={() => toggleSort('requestedRate')}>Tỷ lệ YC</button></th>
                  <th><button type="button" onClick={() => toggleSort('tipsPerWorkDay')}>Tips/ngày</button></th>
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
                    <td>{row.branchName}</td>
                    <td className="is-num">
                      {formatNum(row.performanceScore, 1)}
                      <div className="mgmt-sub">{row.performanceGrade}</div>
                    </td>
                    <td className="is-num">{formatNum(row.workDays, 1)}</td>
                    <td className="is-num">
                      {formatMoneyOrDash(row.revenuePerWorkDay)}
                      <div><TrendCell trend={row.revenuePerWorkDayTrend} /></div>
                    </td>
                    <td className="is-num">
                      {formatMoneyOrDash(row.revenue)}
                      <div><TrendCell trend={row.revenueTrend} /></div>
                    </td>
                    <td className="is-num">{formatNum(row.customersPerWorkDay, 2)}</td>
                    <td className="is-num">{formatRate(row.requestedRate)}</td>
                    <td className="is-num">{formatMoneyOrDash(row.tipsPerWorkDay)}</td>
                  </tr>
                ))}
                {!data.loading && filteredEmployees.length === 0 && (
                  <tr><td colSpan={9} className="mgmt-empty">Không có dữ liệu nhân viên.</td></tr>
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
                  <dt>Performance Score</dt>
                  <dd>{formatNum(selectedEmployee.performanceScore, 1)} · {selectedEmployee.performanceGrade}</dd>
                </div>
                <div>
                  <dt>Hạng CN / Hệ thống</dt>
                  <dd>
                    {selectedEmployee.performanceRankInBranch}/{selectedEmployee.performanceRankInBranchTotal}
                    {' · '}
                    {selectedEmployee.performanceRankSystem}/{selectedEmployee.performanceRankSystemTotal}
                  </dd>
                </div>
                <div><dt>Ngày công</dt><dd>{formatNum(selectedEmployee.workDays, 1)} <TrendCell trend={selectedEmployee.workDaysTrend} /></dd></div>
                <div><dt>DT/ngày làm</dt><dd className={`mgmt-kpi is-${resolveKpiTone(selectedEmployee.revenuePerWorkDayTrend)}`}>{formatMoneyOrDash(selectedEmployee.revenuePerWorkDay)}</dd></div>
                <div><dt>Doanh thu</dt><dd>{formatMoneyOrDash(selectedEmployee.revenue)}</dd></div>
                <div><dt>Khách / ngày</dt><dd>{formatNum(selectedEmployee.customersPerWorkDay, 2)}</dd></div>
                <div><dt>YC / ngày</dt><dd>{formatNum(selectedEmployee.requestedPerWorkDay, 2)}</dd></div>
                <div><dt>Tỷ lệ YC</dt><dd>{formatRate(selectedEmployee.requestedRate)}</dd></div>
                <div><dt>Tips / ngày</dt><dd>{formatMoneyOrDash(selectedEmployee.tipsPerWorkDay)}</dd></div>
                <div><dt>DT/khách</dt><dd>{formatMoneyOrDash(selectedEmployee.averageRevenuePerCustomer)}</dd></div>
              </dl>
              <InsightBlock row={selectedEmployee} />
              <EvolutionPanel evolution={selectedEmployee.evolution} />
              <h4>Xu hướng doanh thu theo ngày</h4>
              <div className="mgmt-bars" aria-label="Biểu đồ doanh thu ngày">
                {employeeTrend.map((point) => {
                  const max = Math.max(...employeeTrend.map((p) => p.revenue), 1)
                  const height = Math.max(2, Math.round((point.revenue / max) * 100))
                  return (
                    <div key={point.date} className="mgmt-bars__col" title={`${point.date}: ${formatMoneyOrDash(point.revenue)}`}>
                      <div className="mgmt-bars__fill" style={{ height: `${height}%` }} />
                    </div>
                  )
                })}
              </div>
              <h4>Hóa đơn gần đây</h4>
              <ul className="mgmt-invoice-list">
                {employeeInvoices.map((inv) => (
                  <li key={inv.id}>
                    <div>
                      <strong>{inv.customerName}</strong>
                      <span>{inv.date} {inv.time}{inv.customerRequested ? ' · YC' : ''}</span>
                    </div>
                    <span>{formatMoneyOrDash(inv.revenue)}</span>
                  </li>
                ))}
                {employeeInvoices.length === 0 && <li className="mgmt-muted">Không có hóa đơn.</li>}
              </ul>
              {typeof onNavigate === 'function' && (
                <button type="button" className="mgmt-btn" onClick={() => onNavigate('invoices')}>
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
