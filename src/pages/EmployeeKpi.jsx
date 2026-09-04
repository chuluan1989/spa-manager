import { useEffect, useMemo, useState } from 'react'
import ErpPageHeader from '../components/erp/ErpPageHeader'
import { canAccessEmployeeKpiPage, getCurrentUserBranch, getCurrentUserEmployeeId, isEmployee } from '../constants/auth'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import { fetchKpiBranchPolicies } from '../repositories/kpiPolicyRepository'
import { getEmployeeById } from '../utils/employeeStorage'
import { computeEmployeeKpi } from '../utils/employeeKpiEngine'
import {
  buildKpiCardModel,
  buildKpiServiceLineRows,
  currentMonthYm,
  filterKpiServiceLineRows,
  formatMonthLabel,
  monthBounds,
  summarizeOverallKpis,
  EMPLOYEE_KPI_CARD_DEFS,
} from '../utils/employeeKpiView'
import {
  fetchKpiInvoicesForScope,
  resolveKpiPayCycleRange,
} from '../utils/kpiInvoiceScope'
import { KPI_STATUS } from '../constants/kpiPolicy'
import { formatCurrency } from '../utils/invoice'
import { getDefaultPayCycleForVietnamDate, PAY_CYCLES } from '../utils/salaryReport'
import './EmployeeKpi.css'
import '../components/erp/erp.css'

function formatDateVi(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function KpiCard({ card, onOpen }) {
  const statusClass =
    card.status === KPI_STATUS.MET
      ? 'emp-kpi-card--met'
      : card.status === KPI_STATUS.NOT_MET
        ? 'emp-kpi-card--miss'
        : 'emp-kpi-card--insuff'

  return (
    <button type="button" className={`emp-kpi-card ${statusClass}`} onClick={() => onOpen(card.key)}>
      <div className="emp-kpi-card__top">
        <h3>{card.title}</h3>
        <span className="emp-kpi-card__badge">{card.statusLabel}</span>
      </div>
      <p className="emp-kpi-card__ratio">
        <strong>{card.actual}</strong>
        <span> / {card.denominator}</span>
        <em>{card.key === 'requested' ? ' khách' : ' lượt'}</em>
      </p>
      <p className="emp-kpi-card__rates">
        <span>{card.rateLabel}</span>
        <span>Mục tiêu {card.targetLabel}</span>
      </p>
      <div className="emp-kpi-card__bar" aria-hidden="true">
        <span style={{ width: `${Math.round(card.progress * 100)}%` }} />
      </div>
      <p className="emp-kpi-card__missing">{card.missingText}</p>
      {card.mixedTargets && (
        <p className="emp-kpi-card__note">Target khác nhau theo chi nhánh — xem chi tiết bên dưới</p>
      )}
    </button>
  )
}

function BranchSegment({ segment, expanded, onToggle }) {
  const cards = EMPLOYEE_KPI_CARD_DEFS
    .map((def) => buildKpiCardModel(def, segment.kpis?.[def.key], segment.counts))
    .filter((card) => card.status !== KPI_STATUS.NOT_APPLICABLE)
  return (
    <article className="emp-kpi-branch">
      <button type="button" className="emp-kpi-branch__head" onClick={onToggle}>
        <div>
          <strong>{getBranchName(segment.servingBranchId) || segment.servingBranchId}</strong>
          <span>
            {segment.counts.totalInvoices} HĐ · MAIN {segment.counts.main} · ADDON {segment.counts.addon}
            {' · '}90' {segment.counts.duration90 || 0}
          </span>
        </div>
        <em>{expanded ? 'Thu gọn' : 'Xem chi tiết'}</em>
      </button>
      {expanded && (
        <div className="emp-kpi-branch__body">
          {cards.map((card) => (
            <div key={card.key} className="emp-kpi-branch__row">
              <span>{card.title}</span>
              <span>
                {card.actual}/{card.denominator} · {card.rateLabel} / mục tiêu {card.targetLabel}
              </span>
              <span className={`emp-kpi-mini ${card.status === KPI_STATUS.MET ? 'is-met' : ''}`}>
                {card.statusLabel}
                {card.status === KPI_STATUS.NOT_MET && card.missing != null
                  ? ` · thiếu ${card.missing}`
                  : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function DrillPanel({ filterKey, rows, onClose, onFilter }) {
  return (
    <div className="emp-kpi-drill" role="dialog" aria-modal="true">
      <div className="emp-kpi-drill__panel">
        <header>
          <div>
            <h3>Chi tiết dịch vụ</h3>
            <p>1 dòng = 1 dịch vụ · Chỉ hóa đơn của bạn trong kỳ đang xem</p>
          </div>
          <button type="button" onClick={onClose}>Đóng</button>
        </header>
        <div className="emp-kpi-drill__filters">
          {[
            ['all', 'Tất cả'],
            ['main', 'DV chính'],
            ['addon', 'DV phụ'],
            ['advanced', 'Chuyên sâu'],
            ['combo', 'Combo'],
            ['duration90', '90 phút'],
            ['requested', 'Khách yêu cầu'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filterKey === key ? 'is-active' : ''}
              onClick={() => onFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="emp-kpi-drill__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Mã HĐ</th>
                <th>Chi nhánh phục vụ</th>
                <th>Dịch vụ</th>
                <th>Nhóm KPI</th>
                <th>Khách yêu cầu</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>Không có dữ liệu</td>
                </tr>
              )}
              {rows.map((row, idx) => (
                <tr key={`${row.invoiceId}-${idx}`}>
                  <td>{formatDateVi(row.date)}</td>
                  <td className="emp-kpi-mono">{String(row.invoiceId).slice(0, 8)}</td>
                  <td>{getBranchName(row.branchId) || row.branchId}</td>
                  <td>{row.serviceName}</td>
                  <td>{row.groupLabel}</td>
                  <td>{row.customerRequested ? 'Có' : 'Không'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function EmployeeKpi() {
  const syncVersion = useDataSyncVersion()
  const employeeId = getCurrentUserEmployeeId()
  const homeBranchId = getEmployeeById(employeeId)?.branchId || getCurrentUserBranch() || ''
  const [month, setMonth] = useState(() => currentMonthYm())
  const [cycle, setCycle] = useState(() => getDefaultPayCycleForVietnamDate())
  const [policies, setPolicies] = useState([])
  const [policyError, setPolicyError] = useState('')
  const [invoiceError, setInvoiceError] = useState('')
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandedBranch, setExpandedBranch] = useState('')
  const [drillOpen, setDrillOpen] = useState(false)
  const [lineFilter, setLineFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await fetchKpiBranchPolicies()
        if (!cancelled) {
          setPolicies(rows)
          setPolicyError('')
        }
      } catch (err) {
        if (!cancelled) setPolicyError(err.message || 'Không tải được KPI policy')
      }
    })()
    return () => { cancelled = true }
  }, [syncVersion])

  const monthRange = useMemo(() => resolveKpiPayCycleRange(month, cycle), [month, cycle])
  const fetchRange = useMemo(() => monthBounds(month), [month])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!employeeId) return
      setLoading(true)
      setInvoiceError('')
      try {
        // Full month scope 1 lần — không dùng cache 100. Filter attribution trong engine.
        const result = await fetchKpiInvoicesForScope({
          fromDate: fetchRange.fromDate,
          toDate: fetchRange.toDate,
        })
        if (cancelled) return
        setInvoices(result.invoices)
      } catch (err) {
        if (cancelled) return
        setInvoices([])
        setInvoiceError(err.message || 'Không tải được hóa đơn KPI từ cloud')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [employeeId, fetchRange.fromDate, fetchRange.toDate, syncVersion])

  const model = useMemo(() => {
    if (!employeeId) return null
    return computeEmployeeKpi(invoices, {
      employeeId,
      homeBranchId,
      fromDate: monthRange.fromDate,
      toDate: monthRange.toDate,
      policies,
    })
  }, [employeeId, homeBranchId, invoices, monthRange.fromDate, monthRange.toDate, policies])

  const summary = useMemo(() => summarizeOverallKpis(model?.overall), [model])
  const allLines = useMemo(
    () => buildKpiServiceLineRows(model?.includedInvoices || []),
    [model],
  )
  const drillRows = useMemo(
    () => filterKpiServiceLineRows(allLines, lineFilter),
    [allLines, lineFilter],
  )

  if (!canAccessEmployeeKpiPage()) {
    return (
      <div className="erp-page emp-kpi-page">
        <ErpPageHeader title="KPI" subtitle="Chỉ nhân viên được xem KPI của mình." />
      </div>
    )
  }

  if (!isEmployee() || !employeeId) {
    return (
      <div className="erp-page emp-kpi-page">
        <ErpPageHeader title="KPI" subtitle="Không xác định được hồ sơ nhân viên." />
      </div>
    )
  }

  return (
    <div className="erp-page emp-kpi-page">
      <ErpPageHeader
        title={`KPI ${formatMonthLabel(month)}`}
        subtitle={`Theo hóa đơn cloud · ${monthRange.rangeLabel} · Phạt KPI trừ vào lương kỳ này`}
        badge={{
          value: summary.noPolicy ? '—' : `${summary.met}/${summary.total}`,
          label: summary.headline,
        }}
        actions={(
          <div className="emp-kpi-month">
            <label>
              <span>Tháng</span>
              <input
                type="month"
                value={month}
                max={currentMonthYm()}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            <label>
              <span>Kỳ lương</span>
              <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
                <option value={PAY_CYCLES.PERIOD_1}>Kỳ 1 (01–15)</option>
                <option value={PAY_CYCLES.PERIOD_2}>Kỳ 2 (16–cuối)</option>
              </select>
            </label>
          </div>
        )}
      />

      {policyError && <p className="emp-kpi-warn">{policyError}</p>}
      {invoiceError && <p className="emp-kpi-warn">{invoiceError}</p>}
      {loading && <p className="emp-kpi-muted">Đang tải hóa đơn KPI…</p>}

      <section className="emp-kpi-summary" aria-live="polite">
        <div className={`emp-kpi-summary__pill ${summary.allMet ? 'is-met' : 'is-miss'}`}>
          {summary.headline}
        </div>
        <p>
          {summary.noPolicy
            ? 'Hiển thị số liệu thô — chưa có chính sách KPI kỳ này'
            : (
              <>
                Đã đạt <strong>{summary.met}/{summary.total}</strong> KPI
              </>
            )}
          {model?.excludedGiaLaiInvoices ? ` · đã loại ${model.excludedGiaLaiInvoices} HĐ Gia Lai` : ''}
        </p>
        <p className="emp-kpi-muted">
          MAIN {model?.overall?.counts?.main ?? 0} · ADDON {model?.overall?.counts?.addon ?? 0}
          {' '}· ADV {model?.overall?.counts?.advanced ?? 0} · COMBO {model?.overall?.counts?.combo ?? 0}
          {' '}· 90' {model?.overall?.counts?.duration90 ?? 0}
          {' '}· HĐ {model?.overall?.counts?.totalInvoices ?? 0} · YC {model?.overall?.counts?.requestedInvoices ?? 0}
        </p>
        {model?.penalty?.applied ? (
          <p className="emp-kpi-muted">
            Thiếu {model.penalty.totalMissing} lượt
            {' · '}Phạt KPI {formatCurrency(model.penalty.kpiPenalty)}
            {' '}(50.000đ × thiếu, trừ vào lương kỳ này)
          </p>
        ) : null}
      </section>

      <section className="emp-kpi-grid">
        {summary.cards.map((card) => (
          <KpiCard
            key={card.key}
            card={card}
            onOpen={(key) => {
              setLineFilter(key === 'requested' ? 'requested' : key)
              setDrillOpen(true)
            }}
          />
        ))}
      </section>

      <section className="emp-kpi-branches">
        <h2>Chi tiết theo chi nhánh phục vụ</h2>
        <p className="emp-kpi-branches__hint">
          Policy theo chi nhánh nhà của NV + ngày HĐ. Trong cụm Trạm / Sóc Trăng / Sống Khoẻ: Massage Thái = Chuyên sâu = ADVANCED. KPI phạt gộp mọi CN theo employeeId trong kỳ — không cộng missing từng CN.
        </p>
        {(model?.servingBranchSegments || []).length === 0 && (
          <p className="emp-kpi-empty">Chưa có hóa đơn KPI trong kỳ này.</p>
        )}
        {(model?.servingBranchSegments || []).map((seg) => (
          <BranchSegment
            key={seg.servingBranchId}
            segment={seg}
            expanded={expandedBranch === seg.servingBranchId}
            onToggle={() =>
              setExpandedBranch((cur) => (cur === seg.servingBranchId ? '' : seg.servingBranchId))
            }
          />
        ))}
      </section>

      {drillOpen && (
        <DrillPanel
          filterKey={lineFilter}
          rows={drillRows}
          onClose={() => setDrillOpen(false)}
          onFilter={setLineFilter}
        />
      )}
    </div>
  )
}
