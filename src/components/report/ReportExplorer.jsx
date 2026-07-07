import { useMemo, useState } from 'react'
import {
  ChevronRight,
  Download,
  FileText,
  Gift,
  Percent,
  Receipt,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import InvoiceDetailModal from '../invoice/InvoiceDetailModal'
import KpiCard from '../ui/KpiCard'
import {
  canEditInvoice,
  canExportReport,
  canSelectBranch,
  getCurrentUserBranchName,
  isAdmin,
  isEmployee,
} from '../../constants/auth'
import { getBranchById, loadBranches } from '../../constants/branches'
import { getActiveEmployeesByBranch } from '../../utils/employeeStorage'
import { computeEmployeeInvoiceDetailReport } from '../../utils/employeeInvoiceReport'
import { formatCurrency } from '../../utils/invoice'
import { setInvoiceEditPrefill } from '../../utils/navigationPrefill'
import { buildDefaultDrillFilters } from '../../hooks/useDrillDownData'
import { useReportExplorerData } from '../../hooks/useReportExplorerData'
import {
  exportReportBranchCsv,
  exportReportEmployeeCsv,
  exportReportInvoiceCsv,
  exportReportOverviewCsv,
} from '../../utils/reportExport'
import './ReportExplorer.css'

const LEVEL = {
  OVERVIEW: 'overview',
  BRANCH: 'branch',
  EMPLOYEE: 'employee',
  INVOICES: 'invoices',
}

const REPORT_KPIS = [
  { id: 'ticketRevenue', label: 'Doanh thu tiền vé', icon: Receipt, variant: 'gold' },
  { id: 'tips', label: 'Tips', icon: Gift, variant: 'green' },
  { id: 'discount', label: 'Khuyến mãi', icon: Percent, variant: 'orange' },
  { id: 'commission', label: 'Hoa hồng', icon: TrendingUp, variant: 'purple' },
  { id: 'expenses', label: 'Chi phí', icon: Wallet, variant: 'orange' },
  { id: 'profit', label: 'Lợi nhuận dự kiến', icon: TrendingUp, variant: 'blue' },
  { id: 'customerCount', label: 'Tổng khách', icon: Users, variant: 'slate' },
  { id: 'invoiceCount', label: 'Tổng hóa đơn', icon: FileText, variant: 'slate' },
]

function formatMetric(id, value) {
  if (id === 'customerCount' || id === 'invoiceCount') return String(value ?? 0)
  return formatCurrency(value ?? 0)
}

function getMetricValue(row, metricId) {
  if (metricId === 'customerCount') return row.customerCount ?? 0
  if (metricId === 'invoiceCount') return row.invoiceCount ?? 0
  return row[metricId] ?? 0
}

function InsightCard({ title, name, value, sub, onClick }) {
  return (
    <button type="button" className="report-insight" onClick={onClick}>
      <span className="report-insight__title">{title}</span>
      <strong className="report-insight__name">{name}</strong>
      <span className="report-insight__value">{value}</span>
      {sub && <span className="report-insight__sub">{sub}</span>}
    </button>
  )
}

function EntityCard({ title, subtitle, metrics, onClick, activeMetric }) {
  return (
    <button type="button" className="report-entity-card" onClick={onClick}>
      <div className="report-entity-card__head">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="report-entity-card__metrics">
        {metrics.map((item) => (
          <div
            key={item.label}
            className={item.highlight ? 'report-entity-card__metric is-highlight' : 'report-entity-card__metric'}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {activeMetric && (
        <span className="report-entity-card__focus">
          Tập trung: {REPORT_KPIS.find((k) => k.id === activeMetric)?.label ?? activeMetric}
        </span>
      )}
    </button>
  )
}

function InvoiceTimelineRow({ item, onOpen }) {
  return (
    <button type="button" className="report-invoice-row" onClick={() => onOpen(item.invoice)}>
      <div className="report-invoice-row__time">{item.invoiceTime}</div>
      <div className="report-invoice-row__main">
        <strong>{item.customerName}</strong>
        <span>{item.serviceNames}</span>
      </div>
      <div className="report-invoice-row__grid">
        <div><span>Giá vé</span><strong>{formatCurrency(item.ticketPrice)}</strong></div>
        <div><span>KM</span><strong>{formatCurrency(item.discount)}</strong></div>
        <div><span>Doanh thu tiền vé</span><strong>{formatCurrency(item.payment)}</strong></div>
        <div><span>Tips</span><strong className="is-tips">{formatCurrency(item.tips)}</strong></div>
        <div><span>Hoa hồng</span><strong>{formatCurrency(item.commission)}</strong></div>
      </div>
    </button>
  )
}

export default function ReportExplorer({ onNavigate, initialPrefill = null }) {
  const skipBranchLevel = !isAdmin()

  const [level, setLevel] = useState(() => {
    if (initialPrefill?.level === 'invoices') return LEVEL.INVOICES
    if (initialPrefill?.level === 'employee') return LEVEL.EMPLOYEE
    if (initialPrefill?.level === 'branch' && isAdmin()) return LEVEL.BRANCH
    return LEVEL.OVERVIEW
  })

  const [draftFilters, setDraftFilters] = useState(() => buildDefaultDrillFilters(initialPrefill?.filters ?? {}))
  const [appliedFilters, setAppliedFilters] = useState(() => buildDefaultDrillFilters(initialPrefill?.filters ?? {}))
  const [activeMetric, setActiveMetric] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState(initialPrefill?.filters?.branchId ?? '')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialPrefill?.filters?.employeeId ?? '')
  const [selectedInvoice, setSelectedInvoice] = useState(null)

  const {
    invoices,
    summary,
    branchRows,
    employeeRows,
    trends,
    topBranch,
    topEmployee,
    loading,
    error,
  } = useReportExplorerData(appliedFilters)

  const branchEmployees = useMemo(
    () => (selectedBranchId ? getActiveEmployeesByBranch(selectedBranchId) : []),
    [selectedBranchId],
  )

  const scopedEmployeeRows = useMemo(() => {
    if (!selectedBranchId) return employeeRows
    return employeeRows.filter((row) => row.branchId === selectedBranchId)
  }, [employeeRows, selectedBranchId])

  const employeeInvoiceDetail = useMemo(() => {
    if (!selectedEmployeeId) return null
    return computeEmployeeInvoiceDetailReport(invoices, selectedEmployeeId, appliedFilters)
  }, [invoices, selectedEmployeeId, appliedFilters])

  const sortedBranchRows = useMemo(() => {
    if (!activeMetric) return branchRows
    return [...branchRows].sort((a, b) => getMetricValue(b, activeMetric) - getMetricValue(a, activeMetric))
  }, [branchRows, activeMetric])

  const sortedEmployeeRows = useMemo(() => {
    const rows = scopedEmployeeRows
    if (!activeMetric || activeMetric === 'expenses') return rows
    return [...rows].sort((a, b) => getMetricValue(b, activeMetric) - getMetricValue(a, activeMetric))
  }, [scopedEmployeeRows, activeMetric])

  const applySearch = () => {
    const next = { ...draftFilters }
    setAppliedFilters(next)
    if (next.employeeId) {
      setSelectedEmployeeId(next.employeeId)
      setSelectedBranchId(next.branchId || '')
      setLevel(LEVEL.INVOICES)
      return
    }
    if (next.branchId) {
      setSelectedBranchId(next.branchId)
      setLevel(skipBranchLevel ? LEVEL.EMPLOYEE : LEVEL.BRANCH)
      return
    }
    setLevel(LEVEL.OVERVIEW)
    setSelectedBranchId('')
    setSelectedEmployeeId('')
    setActiveMetric('')
  }

  const goOverview = () => {
    setLevel(LEVEL.OVERVIEW)
    setActiveMetric('')
    setSelectedBranchId('')
    setSelectedEmployeeId('')
    setSelectedInvoice(null)
  }

  const drillFromKpi = (metricId) => {
    setActiveMetric(metricId)
    if (skipBranchLevel) {
      setLevel(LEVEL.EMPLOYEE)
      return
    }
    setLevel(LEVEL.BRANCH)
  }

  const openBranch = (branchId) => {
    setSelectedBranchId(branchId)
    setLevel(LEVEL.EMPLOYEE)
  }

  const openEmployee = (employeeId) => {
    setSelectedEmployeeId(employeeId)
    setLevel(LEVEL.INVOICES)
  }

  const handleExport = () => {
    if (!canExportReport()) {
      window.alert('Bạn không có quyền xuất Excel.')
      return
    }
    if (level === LEVEL.OVERVIEW) {
      exportReportOverviewCsv(summary, appliedFilters)
      return
    }
    if (level === LEVEL.BRANCH) {
      exportReportBranchCsv(sortedBranchRows, appliedFilters)
      return
    }
    if (level === LEVEL.EMPLOYEE) {
      exportReportEmployeeCsv(sortedEmployeeRows, appliedFilters)
      return
    }
    if (employeeInvoiceDetail) {
      exportReportInvoiceCsv(
        employeeInvoiceDetail.days,
        employeeInvoiceDetail.employeeName,
        appliedFilters,
      )
    }
  }

  const handleEditInvoice = (invoice) => {
    setSelectedInvoice(null)
    setInvoiceEditPrefill(invoice.id)
    onNavigate?.('invoices')
  }

  const breadcrumbs = useMemo(() => {
    const items = [{ id: 'overview', label: 'Tổng quan', action: goOverview }]
    if (level === LEVEL.BRANCH || level === LEVEL.EMPLOYEE || level === LEVEL.INVOICES) {
      if (isAdmin()) {
        items.push({
          id: 'branch-level',
          label: 'Chi nhánh',
          action: () => { setLevel(LEVEL.BRANCH); setSelectedEmployeeId('') },
        })
      }
    }
    if ((level === LEVEL.EMPLOYEE || level === LEVEL.INVOICES) && selectedBranchId) {
      items.push({
        id: 'branch',
        label: getBranchById(selectedBranchId)?.name ?? 'Chi nhánh',
        action: () => { setLevel(LEVEL.EMPLOYEE); setSelectedEmployeeId('') },
      })
    }
    if (level === LEVEL.INVOICES && selectedEmployeeId && employeeInvoiceDetail) {
      items.push({ id: 'employee', label: employeeInvoiceDetail.employeeName, action: () => setLevel(LEVEL.INVOICES) })
    }
    return items
  }, [level, selectedBranchId, selectedEmployeeId, employeeInvoiceDetail])

  const periodLabel = `${appliedFilters.fromDate} → ${appliedFilters.toDate}`

  return (
    <div className="report-explorer">
      <header className="report-explorer__hero">
        <div>
          <h1 className="report-explorer__title">Báo cáo</h1>
          <p className="report-explorer__period">{periodLabel}</p>
        </div>
      </header>

      <section className="report-toolbar">
        <label className="report-toolbar__field">
          <span>Từ ngày</span>
          <input
            type="date"
            value={draftFilters.fromDate}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
          />
        </label>
        <label className="report-toolbar__field">
          <span>Đến ngày</span>
          <input
            type="date"
            value={draftFilters.toDate}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, toDate: e.target.value }))}
          />
        </label>
        {canSelectBranch() && (
          <label className="report-toolbar__field">
            <span>Chi nhánh</span>
            <select
              value={draftFilters.branchId}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, branchId: e.target.value, employeeId: '' }))}
            >
              <option value="">Tất cả</option>
              {loadBranches().map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}
        {!isEmployee() && (
          <label className="report-toolbar__field">
            <span>Nhân viên</span>
            <select
              value={draftFilters.employeeId}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, employeeId: e.target.value }))}
            >
              <option value="">Tất cả</option>
              {(draftFilters.branchId ? branchEmployees : employeeRows.map((r) => ({ id: r.employeeId, name: r.employeeName }))).map((emp) => (
                <option key={emp.id ?? emp.employeeId} value={emp.id ?? emp.employeeId}>
                  {emp.name ?? emp.employeeName}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="report-toolbar__search ks-btn-primary" onClick={applySearch}>
          <Search size={16} />
          Tìm
        </button>
        <button type="button" className="report-toolbar__export" onClick={handleExport}>
          <Download size={16} />
          Xuất Excel
        </button>
      </section>

      <nav className="report-crumb" aria-label="Phân cấp báo cáo">
        {breadcrumbs.map((item, index) => (
          <span key={item.id} className="report-crumb__item">
            {index > 0 && <ChevronRight size={14} aria-hidden />}
            {index === breadcrumbs.length - 1 ? (
              <span className="report-crumb__current">{item.label}</span>
            ) : (
              <button type="button" onClick={item.action}>{item.label}</button>
            )}
          </span>
        ))}
      </nav>

      {error && <div className="report-explorer__error">{error}</div>}
      {loading && <p className="report-explorer__loading">Đang tải dữ liệu...</p>}

      {!loading && !error && level === LEVEL.OVERVIEW && (
        <section className="report-tier report-tier--overview">
          <div className="report-kpi-grid">
            {REPORT_KPIS.map((kpi, index) => (
              <KpiCard
                key={kpi.id}
                label={kpi.label}
                value={formatMetric(kpi.id, summary[kpi.id])}
                icon={kpi.icon}
                variant={kpi.variant}
                trend={trends[kpi.id]}
                size="lg"
                active={activeMetric === kpi.id}
                onClick={() => drillFromKpi(kpi.id)}
                delay={index * 40}
              />
            ))}
          </div>

          <div className="report-insights">
            <InsightCard
              title="Chi nhánh mạnh nhất"
              name={topBranch?.branchName ?? '—'}
              value={formatCurrency(topBranch?.ticketRevenue ?? 0)}
              sub={`${topBranch?.invoiceCount ?? 0} hóa đơn · ${topBranch?.customerCount ?? 0} khách`}
              onClick={() => topBranch && openBranch(topBranch.branchId)}
            />
            <InsightCard
              title="Nhân viên mạnh nhất"
              name={topEmployee?.employeeName ?? '—'}
              value={formatCurrency(topEmployee?.ticketRevenue ?? 0)}
              sub={`${topEmployee?.branchName ?? '—'} · ${topEmployee?.invoiceCount ?? 0} hóa đơn`}
              onClick={() => topEmployee && openEmployee(topEmployee.employeeId)}
            />
          </div>
        </section>
      )}

      {!loading && !error && level === LEVEL.BRANCH && (
        <section className="report-tier">
          <h2 className="report-tier__title">Theo chi nhánh</h2>
          <p className="report-tier__desc">Chọn chi nhánh để xem nhân viên và hóa đơn chi tiết.</p>
          <div className="report-entity-grid">
            {sortedBranchRows.map((row) => (
              <EntityCard
                key={row.branchId}
                title={row.branchName}
                metrics={[
                  { label: 'Doanh thu tiền vé', value: formatCurrency(row.ticketRevenue), highlight: activeMetric === 'ticketRevenue' },
                  { label: 'Tips', value: formatCurrency(row.tips), highlight: activeMetric === 'tips' },
                  { label: 'Khách', value: String(row.customerCount), highlight: activeMetric === 'customerCount' },
                  { label: 'Hóa đơn', value: String(row.invoiceCount), highlight: activeMetric === 'invoiceCount' },
                  { label: 'Lợi nhuận', value: formatCurrency(row.profit), highlight: activeMetric === 'profit' },
                ]}
                activeMetric={activeMetric}
                onClick={() => openBranch(row.branchId)}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && !error && level === LEVEL.EMPLOYEE && (
        <section className="report-tier">
          <h2 className="report-tier__title">
            {selectedBranchId
              ? `Nhân viên — ${getBranchById(selectedBranchId)?.name ?? ''}`
              : isAdmin() ? 'Theo nhân viên' : `Nhân viên — ${getCurrentUserBranchName()}`}
          </h2>
          <div className="report-entity-grid">
            {sortedEmployeeRows.length === 0 ? (
              <p className="report-tier__empty">Không có dữ liệu nhân viên trong kỳ đã chọn.</p>
            ) : (
              sortedEmployeeRows.map((row) => (
                <EntityCard
                  key={row.employeeId}
                  title={row.employeeName}
                  subtitle={row.branchName}
                  metrics={[
                    { label: 'Doanh thu tiền vé', value: formatCurrency(row.ticketRevenue), highlight: activeMetric === 'ticketRevenue' },
                    { label: 'Tips', value: formatCurrency(row.tips), highlight: activeMetric === 'tips' },
                    { label: 'Khách', value: String(row.customerCount), highlight: activeMetric === 'customerCount' },
                    { label: 'Hóa đơn', value: String(row.invoiceCount), highlight: activeMetric === 'invoiceCount' },
                    { label: 'Hoa hồng', value: formatCurrency(row.commission), highlight: activeMetric === 'commission' },
                  ]}
                  activeMetric={activeMetric}
                  onClick={() => openEmployee(row.employeeId)}
                />
              ))
            )}
          </div>
        </section>
      )}

      {!loading && !error && level === LEVEL.INVOICES && employeeInvoiceDetail && (
        <section className="report-tier">
          <h2 className="report-tier__title">{employeeInvoiceDetail.employeeName}</h2>
          <p className="report-tier__desc">{employeeInvoiceDetail.branchName} · Timeline hóa đơn</p>
          {employeeInvoiceDetail.days.length === 0 ? (
            <p className="report-tier__empty">Chưa có hóa đơn trong kỳ này.</p>
          ) : (
            employeeInvoiceDetail.days.map((day) => (
              <article key={day.date} className="report-timeline-day">
                <h3>{day.displayDate}</h3>
                <div className="report-timeline-day__list">
                  {day.invoices.map((item) => (
                    <InvoiceTimelineRow
                      key={item.invoiceId}
                      item={item}
                      onOpen={setSelectedInvoice}
                    />
                  ))}
                </div>
                <div className="report-timeline-day__total">
                  <span>{day.invoiceCount} hóa đơn</span>
                  <span>DT {formatCurrency(day.serviceRevenue)}</span>
                  <span>Tips {formatCurrency(day.tips)}</span>
                  <span>HH {formatCurrency(day.serviceCommission)}</span>
                </div>
              </article>
            ))
          )}
        </section>
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
