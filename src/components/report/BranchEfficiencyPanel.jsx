import { useMemo, useState } from 'react'
import {
  canExportReport,
  canSelectBranch,
  isAdmin,
} from '../../constants/auth'
import { loadBranches } from '../../constants/branches'
import { formatCurrency } from '../../utils/invoice'
import {
  PAY_CYCLE_OPTIONS,
} from '../../utils/salaryReport'
import {
  buildDefaultBranchEfficiencyFilters,
  resolveEfficiencyRange,
  useBranchEfficiencyPnlData,
} from '../../hooks/useBranchEfficiencyPnlData'
import { UNKNOWN_BRANCH_ID } from '../../utils/managementReports/branchEfficiencyPnl'
import {
  BRANCH_EFFICIENCY_DRILL_TYPES,
  buildEfficiencyDrillModel,
  mergeEfficiencyDetails,
} from '../../utils/managementReports/branchEfficiencyDrillDown'
import {
  BRANCH_EFFICIENCY_SORT_OPTIONS,
  DEFAULT_BRANCH_EFFICIENCY_SORT,
  rankBranchEfficiencyRows,
  resolveMarginTone,
  resolveProfitTone,
} from '../../utils/managementReports/branchEfficiencyRanking'
import {
  buildBranchEfficiencyExportBundle,
  exportBranchEfficiencyCsv,
  exportBranchEfficiencyExcel,
  exportBranchEfficiencyPdf,
} from '../../utils/managementReports/branchEfficiencyExport'
import BranchEfficiencyDrillModal from './BranchEfficiencyDrillModal'
import './BranchEfficiencyPanel.css'

function formatMoney(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return formatCurrency(Number(value))
}

function formatMargin(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const n = Number(value)
  return `${n.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`
}

function DrillMoneyCell({ value, emphasizeNegative = false, onOpen, label, tone }) {
  const n = Number(value) || 0
  const loss = emphasizeNegative && n < 0
  const toneClass = tone === 'loss-strong'
    ? ' is-loss-strong'
    : loss
      ? ' is-loss'
      : ''
  if (!onOpen) {
    return (
      <td className={`bep-num${toneClass}`}>
        {formatMoney(n)}
      </td>
    )
  }
  return (
    <td className={`bep-num${toneClass}`}>
      <button
        type="button"
        className={`bep-drill-link${toneClass}`}
        onClick={onOpen}
        title={`Xem chi tiết ${label || ''}`.trim()}
      >
        {formatMoney(n)}
      </button>
    </td>
  )
}

export default function BranchEfficiencyPanel() {
  const [filters, setFilters] = useState(() => buildDefaultBranchEfficiencyFilters({
    rangeMode: 'cycle',
  }))
  const [sortKey, setSortKey] = useState(DEFAULT_BRANCH_EFFICIENCY_SORT)
  const [drill, setDrill] = useState(null)
  const [exporting, setExporting] = useState('')
  const [exportError, setExportError] = useState('')

  const branches = useMemo(() => loadBranches().filter((b) => b?.id), [])
  const data = useBranchEfficiencyPnlData(filters)

  const invoiceById = useMemo(() => {
    const map = new Map()
    for (const inv of data.invoices || []) {
      if (inv?.id) map.set(inv.id, inv)
    }
    return map
  }, [data.invoices])

  const adjustmentById = useMemo(() => {
    const map = new Map()
    for (const row of data.adjustments || []) {
      if (row?.id) map.set(row.id, row)
    }
    return map
  }, [data.adjustments])

  const rankedRows = useMemo(
    () => rankBranchEfficiencyRows(data.rows ?? [], sortKey, 'desc'),
    [data.rows, sortKey],
  )

  const applyRange = (next) => {
    const mode = next.rangeMode ?? filters.rangeMode ?? 'cycle'
    if (mode === 'custom') {
      setFilters({ ...next, rangeMode: 'custom' })
      return
    }
    const range = resolveEfficiencyRange({
      month: next.month,
      cycle: next.cycle,
      mode: 'cycle',
    })
    setFilters({
      ...next,
      rangeMode: 'cycle',
      fromDate: range.fromDate,
      toDate: range.toDate,
    })
  }

  const updateMonth = (month) => {
    applyRange({ ...filters, month, rangeMode: 'cycle' })
  }

  const updateCycle = (cycle) => {
    applyRange({ ...filters, cycle, rangeMode: 'cycle' })
  }

  const updateFromDate = (fromDate) => {
    setFilters((prev) => ({ ...prev, fromDate, rangeMode: 'custom' }))
  }

  const updateToDate = (toDate) => {
    setFilters((prev) => ({ ...prev, toDate, rangeMode: 'custom' }))
  }

  const updateBranch = (branchId) => {
    setFilters((prev) => ({ ...prev, branchId }))
  }

  const resetToCycle = () => {
    applyRange({ ...filters, rangeMode: 'cycle' })
  }

  const rows = rankedRows
  const total = data.systemTotal
  const showAllBranches = !filters.branchId && isAdmin()
  const periodLabel = `${filters.fromDate || '—'} → ${filters.toDate || '—'}`

  const openDrill = (type, row, { isSystemTotal = false } = {}) => {
    if (!row) return
    const details = isSystemTotal
      ? mergeEfficiencyDetails(rows)
      : row.details
    const model = buildEfficiencyDrillModel({
      type,
      row,
      details,
      invoiceById,
      adjustmentById,
      isUnknownBranch: Boolean(row.isUnknown),
    })
    setDrill({
      type,
      model,
      branchName: isSystemTotal
        ? (row.branchName || 'Tổng hệ thống')
        : row.branchName,
    })
  }

  const closeDrill = () => {
    setDrill(null)
  }

  const buildExportBundle = () => buildBranchEfficiencyExportBundle({
    rows,
    systemTotal: total,
    filters,
    invoices: data.invoices,
    adjustments: data.adjustments,
    sortKey,
    warnings: data.warnings?.items || [],
  })

  const runExport = async (format) => {
    if (!canExportReport() || !total) return
    setExportError('')
    setExporting(format)
    try {
      const bundle = buildExportBundle()
      if (format === 'csv') exportBranchEfficiencyCsv(bundle)
      else if (format === 'pdf') exportBranchEfficiencyPdf(bundle)
      else if (format === 'xlsx') await exportBranchEfficiencyExcel(bundle)
    } catch (err) {
      setExportError(err?.message || 'Xuất báo cáo thất bại.')
    } finally {
      setExporting('')
    }
  }

  return (
    <div className="bep-panel">
      <header className="bep-panel__header">
        <div>
          <h2>Hiệu quả chi nhánh</h2>
          <p>
            {data.formula || 'Lợi nhuận = Doanh thu dịch vụ − Chi phí vận hành − % hóa đơn thực trả − Thưởng + Phạt nhân viên'}
          </p>
          <p className="bep-panel__period">
            Kỳ:
            {' '}
            <strong>{filters.fromDate || '—'}</strong>
            {' → '}
            <strong>{filters.toDate || '—'}</strong>
            {filters.rangeMode === 'custom' ? ' (khoảng ngày tùy chọn)' : ''}
          </p>
        </div>
        <div className="bep-panel__actions">
          <button type="button" className="bep-btn" onClick={data.reload} disabled={data.loading}>
            {data.loading ? 'Đang tải…' : 'Làm mới'}
          </button>
          {canExportReport() && (
            <>
              <button type="button" className="bep-btn" disabled={!!exporting || data.loading || !total} onClick={() => runExport('csv')}>
                {exporting === 'csv' ? 'CSV…' : 'CSV'}
              </button>
              <button type="button" className="bep-btn" disabled={!!exporting || data.loading || !total} onClick={() => runExport('xlsx')}>
                {exporting === 'xlsx' ? 'Excel…' : 'Excel'}
              </button>
              <button type="button" className="bep-btn bep-btn--primary" disabled={!!exporting || data.loading || !total} onClick={() => runExport('pdf')}>
                {exporting === 'pdf' ? 'PDF…' : 'PDF'}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="bep-filters">
        <label>
          Tháng
          <input
            type="month"
            value={filters.month}
            onChange={(e) => updateMonth(e.target.value)}
          />
        </label>
        <label>
          Kỳ lương
          <select
            value={filters.cycle}
            onChange={(e) => updateCycle(e.target.value)}
          >
            {PAY_CYCLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Từ ngày
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => updateFromDate(e.target.value)}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => updateToDate(e.target.value)}
          />
        </label>
        {filters.rangeMode === 'custom' && (
          <button type="button" className="bep-btn" onClick={resetToCycle}>
            Theo kỳ lương
          </button>
        )}
        {canSelectBranch() && (
          <label>
            Chi nhánh
            <select
              value={filters.branchId}
              onChange={(e) => updateBranch(e.target.value)}
            >
              <option value="">Tất cả</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
              {isAdmin() && (
                <option value={UNKNOWN_BRANCH_ID}>Chưa xác định chi nhánh</option>
              )}
            </select>
          </label>
        )}
        <label>
          Xếp hạng theo
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
          >
            {BRANCH_EFFICIENCY_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      {data.error && <p className="bep-error" role="alert">{data.error}</p>}
      {exportError && <p className="bep-error" role="alert">{exportError}</p>}

      {data.warnings?.hasWarnings && (
        <div className="bep-alerts" role="status">
          <strong>Cảnh báo dữ liệu</strong>
          <ul>
            {data.warnings.items.map((item) => (
              <li key={item.id}>
                <span className="bep-alerts__title">{item.title}</span>
                {' — '}
                {item.detail}
              </li>
            ))}
          </ul>
          <p className="bep-alerts__note">Chỉ cảnh báo — không chặn báo cáo.</p>
        </div>
      )}

      <div className="bep-note">
        Không gồm tips trong doanh thu · Không gồm lương cơ bản · Không tính trùng mặt bằng / ứng lương.
        {' '}
        Biên LN: ≥30% xanh · 20–30% vàng · &lt;20% đỏ · LN âm đỏ đậm.
        {' '}
        Bấm số tiền để xem chi tiết.
      </div>

      <div className="bep-kpi-legend" aria-hidden="true">
        <span className="bep-kpi is-good">≥30%</span>
        <span className="bep-kpi is-warn">20–30%</span>
        <span className="bep-kpi is-bad">&lt;20%</span>
        <span className="bep-kpi is-loss-strong">LN âm</span>
      </div>

      <div className="bep-table-wrap">
        <table className="bep-table">
          <thead>
            <tr>
              <th className="is-num">#</th>
              <th>Chi nhánh</th>
              <th className="is-num">Doanh thu</th>
              <th className="is-num">Chi phí vận hành</th>
              <th className="is-num">% hóa đơn</th>
              <th className="is-num">Thưởng</th>
              <th className="is-num">Phạt</th>
              <th className="is-num">Lợi nhuận</th>
              <th className="is-num">Biên lợi nhuận</th>
            </tr>
          </thead>
          <tbody>
            {data.loading && (
              <tr>
                <td colSpan={9} className="bep-muted">Đang tải dữ liệu…</td>
              </tr>
            )}
            {!data.loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="bep-muted">Không có dữ liệu trong kỳ đã chọn.</td>
              </tr>
            )}
            {!data.loading && rows.map((row) => {
              const marginTone = resolveMarginTone(row.marginPercent)
              const profitTone = resolveProfitTone(row.profit)
              return (
                <tr
                  key={row.branchId}
                  className={row.isUnknown ? 'is-unknown' : ''}
                >
                  <td className="bep-num bep-rank">{row.rank ?? '—'}</td>
                  <td>
                    {row.branchName}
                    {row.isUnknown ? <span className="bep-badge">Thiếu CN</span> : null}
                  </td>
                  <DrillMoneyCell
                    value={row.revenue}
                    label="doanh thu"
                    onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE, row)}
                  />
                  <DrillMoneyCell
                    value={row.operatingCost}
                    label="chi phí vận hành"
                    onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.OPEX, row)}
                  />
                  <DrillMoneyCell
                    value={row.invoiceCommission}
                    label="% hóa đơn"
                    onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.COMMISSION, row)}
                  />
                  <DrillMoneyCell
                    value={row.bonus}
                    label="thưởng"
                    onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.BONUS, row)}
                  />
                  <DrillMoneyCell
                    value={row.penalty}
                    label="phạt"
                    onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.PENALTY, row)}
                  />
                  <DrillMoneyCell
                    value={row.profit}
                    emphasizeNegative
                    tone={profitTone}
                    label="lợi nhuận"
                    onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.PROFIT, row)}
                  />
                  <td className={`bep-num bep-margin is-${marginTone}${profitTone === 'loss-strong' ? ' is-loss-strong' : ''}`}>
                    {formatMargin(row.marginPercent)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {total && showAllBranches && rows.length > 0 && (
            <tfoot>
              <tr className="is-total">
                <td className="bep-num">—</td>
                <td>{total.branchName || 'Tổng hệ thống'}</td>
                <DrillMoneyCell
                  value={total.revenue}
                  label="doanh thu"
                  onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE, total, { isSystemTotal: true })}
                />
                <DrillMoneyCell
                  value={total.operatingCost}
                  label="chi phí vận hành"
                  onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.OPEX, total, { isSystemTotal: true })}
                />
                <DrillMoneyCell
                  value={total.invoiceCommission}
                  label="% hóa đơn"
                  onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.COMMISSION, total, { isSystemTotal: true })}
                />
                <DrillMoneyCell
                  value={total.bonus}
                  label="thưởng"
                  onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.BONUS, total, { isSystemTotal: true })}
                />
                <DrillMoneyCell
                  value={total.penalty}
                  label="phạt"
                  onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.PENALTY, total, { isSystemTotal: true })}
                />
                <DrillMoneyCell
                  value={total.profit}
                  emphasizeNegative
                  tone={resolveProfitTone(total.profit)}
                  label="lợi nhuận"
                  onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.PROFIT, total, { isSystemTotal: true })}
                />
                <td className={`bep-num bep-margin is-${resolveMarginTone(total.marginPercent)}`}>
                  {formatMargin(total.marginPercent)}
                </td>
              </tr>
            </tfoot>
          )}
          {total && !showAllBranches && rows.length > 0 && (
            <tfoot>
              <tr className="is-total">
                <td className="bep-num">—</td>
                <td>Tổng (đã lọc)</td>
                <DrillMoneyCell value={total.revenue} label="doanh thu" onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE, total)} />
                <DrillMoneyCell value={total.operatingCost} label="chi phí" onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.OPEX, total)} />
                <DrillMoneyCell value={total.invoiceCommission} label="% HĐ" onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.COMMISSION, total)} />
                <DrillMoneyCell value={total.bonus} label="thưởng" onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.BONUS, total)} />
                <DrillMoneyCell value={total.penalty} label="phạt" onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.PENALTY, total)} />
                <DrillMoneyCell value={total.profit} emphasizeNegative tone={resolveProfitTone(total.profit)} label="LN" onOpen={() => openDrill(BRANCH_EFFICIENCY_DRILL_TYPES.PROFIT, total)} />
                <td className={`bep-num bep-margin is-${resolveMarginTone(total.marginPercent)}`}>
                  {formatMargin(total.marginPercent)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <BranchEfficiencyDrillModal
        open={Boolean(drill)}
        onClose={closeDrill}
        model={drill?.model}
        branchName={drill?.branchName}
        periodLabel={periodLabel}
      />
    </div>
  )
}
