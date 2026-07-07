import { useMemo, useState } from 'react'
import {
  ChevronRight,
  FileText,
  Gift,
  HandCoins,
  Percent,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import InvoiceDetailModal from '../invoice/InvoiceDetailModal'
import MiniBarChart from '../dashboard/MiniBarChart'
import DataTable from '../ui/DataTable'
import KpiCard from '../ui/KpiCard'
import {
  canEditInvoice,
  canSelectBranch,
  getCurrentUserBranchName,
  getCurrentUserEmployeeId,
  getCurrentUserName,
  getCurrentUserRole,
  isAdmin,
  isEmployee,
} from '../../constants/auth'
import { getBranchById, loadBranches } from '../../constants/branches'
import { buildDefaultDrillFilters, useDrillDownData } from '../../hooks/useDrillDownData'
import { getActiveEmployeesByBranch, getEmployeeById } from '../../utils/employeeStorage'
import { computeEmployeeInvoiceDetailReport } from '../../utils/employeeInvoiceReport'
import {
  buildBranchDrillRows,
  buildDrillDownSummary,
  buildEmployeeDrillRows,
  DRILL_METRICS,
  EMPLOYEE_DRILL_METRICS,
  getDrillLevelConfig,
} from '../../utils/drillDownReport'
import { formatCurrency } from '../../utils/invoice'
import { getTodayDate, getMonthStartDate } from '../../utils/invoiceStorage'
import { loadServices } from '../../utils/serviceStorage'
import { setInvoiceEditPrefill } from '../../utils/navigationPrefill'
import './DrillDownExplorer.css'

function formatMetricValue(id, value) {
  if (id === 'invoiceCount' || id === 'customerCount') return String(value ?? 0)
  return formatCurrency(value ?? 0)
}

const METRIC_ICONS = {
  ticketRevenue: Receipt,
  tips: Gift,
  customerTotal: HandCoins,
  discount: Percent,
  commission: TrendingUp,
  expenses: Wallet,
  profit: TrendingUp,
  invoiceCount: FileText,
  customerCount: Users,
  payment: Receipt,
  salary: Wallet,
}

const METRIC_VARIANTS = {
  ticketRevenue: 'gold',
  tips: 'green',
  customerTotal: 'slate',
  discount: 'orange',
  commission: 'purple',
  expenses: 'orange',
  profit: 'blue',
  invoiceCount: 'slate',
  customerCount: 'slate',
  payment: 'gold',
  salary: 'purple',
}


export default function DrillDownExplorer({
  title = 'Dashboard',
  subtitle = '',
  rootLabel = 'Dashboard',
  initialPrefill = null,
  onNavigate,
}) {
  const role = getCurrentUserRole()
  const levelConfig = getDrillLevelConfig(role)

  const [level, setLevel] = useState(() => initialPrefill?.level ?? levelConfig.rootLevel)
  const [filters, setFilters] = useState(() => buildDefaultDrillFilters(initialPrefill?.filters ?? {}))
  const [activeMetric, setActiveMetric] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState(null)

  const { invoices, expenses, loading, error, scopedFilters } = useDrillDownData(filters)

  const summary = useMemo(
    () => buildDrillDownSummary(invoices, expenses, scopedFilters),
    [invoices, expenses, scopedFilters],
  )

  const branchRows = useMemo(
    () => buildBranchDrillRows(invoices, expenses, scopedFilters),
    [invoices, expenses, scopedFilters],
  )

  const employeeRows = useMemo(
    () => buildEmployeeDrillRows(invoices, scopedFilters),
    [invoices, scopedFilters],
  )

  const invoiceDetail = useMemo(() => {
    if (!scopedFilters.employeeId) return null
    return computeEmployeeInvoiceDetailReport(invoices, scopedFilters.employeeId, scopedFilters)
  }, [invoices, scopedFilters])

  const branchEmployees = useMemo(
    () => (scopedFilters.branchId ? getActiveEmployeesByBranch(scopedFilters.branchId) : []),
    [scopedFilters.branchId],
  )

  const serviceOptions = useMemo(() => {
    if (scopedFilters.branchId) {
      return loadServices().filter((service) => service.isActive !== false)
    }
    return loadServices().filter((service) => service.isActive !== false)
  }, [scopedFilters.branchId])

  const breadcrumbs = useMemo(() => {
    const items = [{ id: 'root', label: rootLabel, level: levelConfig.rootLevel }]
    if (level === 'branch' || level === 'employee' || level === 'invoices' || level === 'invoice') {
      if (isAdmin() && scopedFilters.branchId) {
        items.push({
          id: 'branch',
          label: getBranchById(scopedFilters.branchId)?.name ?? scopedFilters.branchId,
          level: 'employee',
        })
      } else if (!isAdmin() && levelConfig.rootLevel === 'branch') {
        items.push({ id: 'branch', label: getCurrentUserBranchName(), level: 'employee' })
      }
    }
    if ((level === 'employee' || level === 'invoices' || level === 'invoice') && scopedFilters.employeeId) {
      const emp = getEmployeeById(scopedFilters.employeeId)
      items.push({
        id: 'employee',
        label: emp?.name ?? 'Nhân viên',
        level: 'invoices',
      })
    }
    if (selectedInvoice) {
      items.push({
        id: 'invoice',
        label: `Hóa đơn ${selectedInvoice.customerName || selectedInvoice.id?.slice(0, 8) || ''}`,
        level: 'invoices',
      })
    }
    return items
  }, [rootLabel, level, levelConfig, scopedFilters, selectedInvoice])

  const updateFilter = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const handleBranchChange = (branchId) => {
    setFilters((prev) => ({ ...prev, branchId, employeeId: isEmployee() ? prev.employeeId : '' }))
  }

  const drillFromMetric = (metricId) => {
    setActiveMetric(metricId)
    if (level === 'system') setLevel('branch')
    else if (level === 'branch') setLevel('employee')
    else if (level === 'employee') setLevel('invoices')
  }

  const goToLevel = (targetLevel, patch = {}) => {
    setFilters((prev) => ({ ...prev, ...patch }))
    setLevel(targetLevel)
    if (targetLevel !== 'invoice') setSelectedInvoice(null)
  }

  const handleBreadcrumb = (item) => {
    if (item.id === 'root') {
      goToLevel(levelConfig.rootLevel, isEmployee() ? { employeeId: getCurrentUserEmployeeId() } : {})
      return
    }
    if (item.id === 'branch') {
      goToLevel('employee')
      return
    }
    if (item.id === 'employee') {
      setSelectedInvoice(null)
      goToLevel('invoices')
      return
    }
    if (item.id === 'invoice') {
      return
    }
  }

  const branchTableColumns = useMemo(() => [
    { key: 'branchName', label: 'Chi nhánh', sortable: true },
    ...DRILL_METRICS.map((m) => ({
      key: m.id,
      label: m.label,
      align: 'right',
      render: (v, row) => formatMetricValue(m.id, m.id === 'expenses' ? row.expenses : v),
    })),
  ], [])

  const employeeTableColumns = useMemo(() => [
    { key: 'employeeName', label: 'Nhân viên', sortable: true },
    ...EMPLOYEE_DRILL_METRICS.map((m) => ({
      key: m.id,
      label: m.label,
      align: 'right',
      render: (v) => formatMetricValue(m.id, v),
    })),
  ], [])

  const chartItems = useMemo(
    () => branchRows.slice(0, 8).map((row) => ({
      id: row.branchId,
      label: (row.branchName ?? '').replace('Khoẻ Spa ', ''),
      value: row.ticketRevenue,
    })),
    [branchRows],
  )

  const handleEditInvoice = (invoice) => {
    setInvoiceEditPrefill(invoice.id)
    onNavigate?.('invoices')
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

  const currentMetrics = isEmployee() ? EMPLOYEE_DRILL_METRICS : (level === 'employee' ? EMPLOYEE_DRILL_METRICS : DRILL_METRICS)

  const currentSummary = level === 'employee' && scopedFilters.employeeId && !isEmployee()
    ? employeeRows.find((row) => row.employeeId === scopedFilters.employeeId) ?? summary
    : summary

  return (
    <div className="drill-explorer">
      <header className="drill-explorer__header">
        <div>
          <h2 className="drill-explorer__title">{title}</h2>
          <p className="drill-explorer__subtitle">
            {subtitle || 'Mọi chỉ số đều click được — truy ngược đến từng hóa đơn'}
          </p>
        </div>
        <div className="drill-explorer__quick">
          <button type="button" onClick={setToday}>Hôm nay</button>
          <button type="button" onClick={setThisMonth}>Tháng này</button>
        </div>
      </header>

      <nav className="drill-breadcrumb" aria-label="Drill-down">
        {breadcrumbs.map((item, index) => (
          <span key={item.id} className="drill-breadcrumb__item">
            {index > 0 && <ChevronRight size={14} aria-hidden className="drill-breadcrumb__sep" />}
            <button type="button" onClick={() => handleBreadcrumb(item)}>{item.label}</button>
          </span>
        ))}
      </nav>

      <section className="drill-filters">
        <label>
          <span>Từ ngày</span>
          <input type="date" value={filters.fromDate} onChange={(e) => updateFilter('fromDate', e.target.value)} />
        </label>
        <label>
          <span>Đến ngày</span>
          <input type="date" value={filters.toDate} onChange={(e) => updateFilter('toDate', e.target.value)} />
        </label>
        {canSelectBranch() && (
          <label>
            <span>Chi nhánh</span>
            <select value={filters.branchId} onChange={(e) => handleBranchChange(e.target.value)}>
              <option value="">Tất cả chi nhánh</option>
              {loadBranches().map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        )}
        {!isEmployee() && (
          <label>
            <span>Nhân viên</span>
            <select
              value={filters.employeeId}
              onChange={(e) => updateFilter('employeeId', e.target.value)}
            >
              <option value="">Tất cả nhân viên</option>
              {(filters.branchId ? branchEmployees : employeeRows.map((r) => ({ id: r.employeeId, name: r.employeeName }))).map((e) => (
                <option key={e.id ?? e.employeeId} value={e.id ?? e.employeeId}>
                  {e.name ?? e.employeeName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Dịch vụ</span>
          <select value={filters.serviceId} onChange={(e) => updateFilter('serviceId', e.target.value)}>
            <option value="">Tất cả dịch vụ</option>
            {serviceOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Khách</span>
          <input
            type="search"
            placeholder="Tên hoặc SĐT..."
            value={filters.customerSearch}
            onChange={(e) => updateFilter('customerSearch', e.target.value)}
          />
        </label>
        <label>
          <span>Khuyến mãi</span>
          <select value={filters.discountFilter} onChange={(e) => updateFilter('discountFilter', e.target.value)}>
            <option value="">Tất cả</option>
            <option value="with">Có KM</option>
            <option value="without">Không KM</option>
          </select>
        </label>
      </section>

      {error && <div className="drill-error">{error}</div>}
      {loading && <p className="drill-loading">Đang tải dữ liệu từ Supabase...</p>}

      {!loading && !error && (
        <>
          {(level === 'system' || level === 'branch' || (level === 'employee' && isEmployee())) && (
            <section className="drill-metrics">
              {currentMetrics.map((metric, index) => (
                <KpiCard
                  key={metric.id}
                  label={metric.label}
                  value={formatMetricValue(metric.id, currentSummary?.[metric.id] ?? 0)}
                  icon={METRIC_ICONS[metric.id]}
                  variant={METRIC_VARIANTS[metric.id] ?? 'gold'}
                  active={activeMetric === metric.id}
                  onClick={() => drillFromMetric(metric.id)}
                  delay={index * 50}
                />
              ))}
            </section>
          )}

          {level === 'system' && isAdmin() && chartItems.length > 0 && (
            <section className="drill-chart-section">
              <h3 className="drill-panel__title">Doanh thu tiền vé theo chi nhánh</h3>
              <MiniBarChart items={chartItems} formatValue={formatCurrency} />
            </section>
          )}

          {level === 'system' && isAdmin() && (
            <section className="drill-panel drill-panel--flat">
              <h3 className="drill-panel__title">Tổng quan hệ thống</h3>
              <p className="drill-panel__desc">Bấm vào chỉ số KPI hoặc nút bên dưới để drill-down theo chi nhánh</p>
              <button type="button" className="drill-panel__cta ks-btn-ghost" onClick={() => setLevel('branch')}>
                Xem theo chi nhánh →
              </button>
            </section>
          )}

          {level === 'branch' && (
            <section className="drill-panel drill-panel--flat">
              <h3 className="drill-panel__title">{isAdmin() ? 'Doanh thu theo chi nhánh' : `Chi nhánh ${getCurrentUserBranchName()}`}</h3>
              {isAdmin() ? (
                <DataTable
                  columns={branchTableColumns}
                  rows={branchRows}
                  getRowKey={(row) => row.branchId}
                  onRowClick={(row) => goToLevel('employee', { branchId: row.branchId })}
                  emptyText="Không có dữ liệu trong khoảng thời gian đã chọn."
                />
              ) : (
                <button type="button" className="drill-panel__cta ks-btn-ghost" onClick={() => setLevel('employee')}>
                  Xem theo nhân viên →
                </button>
              )}
            </section>
          )}

          {level === 'employee' && (
            <section className="drill-panel drill-panel--flat">
              <h3 className="drill-panel__title">
                {scopedFilters.branchId
                  ? `Nhân viên — ${getBranchById(scopedFilters.branchId)?.name ?? ''}`
                  : isEmployee()
                    ? getCurrentUserName()
                    : 'Doanh thu theo nhân viên'}
              </h3>
              {!isEmployee() && (
                <DataTable
                  columns={employeeTableColumns}
                  rows={employeeRows}
                  getRowKey={(row) => row.employeeId}
                  onRowClick={(row) => goToLevel('invoices', { employeeId: row.employeeId, branchId: row.branchId || scopedFilters.branchId })}
                  emptyText="Không có dữ liệu nhân viên."
                />
              )}
              {isEmployee() && (
                <button type="button" className="drill-panel__cta ks-btn-ghost" onClick={() => setLevel('invoices')}>
                  Xem hóa đơn của tôi →
                </button>
              )}
            </section>
          )}

          {level === 'invoices' && scopedFilters.employeeId && invoiceDetail && (
            <section className="drill-panel">
              <h3>Timeline hóa đơn — {invoiceDetail.employeeName}</h3>
              {invoiceDetail.days.length === 0 ? (
                <p className="drill-empty">Chưa có hóa đơn trong kỳ</p>
              ) : (
                invoiceDetail.days.map((day) => (
                  <article key={day.date} className="drill-timeline-day">
                    <h4>{day.displayDate}</h4>
                    {day.invoices.map((item) => (
                      <button
                        key={item.invoiceId}
                        type="button"
                        className="drill-invoice-card"
                        onClick={() => setSelectedInvoice(item.invoice)}
                      >
                        <div className="drill-invoice-card__time">{item.invoiceTime}</div>
                        <div className="drill-invoice-card__name">{item.customerName}</div>
                        <div className="drill-invoice-card__service">{item.serviceNames}</div>
                        <div className="drill-invoice-card__grid">
                          <div><span>Giá vé</span><strong>{formatCurrency(item.ticketPrice)}</strong></div>
                          <div><span>KM</span><strong>{formatCurrency(item.discount)}</strong></div>
                          <div><span>Doanh thu tiền vé</span><strong>{formatCurrency(item.payment)}</strong></div>
                          <div><span>Tips</span><strong className="is-tips">{formatCurrency(item.tips)}</strong></div>
                          <div><span>Hoa hồng</span><strong>{formatCurrency(item.commission)}</strong></div>
                        </div>
                      </button>
                    ))}
                  </article>
                ))
              )}
            </section>
          )}
        </>
      )}

      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onEdit={handleEditInvoice}
          canEdit={canEditInvoice}
        />
      )}
    </div>
  )
}
