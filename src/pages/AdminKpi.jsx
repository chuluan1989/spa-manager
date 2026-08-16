import { useEffect, useMemo, useState } from 'react'
import ErpFilterBar from '../components/erp/ErpFilterBar'
import ErpPageHeader from '../components/erp/ErpPageHeader'
import {
  canAccessAdminKpiPage,
  getCurrentUserEmployeeId,
  getCurrentUserName,
  isAdmin,
} from '../constants/auth'
import { KPI_SCOPE_BRANCH_IDS, KPI_STATUS } from '../constants/kpiPolicy'
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
  percentInputToDecimal,
} from '../utils/adminKpiDashboard'
import { exportAdminKpiCsv, exportAdminKpiExcel } from '../utils/adminKpiExport'
import { getBranchName } from '../utils/branchStorage'
import { notifyDataSynced } from '../utils/dataSyncEvents'
import { loadEmployees } from '../utils/employeeStorage'
import {
  buildDrillRows,
  currentMonthYm,
  formatKpiPercent,
  formatMonthLabel,
  monthBounds,
  EMPLOYEE_KPI_CARD_DEFS,
} from '../utils/employeeKpiView'
import { loadInvoices } from '../utils/invoiceStorage'
import './AdminKpi.css'
import '../components/erp/erp.css'

function formatDateVi(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y) return '—'
  return `${d}/${m}/${y}`
}

function StatusPill({ status, label }) {
  const cls =
    status === 'MET' || status === KPI_STATUS.MET ? 'is-met'
      : status === 'INSUFFICIENT_DATA' || status === KPI_STATUS.INSUFFICIENT_DATA ? 'is-insuff'
        : 'is-miss'
  return <span className={`admin-kpi-pill ${cls}`}>{label}</span>
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
  const [exportBusy, setExportBusy] = useState(false)
  const [policyForm, setPolicyForm] = useState({
    branchId: 'soc-trang',
    effectiveFrom: '',
    addon: '70',
    advanced: '10',
    combo: '30',
    requested: '20',
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

  const { fromDate, toDate } = useMemo(() => monthBounds(month), [month])
  const employees = useMemo(() => loadEmployees(), [syncVersion])

  const dashboard = useMemo(() => {
    const invoices = loadInvoices()
    return buildAdminKpiDashboard(invoices, {
      fromDate,
      toDate,
      policies,
      employees,
    })
  }, [fromDate, toDate, policies, employees, syncVersion])

  const filteredRows = useMemo(
    () => filterAdminKpiRows(dashboard.rows, {
      branchId,
      employeeId,
      status,
      kpiKey,
      homeOrServing: 'either',
    }),
    [dashboard.rows, branchId, employeeId, status, kpiKey],
  )

  const selectedRow = useMemo(
    () => dashboard.rows.find((r) => r.employeeId === selectedEmployeeId) || null,
    [dashboard.rows, selectedEmployeeId],
  )

  const employeeOptions = useMemo(() => {
    const map = new Map()
    for (const r of dashboard.rows) map.set(r.employeeId, r.employeeName)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [dashboard.rows])

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
        subtitle="6 chi nhánh · Engine B1 · Không gắn thưởng/phạt lương"
        badge={{
          value: `${dashboard.system.employeesMetAll}/${dashboard.system.employeeCount}`,
          label: 'NV đạt 4/4',
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
                <option value="MET">ĐẠT KPI</option>
                <option value="NOT_MET">CHƯA ĐẠT</option>
                <option value="INSUFFICIENT_DATA">CHƯA ĐỦ DỮ LIỆU</option>
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
                MAIN {dashboard.system.counts.main} · ADDON {dashboard.system.counts.addon}
                {' '}· ADV {dashboard.system.counts.advanced} · COMBO {dashboard.system.counts.combo}
              </p>
              <p>
                Khách YC {dashboard.system.counts.requestedInvoices}/{dashboard.system.counts.totalInvoices}
                {' '}({formatKpiPercent(dashboard.system.rates.requested)})
              </p>
              <p>
                Đạt 4/4: {dashboard.system.employeesMetAll} · Chưa đạt: {dashboard.system.employeesNotMet}
                {' '}· Chưa đủ DL: {dashboard.system.employeesInsufficient}
              </p>
            </article>
            <div className="admin-kpi-branch-grid">
              {dashboard.branches.map((b) => (
                <article key={b.branchId} className="admin-kpi-branch-card">
                  <h4>{b.branchName}</h4>
                  <p>{b.employeeCount} NV · Đạt 4/4: {b.employeesMetAll} ({formatKpiPercent(b.metRate)})</p>
                  <p className="admin-kpi-muted">
                    TB DV phụ {formatKpiPercent(b.avgRates.addon)} · CS {formatKpiPercent(b.avgRates.advanced)}
                    {' '}· Combo {formatKpiPercent(b.avgRates.combo)} · YC {formatKpiPercent(b.avgRates.requested)}
                  </p>
                  <p className="admin-kpi-note">TB chỉ tham khảo — không average target để pass/fail</p>
                </article>
              ))}
            </div>
          </section>

          <section className="admin-kpi-table-wrap">
            <table className="admin-kpi-table">
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th>CN nhà</th>
                  <th>CN phục vụ</th>
                  <th>MAIN</th>
                  <th>ADDON</th>
                  <th>KPI DV phụ</th>
                  <th>ADV</th>
                  <th>KPI CS</th>
                  <th>COMBO</th>
                  <th>KPI Combo</th>
                  <th>Tổng HĐ</th>
                  <th>Khách YC</th>
                  <th>KPI YC</th>
                  <th>Đạt /4</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr><td colSpan={15}>Không có dữ liệu KPI trong bộ lọc.</td></tr>
                )}
                {filteredRows.map((row) => (
                  <tr
                    key={row.employeeId}
                    className={selectedEmployeeId === row.employeeId ? 'is-selected' : ''}
                    onClick={() => setSelectedEmployeeId(row.employeeId)}
                  >
                    <td><button type="button" className="admin-kpi-link">{row.employeeName}</button></td>
                    <td>{row.homeBranchName}</td>
                    <td>{row.servingBranchNames.join(', ') || '—'}</td>
                    <td>{row.counts.main}</td>
                    <td>{row.counts.addon}</td>
                    <td>
                      {row.cards.addon.rateLabel}
                      <small>{row.cards.addon.statusLabel}</small>
                    </td>
                    <td>{row.counts.advanced}</td>
                    <td>
                      {row.cards.advanced.rateLabel}
                      <small>{row.cards.advanced.statusLabel}</small>
                    </td>
                    <td>{row.counts.combo}</td>
                    <td>
                      {row.cards.combo.rateLabel}
                      <small>{row.cards.combo.statusLabel}</small>
                    </td>
                    <td>{row.counts.totalInvoices}</td>
                    <td>{row.counts.requestedInvoices}</td>
                    <td>
                      {row.cards.requested.rateLabel}
                      <small>{row.cards.requested.statusLabel}</small>
                    </td>
                    <td>{row.scoreLabel}</td>
                    <td><StatusPill status={row.rowStatus} label={row.rowStatusLabel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {selectedRow && (
            <EmployeeDrillPanel
              row={selectedRow}
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
                  <th>Status</th>
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
  return `${decimalToPercentInput(a)}/${decimalToPercentInput(adv)}/${decimalToPercentInput(c)}/${decimalToPercentInput(r)}`
}

function EmployeeDrillPanel({ row, onClose }) {
  const [kpiFocus, setKpiFocus] = useState('addon')
  const drillRows = useMemo(
    () => buildDrillRows(row.model?.includedInvoices || [], kpiFocus),
    [row, kpiFocus],
  )

  return (
    <div className="admin-kpi-drill" role="dialog" aria-modal="true">
      <div className="admin-kpi-drill__panel">
        <header>
          <div>
            <h3>{row.employeeName}</h3>
            <p>
              CN nhà: {row.homeBranchName}
              {' · '}
              Phục vụ: {row.servingBranchNames.join(', ') || '—'}
              {' · '}
              {row.scoreLabel} · {row.rowStatusLabel}
            </p>
          </div>
          <button type="button" onClick={onClose}>Đóng</button>
        </header>

        <div className="admin-kpi-drill__cards">
          {EMPLOYEE_KPI_CARD_DEFS.map((def) => {
            const card = row.cards[def.key]
            return (
              <button
                key={def.key}
                type="button"
                className={kpiFocus === def.key ? 'is-active' : ''}
                onClick={() => setKpiFocus(def.key)}
              >
                <strong>{def.title}</strong>
                <span>{card.actual}/{card.denominator} · {card.rateLabel}</span>
                <span>Target {card.targetLabel}</span>
                <span>{card.missingText}</span>
              </button>
            )
          })}
        </div>

        <h4>Theo chi nhánh phục vụ</h4>
        <ul className="admin-kpi-drill__list">
          {(row.model.servingBranchSegments || []).map((seg) => (
            <li key={seg.servingBranchId}>
              <strong>{getBranchName(seg.servingBranchId) || seg.servingBranchId}</strong>
              {' — '}
              MAIN {seg.counts.main}, ADDON {seg.counts.addon}, ADV {seg.counts.advanced}, COMBO {seg.counts.combo},
              HĐ {seg.counts.totalInvoices}, YC {seg.counts.requestedInvoices}
            </li>
          ))}
        </ul>

        <h4>Theo policy segment</h4>
        <ul className="admin-kpi-drill__list">
          {(row.model.policySegments || []).map((seg) => (
            <li key={`${seg.policyId}-${seg.servingBranchId}`}>
              <strong>{getBranchName(seg.servingBranchId) || seg.servingBranchId}</strong>
              {' · '}
              {seg.policyId} ({seg.source})
              {' · '}
              target {decimalToPercentInput(seg.targets?.addon)}/
              {decimalToPercentInput(seg.targets?.advanced)}/
              {decimalToPercentInput(seg.targets?.combo)}/
              {decimalToPercentInput(seg.targets?.requested)}
              {' · '}
              {formatDateVi(seg.effectiveFrom)} → {seg.effectiveTo ? formatDateVi(seg.effectiveTo) : '∞'}
            </li>
          ))}
        </ul>

        <h4>Hóa đơn / dịch vụ — {EMPLOYEE_KPI_CARD_DEFS.find((d) => d.key === kpiFocus)?.title}</h4>
        <div className="admin-kpi-drill__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>HĐ</th>
                <th>CN phục vụ</th>
                {kpiFocus === 'requested' ? <th>Khách yêu cầu</th> : (
                  <>
                    <th>DV chính</th>
                    <th>Focus</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {drillRows.map((r) => (
                <tr key={r.invoiceId}>
                  <td>{formatDateVi(r.date)}</td>
                  <td className="admin-kpi-mono">{String(r.invoiceId).slice(0, 8)}</td>
                  <td>{getBranchName(r.branchId) || r.branchId}</td>
                  {kpiFocus === 'requested' ? (
                    <td>{r.customerRequested ? 'Có' : 'Không'}</td>
                  ) : (
                    <>
                      <td>{r.mainLines.map((l) => l.name || l.token).join(', ') || '—'}</td>
                      <td>{r.focusLines.map((l) => l.name || l.token).join(', ') || '—'}</td>
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
