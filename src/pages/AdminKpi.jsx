import { useEffect, useMemo, useState } from 'react'
import ErpFilterBar from '../components/erp/ErpFilterBar'
import ErpPageHeader from '../components/erp/ErpPageHeader'
import {
  canAccessAdminKpiPage,
  getCurrentUserEmployeeId,
  getCurrentUserName,
  isAdmin,
} from '../constants/auth'
import { KPI_SCOPE_BRANCH_IDS } from '../constants/kpiPolicy'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import {
  fetchKpiBranchPolicies,
  fetchKpiPolicyChangeLogs,
  insertKpiBranchPolicy,
} from '../repositories/kpiPolicyRepository'
import {
  buildAdminKpiDashboard,
  decimalToPercentInput,
  filterAdminKpiRows,
  formatAdminKpiMetricCell,
  percentInputToDecimal,
  EMPLOYEE_KPI_CARD_DEFS,
} from '../utils/adminKpiDashboard'
import { exportAdminKpiCsv, exportAdminKpiExcel } from '../utils/adminKpiExport'
import {
  buildEmployeeKpiDetailExportBundle,
  exportEmployeeKpiDetailExcel,
  exportEmployeeKpiDetailPdf,
} from '../utils/employeeKpiDetailExport'
import { getBranchName } from '../utils/branchStorage'
import { notifyDataSynced } from '../utils/dataSyncEvents'
import { loadEmployees } from '../utils/employeeStorage'
import {
  buildKpiServiceLineRows,
  currentMonthYm,
  filterKpiServiceLineRows,
  formatKpiPercent,
  formatMonthLabel,
  KPI_GROUP_LABELS,
} from '../utils/employeeKpiView'
import {
  fetchKpiInvoicesForScope,
  resolveKpiMonthRange,
} from '../utils/kpiInvoiceScope'
import './AdminKpi.css'
import '../components/erp/erp.css'

function formatDateVi(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y) return '—'
  return `${d}/${m}/${y}`
}

function AdminKpiMetricCell({ card }) {
  const display = formatAdminKpiMetricCell(card)
  return (
    <div className={`admin-kpi-metric is-${display.tone}`}>
      <div className="admin-kpi-metric__ratio">{display.ratioLine}</div>
      {display.targetLine ? (
        <div className="admin-kpi-metric__target">{display.targetLine}</div>
      ) : null}
      <div className={`admin-kpi-metric__hint is-${display.tone}`}>{display.hintLine}</div>
    </div>
  )
}

function ResultCell({ row }) {
  const tone = row.rowStatus === 'MET' ? 'met'
    : row.rowStatus === 'NOT_MET' ? 'miss'
      : 'neutral'
  return (
    <div className={`admin-kpi-result is-${tone}`}>
      <strong>{row.scoreLabel}</strong>
      {row.rowStatus === 'NO_POLICY' || row.rowStatus === 'INSUFFICIENT_DATA' ? (
        <span>{row.rowStatusLabel}</span>
      ) : null}
    </div>
  )
}

export default function AdminKpi() {
  const syncVersion = useDataSyncVersion()
  const [tab, setTab] = useState('dashboard') // dashboard | policy | audit
  const [month, setMonth] = useState(() => currentMonthYm())
  const [branchId, setBranchId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [status, setStatus] = useState('')
  const [kpiKey, setKpiKey] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [policies, setPolicies] = useState([])
  const [logs, setLogs] = useState([])
  const [loadError, setLoadError] = useState('')
  const [invoiceError, setInvoiceError] = useState('')
  const [invoices, setInvoices] = useState([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [scopeMeta, setScopeMeta] = useState(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [policyForm, setPolicyForm] = useState({
    branchId: 'soc-trang',
    effectiveFrom: '',
    addon: '70',
    advanced: '10',
    combo: '30',
    requested: '20',
    duration90: '30',
    reason: '',
  })
  const [policyMsg, setPolicyMsg] = useState('')
  const [policyBusy, setPolicyBusy] = useState(false)

  const reloadPolicies = async () => {
    try {
      const [p, l] = await Promise.all([fetchKpiBranchPolicies(), fetchKpiPolicyChangeLogs()])
      setPolicies(p)
      setLogs(l)
      setLoadError('')
    } catch (err) {
      setLoadError(err.message || 'Không tải được KPI policy')
    }
  }

  useEffect(() => {
    reloadPolicies()
  }, [syncVersion])

  const monthRange = useMemo(() => resolveKpiMonthRange(month), [month])
  const employees = useMemo(() => loadEmployees(), [syncVersion])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setInvoicesLoading(true)
      setInvoiceError('')
      try {
        const result = await fetchKpiInvoicesForScope({
          fromDate: monthRange.fromDate,
          toDate: monthRange.toDate,
        })
        if (cancelled) return
        setInvoices(result.invoices)
        setScopeMeta({
          ...monthRange,
          invoiceCount: result.invoices.length,
          fromCache: result.fromCache,
          fetchedAt: result.fetchedAt,
        })
      } catch (err) {
        if (cancelled) return
        setInvoices([])
        setInvoiceError(err.message || 'Không tải được hóa đơn KPI từ cloud')
      } finally {
        if (!cancelled) setInvoicesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [monthRange.fromDate, monthRange.toDate, syncVersion])

  const dashboard = useMemo(() => buildAdminKpiDashboard(invoices, {
    fromDate: monthRange.fromDate,
    toDate: monthRange.toDate,
    policies,
    employees,
  }), [invoices, monthRange.fromDate, monthRange.toDate, policies, employees])

  const filteredRows = useMemo(
    () => filterAdminKpiRows(dashboard.rows, {
      branchId,
      employeeId,
      status,
      kpiKey,
      homeOrServing: 'home',
    }),
    [dashboard.rows, branchId, employeeId, status, kpiKey],
  )

  const selectedRow = useMemo(
    () => dashboard.rows.find((r) => r.employeeId === selectedEmployeeId) || null,
    [dashboard.rows, selectedEmployeeId],
  )

  const employeeOptions = useMemo(() => {
    const source = branchId
      ? dashboard.rows.filter((r) => r.homeBranchId === branchId)
      : dashboard.rows
    const map = new Map()
    for (const r of source) map.set(r.employeeId, r.employeeName)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [dashboard.rows, branchId])

  useEffect(() => {
    if (employeeId && !employeeOptions.some(([id]) => id === employeeId)) {
      setEmployeeId('')
    }
  }, [employeeId, employeeOptions])

  if (!canAccessAdminKpiPage()) {
    return (
      <div className="erp-page admin-kpi-page">
        <ErpPageHeader title="KPI Admin" subtitle="Chỉ Admin được xem dashboard KPI." />
      </div>
    )
  }

  const onExportCsv = () => {
    exportAdminKpiCsv(filteredRows, { month, branchId })
  }

  const onExportExcel = async () => {
    setExportBusy(true)
    try {
      await exportAdminKpiExcel(filteredRows, { month, branchId })
    } finally {
      setExportBusy(false)
    }
  }

  const onCreatePolicy = async (e) => {
    e.preventDefault()
    setPolicyMsg('')
    const targets = {
      addon: percentInputToDecimal(policyForm.addon),
      advanced: percentInputToDecimal(policyForm.advanced),
      combo: percentInputToDecimal(policyForm.combo),
      requested: percentInputToDecimal(policyForm.requested),
      duration90: percentInputToDecimal(policyForm.duration90),
    }
    if (Object.values(targets).some((v) => !Number.isFinite(v) || v < 0 || v > 1)) {
      setPolicyMsg('Target phải từ 0–100%.')
      return
    }
    if (!policyForm.effectiveFrom || !policyForm.reason.trim()) {
      setPolicyMsg('Cần ngày hiệu lực và lý do thay đổi.')
      return
    }
    setPolicyBusy(true)
    try {
      await insertKpiBranchPolicy({
        branchId: policyForm.branchId,
        effectiveFrom: policyForm.effectiveFrom,
        targets,
        actorId: getCurrentUserEmployeeId() || 'admin',
        actorName: getCurrentUserName() || 'Admin',
        reason: policyForm.reason.trim(),
      })
      notifyDataSynced(['kpi-policies'])
      await reloadPolicies()
      setPolicyMsg('Đã tạo policy mới (versioned). KPI lịch sử trước ngày hiệu lực không đổi.')
      setPolicyForm((f) => ({ ...f, reason: '' }))
    } catch (err) {
      setPolicyMsg(err.message || 'Không tạo được policy')
    } finally {
      setPolicyBusy(false)
    }
  }

  return (
    <div className="erp-page admin-kpi-page">
      <ErpPageHeader
        title={`KPI Admin · ${formatMonthLabel(month)}`}
        subtitle={`6 chi nhánh · Cloud HĐ full tháng · ${monthRange.rangeLabel}`}
        badge={{
          value: `${dashboard.system.employeesMetAll}/${dashboard.system.employeeCount}`,
          label: 'NV đạt đủ KPI',
        }}
        actions={(
          <div className="admin-kpi-tabs">
            <button type="button" className={tab === 'dashboard' ? 'is-active' : ''} onClick={() => setTab('dashboard')}>
              Dashboard
            </button>
            <button type="button" className={tab === 'policy' ? 'is-active' : ''} onClick={() => setTab('policy')}>
              Cấu hình KPI
            </button>
            <button type="button" className={tab === 'audit' ? 'is-active' : ''} onClick={() => setTab('audit')}>
              Lịch sử policy
            </button>
          </div>
        )}
      />

      {loadError && <p className="admin-kpi-warn">{loadError}</p>}
      {invoiceError && <p className="admin-kpi-warn">{invoiceError}</p>}
      {invoicesLoading && <p className="admin-kpi-muted">Đang tải hóa đơn KPI từ cloud…</p>}
      {scopeMeta && !invoicesLoading && (
        <p className="admin-kpi-muted">
          Phạm vi: {scopeMeta.rangeLabel} · {scopeMeta.invoiceCount} HĐ cloud
          {scopeMeta.dataAsOfHint ? ` · HĐ thực tế đến ${scopeMeta.dataAsOfHint}` : ''}
        </p>
      )}

      {tab === 'dashboard' && (
        <>
          <ErpFilterBar
            actions={(
              <>
                <button type="button" className="admin-kpi-btn" onClick={onExportCsv}>Export CSV</button>
                <button type="button" className="admin-kpi-btn" disabled={exportBusy} onClick={onExportExcel}>
                  {exportBusy ? 'Đang xuất…' : 'Export Excel'}
                </button>
              </>
            )}
          >
            <label>
              Tháng
              <input type="month" value={month} max={currentMonthYm()} onChange={(e) => setMonth(e.target.value)} />
            </label>
            <label>
              Chi nhánh
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Tất cả 6 CN</option>
                {KPI_SCOPE_BRANCH_IDS.map((id) => (
                  <option key={id} value={id}>{getBranchName(id) || id}</option>
                ))}
              </select>
            </label>
            <label>
              Nhân viên
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Tất cả</option>
                {employeeOptions.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Trạng thái
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="MET">Đạt đủ KPI</option>
                <option value="NOT_MET">Chưa đạt đủ KPI</option>
                <option value="INSUFFICIENT_DATA">Chưa đủ dữ liệu</option>
                <option value="NO_POLICY">Chưa có chính sách KPI</option>
              </select>
            </label>
            <label>
              KPI cụ thể (chưa đạt)
              <select value={kpiKey} onChange={(e) => setKpiKey(e.target.value)}>
                <option value="">—</option>
                {EMPLOYEE_KPI_CARD_DEFS.map((d) => (
                  <option key={d.key} value={d.key}>{d.title}</option>
                ))}
              </select>
            </label>
          </ErpFilterBar>

          <section className="admin-kpi-system">
            <article>
              <h3>Hệ thống</h3>
              <p>{dashboard.system.employeeCount} NV · {dashboard.system.counts.totalInvoices} HĐ</p>
              <p>
                Dịch vụ chính {dashboard.system.counts.main}
                {' · '}Dịch vụ phụ {dashboard.system.counts.addon}
                {' · '}Chuyên sâu {dashboard.system.counts.advanced}
                {' · '}Combo {dashboard.system.counts.combo}
                {' · '}90 phút {dashboard.system.counts.duration90 || 0}
              </p>
              <p>
                Khách yêu cầu {dashboard.system.counts.requestedInvoices}/{dashboard.system.counts.totalInvoices}
                {' '}({formatKpiPercent(dashboard.system.rates.requested)})
              </p>
              <p>
                Đạt đủ KPI: {dashboard.system.employeesMetAll}
                {' · '}Chưa đạt đủ: {dashboard.system.employeesNotMet}
                {' · '}Chưa đủ dữ liệu: {dashboard.system.employeesInsufficient}
              </p>
            </article>
            <div className="admin-kpi-branch-grid">
              {dashboard.branches.map((b) => (
                <article key={b.branchId} className="admin-kpi-branch-card">
                  <h4>{b.branchName}</h4>
                  <p>{b.employeeCount} NV · Đạt đủ KPI: {b.employeesMetAll} ({formatKpiPercent(b.metRate)})</p>
                  <p className="admin-kpi-muted">
                    TB DV phụ {formatKpiPercent(b.avgRates.addon)}
                    {' · '}CS {formatKpiPercent(b.avgRates.advanced)}
                    {' · '}Combo {formatKpiPercent(b.avgRates.combo)}
                    {' · '}YC {formatKpiPercent(b.avgRates.requested)}
                    {' · '}90' {formatKpiPercent(b.avgRates.duration90)}
                  </p>
                  <p className="admin-kpi-note">Theo chi nhánh hiện tại của NV — TB chỉ tham khảo</p>
                </article>
              ))}
            </div>
          </section>

          <section className="admin-kpi-table-wrap">
            <table className="admin-kpi-table admin-kpi-table--simple">
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th>Dịch vụ chính</th>
                  <th>Dịch vụ phụ</th>
                  <th>Combo</th>
                  <th>Chuyên sâu</th>
                  <th>Khách yêu cầu</th>
                  <th>90 phút</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr><td colSpan={8}>Không có dữ liệu KPI trong bộ lọc.</td></tr>
                )}
                {filteredRows.map((row) => (
                  <tr
                    key={row.employeeId}
                    className={selectedEmployeeId === row.employeeId ? 'is-selected' : ''}
                    onClick={() => setSelectedEmployeeId(row.employeeId)}
                  >
                    <td><button type="button" className="admin-kpi-link">{row.employeeName}</button></td>
                    <td className="admin-kpi-main-count">{row.counts.main}</td>
                    <td><AdminKpiMetricCell card={row.cards.addon} /></td>
                    <td><AdminKpiMetricCell card={row.cards.combo} /></td>
                    <td><AdminKpiMetricCell card={row.cards.advanced} /></td>
                    <td><AdminKpiMetricCell card={row.cards.requested} /></td>
                    <td><AdminKpiMetricCell card={row.cards.duration90} /></td>
                    <td><ResultCell row={row} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {selectedRow && (
            <EmployeeDrillPanel
              row={selectedRow}
              monthYm={month}
              fromDate={monthRange.fromDate}
              toDate={monthRange.toDate}
              rangeLabel={monthRange.rangeLabel}
              onClose={() => setSelectedEmployeeId('')}
            />
          )}
        </>
      )}

      {tab === 'policy' && (
        <section className="admin-kpi-policy">
          <div className="admin-kpi-policy__form-card">
            <h2>Cấu hình KPI</h2>
            <p>Tạo policy mới (versioned). Policy cũ sẽ được đóng ngày trước effective_from. Không overwrite lịch sử.</p>
            <form onSubmit={onCreatePolicy} className="admin-kpi-policy__form">
              <label>
                Chi nhánh
                <select
                  value={policyForm.branchId}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, branchId: e.target.value }))}
                >
                  {KPI_SCOPE_BRANCH_IDS.map((id) => (
                    <option key={id} value={id}>{getBranchName(id) || id}</option>
                  ))}
                </select>
              </label>
              <label>
                Ngày bắt đầu áp dụng
                <input
                  type="date"
                  value={policyForm.effectiveFrom}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                />
              </label>
              <label>
                KPI DV phụ (%)
                <input value={policyForm.addon} onChange={(e) => setPolicyForm((f) => ({ ...f, addon: e.target.value }))} />
              </label>
              <label>
                KPI Chuyên sâu (%)
                <input value={policyForm.advanced} onChange={(e) => setPolicyForm((f) => ({ ...f, advanced: e.target.value }))} />
              </label>
              <label>
                KPI Combo (%)
                <input value={policyForm.combo} onChange={(e) => setPolicyForm((f) => ({ ...f, combo: e.target.value }))} />
              </label>
              <label>
                KPI Khách yêu cầu (%)
                <input value={policyForm.requested} onChange={(e) => setPolicyForm((f) => ({ ...f, requested: e.target.value }))} />
              </label>
              <label>
                KPI 90 phút (%)
                <input value={policyForm.duration90} onChange={(e) => setPolicyForm((f) => ({ ...f, duration90: e.target.value }))} />
              </label>
              <label className="admin-kpi-policy__reason">
                Lý do thay đổi
                <textarea
                  rows={3}
                  value={policyForm.reason}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, reason: e.target.value }))}
                />
              </label>
              <button type="submit" className="admin-kpi-btn admin-kpi-btn--primary" disabled={policyBusy || !isAdmin()}>
                {policyBusy ? 'Đang lưu…' : 'Tạo policy mới'}
              </button>
            </form>
            {policyMsg && <p className="admin-kpi-policy__msg">{policyMsg}</p>}
          </div>

          <div className="admin-kpi-policy__list">
            <h3>Policy hiện có (6 CN)</h3>
            <table className="admin-kpi-table">
              <thead>
                <tr>
                  <th>Chi nhánh</th>
                  <th>Từ</th>
                  <th>Đến</th>
                  <th>DV phụ</th>
                  <th>CS</th>
                  <th>Combo</th>
                  <th>YC</th>
                  <th>90'</th>
                  <th>Trạng thái</th>
                  <th>Lý do</th>
                </tr>
              </thead>
              <tbody>
                {policies
                  .filter((p) => KPI_SCOPE_BRANCH_IDS.includes(p.branchId))
                  .slice()
                  .sort((a, b) => String(a.branchId).localeCompare(b.branchId) || String(b.effectiveFrom).localeCompare(a.effectiveFrom))
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{getBranchName(p.branchId) || p.branchId}</td>
                      <td>{formatDateVi(p.effectiveFrom)}</td>
                      <td>{p.effectiveTo ? formatDateVi(p.effectiveTo) : '∞'}</td>
                      <td>{decimalToPercentInput(p.addonTarget)}%</td>
                      <td>{decimalToPercentInput(p.advancedTarget)}%</td>
                      <td>{decimalToPercentInput(p.comboTarget)}%</td>
                      <td>{decimalToPercentInput(p.requestedTarget)}%</td>
                      <td>{p.duration90Target == null ? '—' : `${decimalToPercentInput(p.duration90Target)}%`}</td>
                      <td>{p.status}</td>
                      <td>{p.changeReason || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'audit' && (
        <section className="admin-kpi-audit">
          <h2>Lịch sử cấu hình KPI</h2>
          <table className="admin-kpi-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Chi nhánh</th>
                <th>Effective</th>
                <th>Actor</th>
                <th>Lý do</th>
                <th>Old → New</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={6}>Chưa có log.</td></tr>
              )}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateVi(log.createdAt) || log.timestamp || '—'}</td>
                  <td>{getBranchName(log.branchId) || log.branchId}</td>
                  <td>{formatDateVi(log.effectiveFrom)} → {log.effectiveTo ? formatDateVi(log.effectiveTo) : '∞'}</td>
                  <td>{log.actorId || '—'}</td>
                  <td>{log.reason || '—'}</td>
                  <td className="admin-kpi-mono">
                    {summarizePolicySnap(log.oldPolicy)} → {summarizePolicySnap(log.newPolicy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function summarizePolicySnap(policy) {
  if (!policy) return '(none)'
  const p = typeof policy === 'string' ? null : policy
  if (!p) return '(none)'
  const a = p.addonTarget ?? p.addon_target
  const adv = p.advancedTarget ?? p.advanced_target
  const c = p.comboTarget ?? p.combo_target
  const r = p.requestedTarget ?? p.requested_target
  const d90 = p.duration90Target ?? p.duration90_target
  const d90Label = d90 == null || d90 === '' ? '—' : decimalToPercentInput(d90)
  return `${decimalToPercentInput(a)}/${decimalToPercentInput(adv)}/${decimalToPercentInput(c)}/${decimalToPercentInput(r)}/${d90Label}`
}

function resolveLinePolicy(row, line) {
  const segs = row.model?.policySegments || []
  const byInvoice = segs.find((s) =>
    s.servingBranchId === line.branchId
    && Array.isArray(s.invoiceIds)
    && s.invoiceIds.includes(line.invoiceId),
  )
  if (byInvoice) return byInvoice
  return segs.find((s) => s.servingBranchId === line.branchId) || null
}

function formatLineContribution(line) {
  const parts = []
  const groupLabel = line.groupLabel || KPI_GROUP_LABELS[line.group] || '—'
  parts.push(`+1 ${groupLabel}`)
  if (line.customerRequested) parts.push('+1 Khách yêu cầu (HĐ)')
  return parts.join(' · ')
}

function formatPolicyLabel(seg) {
  if (!seg) return '—'
  if (!seg.targets) return 'Chưa có chính sách KPI'
  return [
    getBranchName(seg.servingBranchId) || seg.servingBranchId,
    `DV phụ ${decimalToPercentInput(seg.targets.addon)}%`,
    `CS ${decimalToPercentInput(seg.targets.advanced)}%`,
    `Combo ${decimalToPercentInput(seg.targets.combo)}%`,
    `YC ${decimalToPercentInput(seg.targets.requested)}%`,
    seg.targets.duration90 != null ? `90' ${decimalToPercentInput(seg.targets.duration90)}%` : null,
  ].filter(Boolean).join(' · ')
}

function EmployeeDrillPanel({ row, onClose, monthYm, fromDate, toDate, rangeLabel }) {
  const [lineFilter, setLineFilter] = useState('all')
  const [exportBusy, setExportBusy] = useState(false)
  const allLines = useMemo(
    () => buildKpiServiceLineRows(row.model?.includedInvoices || []),
    [row],
  )
  const lineRows = useMemo(
    () => filterKpiServiceLineRows(allLines, lineFilter),
    [allLines, lineFilter],
  )

  const onExportDetail = async (format) => {
    setExportBusy(true)
    try {
      const bundle = buildEmployeeKpiDetailExportBundle(row, {
        monthYm,
        fromDate,
        toDate,
        rangeLabel,
      })
      if (format === 'pdf') exportEmployeeKpiDetailPdf(bundle)
      else await exportEmployeeKpiDetailExcel(bundle)
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="admin-kpi-drill" role="dialog" aria-modal="true">
      <div className="admin-kpi-drill__panel">
        <header>
          <div>
            <h3>{row.employeeName}</h3>
            <p>
              Chi nhánh hiện tại: {row.homeBranchName}
              {' · '}
              Phạm vi: {rangeLabel || `${fromDate} → ${toDate}`}
            </p>
            <p>
              Chi nhánh đã phục vụ: {row.servingBranchNames.join(', ') || '—'}
              {' · '}
              {row.scoreLabel}
            </p>
          </div>
          <div className="admin-kpi-drill__actions">
            <button type="button" className="admin-kpi-btn" disabled={exportBusy} onClick={() => onExportDetail('xlsx')}>
              {exportBusy ? 'Đang xuất…' : 'Xuất Excel'}
            </button>
            <button type="button" className="admin-kpi-btn" disabled={exportBusy} onClick={() => onExportDetail('pdf')}>
              Xuất PDF
            </button>
            <button type="button" onClick={onClose}>Đóng</button>
          </div>
        </header>

        <div className="admin-kpi-drill__summary">
          <p>
            Dịch vụ chính {row.counts.main}
            {' · '}Dịch vụ phụ {row.counts.addon}
            {' · '}Chuyên sâu {row.counts.advanced}
            {' · '}Combo {row.counts.combo}
            {' · '}90 phút {row.counts.duration90 || 0}
            {' · '}HĐ {row.counts.totalInvoices}
            {' · '}Khách yêu cầu {row.counts.requestedInvoices}
          </p>
        </div>

        <div className="admin-kpi-drill__cards">
          {EMPLOYEE_KPI_CARD_DEFS.map((def) => {
            const card = row.cards[def.key]
            if (!card || card.status === 'NOT_APPLICABLE') return null
            const display = formatAdminKpiMetricCell(card)
            return (
              <div key={def.key} className={`admin-kpi-drill__card is-${display.tone}`}>
                <strong>{def.title}</strong>
                <span>{display.ratioLine}</span>
                {display.targetLine ? <span>{display.targetLine}</span> : null}
                <span className={`admin-kpi-metric__hint is-${display.tone}`}>{display.hintLine}</span>
              </div>
            )
          })}
        </div>

        <h4>Theo chi nhánh phục vụ</h4>
        <ul className="admin-kpi-drill__list">
          {(row.model.servingBranchSegments || []).map((seg) => (
            <li key={seg.servingBranchId}>
              <strong>{getBranchName(seg.servingBranchId) || seg.servingBranchId}</strong>
              {' — '}
              Dịch vụ chính {seg.counts.main}, Dịch vụ phụ {seg.counts.addon},
              {' '}Chuyên sâu {seg.counts.advanced}, Combo {seg.counts.combo},
              {' '}90 phút {seg.counts.duration90 || 0},
              {' '}HĐ {seg.counts.totalInvoices}, Khách yêu cầu {seg.counts.requestedInvoices}
            </li>
          ))}
        </ul>

        <h4>Chính sách KPI áp dụng</h4>
        <ul className="admin-kpi-drill__list">
          {(row.model.policySegments || []).map((seg) => (
            <li key={`${seg.policyId}-${seg.servingBranchId}`}>
              <strong>{getBranchName(seg.servingBranchId) || seg.servingBranchId}</strong>
              {' · '}
              {seg.targets
                ? (
                  <>
                    Mục tiêu DV phụ {decimalToPercentInput(seg.targets?.addon)}%
                    {' / '}CS {decimalToPercentInput(seg.targets?.advanced)}%
                    {' / '}Combo {decimalToPercentInput(seg.targets?.combo)}%
                    {' / '}YC {decimalToPercentInput(seg.targets?.requested)}%
                    {seg.targets?.duration90 != null
                      ? ` / 90' ${decimalToPercentInput(seg.targets.duration90)}%`
                      : ''}
                  </>
                )
                : 'Chưa có chính sách KPI kỳ này'}
              {' · '}
              {formatDateVi(seg.effectiveFrom)} → {seg.effectiveTo ? formatDateVi(seg.effectiveTo) : '∞'}
            </li>
          ))}
        </ul>

        <div className="admin-kpi-drill__filters">
          <span>Lọc dòng dịch vụ:</span>
          {[
            ['all', 'Tất cả'],
            ['main', 'Dịch vụ chính'],
            ['addon', 'Dịch vụ phụ'],
            ['advanced', 'Chuyên sâu'],
            ['combo', 'Combo'],
            ['duration90', '90 phút'],
            ['requested', 'Khách yêu cầu'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={lineFilter === key ? 'is-active' : ''}
              onClick={() => setLineFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <h4>Chi tiết dịch vụ ({lineRows.length} dòng)</h4>
        <div className="admin-kpi-drill__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Mã hóa đơn</th>
                <th>Chi nhánh phục vụ</th>
                <th>Dịch vụ</th>
                <th>Nhóm KPI</th>
                <th>Khách yêu cầu</th>
                <th>Chính sách áp dụng</th>
                <th>Đóng góp KPI</th>
              </tr>
            </thead>
            <tbody>
              {lineRows.length === 0 && (
                <tr><td colSpan={8}>Không có dòng dịch vụ</td></tr>
              )}
              {lineRows.map((r, idx) => {
                const policy = resolveLinePolicy(row, r)
                return (
                  <tr key={`${r.invoiceId}-${r.token}-${idx}`}>
                    <td>{formatDateVi(r.date)}</td>
                    <td className="admin-kpi-mono">{String(r.invoiceId).slice(0, 8)}</td>
                    <td>{getBranchName(r.branchId) || r.branchId}</td>
                    <td>{r.serviceName}</td>
                    <td>{r.groupLabel}</td>
                    <td>{r.customerRequested ? 'Có' : 'Không'}</td>
                    <td className="admin-kpi-policy-cell">{formatPolicyLabel(policy)}</td>
                    <td>{formatLineContribution(r)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
