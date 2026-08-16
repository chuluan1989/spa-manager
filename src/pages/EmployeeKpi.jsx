import { useEffect, useMemo, useState } from 'react'
import ErpPageHeader from '../components/erp/ErpPageHeader'
import { canAccessEmployeeKpiPage, getCurrentUserEmployeeId, isEmployee } from '../constants/auth'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import { fetchKpiBranchPolicies } from '../repositories/kpiPolicyRepository'
import { getBranchName } from '../utils/branchStorage'
import { computeEmployeeKpi } from '../utils/employeeKpiEngine'
import {
  buildDrillRows,
  buildKpiCardModel,
  currentMonthYm,
  formatMonthLabel,
  monthBounds,
  summarizeOverallKpis,
  EMPLOYEE_KPI_CARD_DEFS,
} from '../utils/employeeKpiView'
import { loadInvoices } from '../utils/invoiceStorage'
import { KPI_STATUS } from '../constants/kpiPolicy'
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
  const cards = EMPLOYEE_KPI_CARD_DEFS.map((def) =>
    buildKpiCardModel(def, segment.kpis?.[def.key], segment.counts),
  )
  return (
    <article className="emp-kpi-branch">
      <button type="button" className="emp-kpi-branch__head" onClick={onToggle}>
        <div>
          <strong>{getBranchName(segment.servingBranchId) || segment.servingBranchId}</strong>
          <span>
            {segment.counts.totalInvoices} HĐ · MAIN {segment.counts.main} · ADDON {segment.counts.addon}
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

function DrillPanel({ kpiKey, rows, onClose }) {
  const def = EMPLOYEE_KPI_CARD_DEFS.find((d) => d.key === kpiKey)
  if (!def) return null
  return (
    <div className="emp-kpi-drill" role="dialog" aria-modal="true">
      <div className="emp-kpi-drill__panel">
        <header>
          <div>
            <h3>Chi tiết — {def.title}</h3>
            <p>Chỉ hóa đơn của bạn trong tháng đang xem</p>
          </div>
          <button type="button" onClick={onClose}>Đóng</button>
        </header>
        <div className="emp-kpi-drill__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Hóa đơn</th>
                <th>Chi nhánh phục vụ</th>
                {kpiKey === 'requested' ? (
                  <th>Khách yêu cầu</th>
                ) : (
                  <>
                    <th>DV chính</th>
                    <th>{def.title}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5}>Không có dữ liệu</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.invoiceId}>
                  <td>{formatDateVi(row.date)}</td>
                  <td className="emp-kpi-mono">{String(row.invoiceId).slice(0, 8)}</td>
                  <td>{getBranchName(row.branchId) || row.branchId}</td>
                  {kpiKey === 'requested' ? (
                    <td>{row.customerRequested ? 'Có' : 'Không'}</td>
                  ) : (
                    <>
                      <td>{row.mainLines.map((l) => l.name || l.token).join(', ') || '—'}</td>
                      <td>{row.focusLines.map((l) => l.name || l.token).join(', ') || '—'}</td>
                    </>
                  )}
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
  const [month, setMonth] = useState(() => currentMonthYm())
  const [policies, setPolicies] = useState([])
  const [policyError, setPolicyError] = useState('')
  const [expandedBranch, setExpandedBranch] = useState('')
  const [drillKey, setDrillKey] = useState('')

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

  const { fromDate, toDate } = useMemo(() => monthBounds(month), [month])

  const model = useMemo(() => {
    if (!employeeId) return null
    const invoices = loadInvoices()
    return computeEmployeeKpi(invoices, {
      employeeId,
      fromDate,
      toDate,
      policies,
    })
  }, [employeeId, fromDate, toDate, policies, syncVersion])

  const summary = useMemo(() => summarizeOverallKpis(model?.overall), [model])
  const drillRows = useMemo(
    () => (drillKey ? buildDrillRows(model?.includedInvoices || [], drillKey) : []),
    [drillKey, model],
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
        subtitle="Theo hóa đơn thực tế · Không gắn thưởng/phạt lương"
        badge={{
          value: `${summary.met}/${summary.total}`,
          label: summary.headline,
        }}
        actions={(
          <label className="emp-kpi-month">
            <span>Tháng</span>
            <input
              type="month"
              value={month}
              max={currentMonthYm()}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        )}
      />

      {policyError && <p className="emp-kpi-warn">{policyError}</p>}

      <section className="emp-kpi-summary" aria-live="polite">
        <div className={`emp-kpi-summary__pill ${summary.allMet ? 'is-met' : 'is-miss'}`}>
          {summary.headline}
        </div>
        <p>
          Đã đạt <strong>{summary.met}/{summary.total}</strong> KPI
          {model?.excludedGiaLaiInvoices ? ` · đã loại ${model.excludedGiaLaiInvoices} HĐ Gia Lai` : ''}
        </p>
      </section>

      <section className="emp-kpi-grid">
        {summary.cards.map((card) => (
          <KpiCard key={card.key} card={card} onOpen={setDrillKey} />
        ))}
      </section>

      <section className="emp-kpi-branches">
        <h2>Chi tiết theo chi nhánh phục vụ</h2>
        <p className="emp-kpi-branches__hint">
          Policy theo chi nhánh phục vụ + ngày HĐ. Không lấy trung bình target giữa các CN.
        </p>
        {(model?.servingBranchSegments || []).length === 0 && (
          <p className="emp-kpi-empty">Chưa có hóa đơn KPI trong tháng này.</p>
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

      {drillKey && (
        <DrillPanel kpiKey={drillKey} rows={drillRows} onClose={() => setDrillKey('')} />
      )}
    </div>
  )
}
