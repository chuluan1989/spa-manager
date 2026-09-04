/**
 * Export KPI chi tiết 1 NV — chỉ render từ engine model / cards.
 * Không tự tính rate / target / missing / status.
 */
import { downloadCsv, openPrintDocument } from './csvExport'
import loadExcelJS from './exceljsBridge'
import { getBranchName } from './branchStorage'
import {
  EMPLOYEE_KPI_CARD_DEFS,
  KPI_GROUP_LABELS,
  buildKpiServiceLineRows,
  filterKpiServiceLineRows,
  formatKpiPercent,
  formatTargetPercent,
} from './employeeKpiView'
import { KPI_GROUPS, KPI_STATUS } from '../constants/kpiPolicy'

function formatDateVi(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y) return '—'
  return `${d}/${m}/${y}`
}

function sanitizeFilePart(value) {
  return String(value || 'NV')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .replace(/^_+|_+$/g, '')
    || 'NV'
}

function monthFileLabel(monthYm) {
  const [y, m] = String(monthYm || '').split('-')
  if (!y || !m) return String(monthYm || 'thang')
  return `${m}-${y}`
}

export function buildEmployeeKpiDetailExportBundle(row, {
  monthYm = '',
  fromDate = '',
  toDate = '',
  rangeLabel = '',
} = {}) {
  const model = row?.model
  if (!model) throw new Error('Thiếu model KPI để xuất')

  const cards = EMPLOYEE_KPI_CARD_DEFS.map((def) => row.cards?.[def.key]).filter(Boolean)
  const serviceLines = buildKpiServiceLineRows(model.includedInvoices || [])
  const policySegments = (model.policySegments || []).map((seg) => ({
    servingBranchId: seg.servingBranchId,
    servingBranchName: getBranchName(seg.servingBranchId) || seg.servingBranchId,
    policyId: seg.policyId,
    source: seg.source,
    effectiveFrom: seg.effectiveFrom,
    effectiveTo: seg.effectiveTo,
    targets: seg.targets,
    counts: seg.counts,
    kpis: seg.kpis,
  }))

  const fileStem = `KPI_${sanitizeFilePart(row.employeeName)}_${monthFileLabel(monthYm)}`

  return {
    meta: {
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      homeBranchId: row.homeBranchId,
      homeBranchName: row.homeBranchName,
      servingBranchNames: row.servingBranchNames || [],
      fromDate: fromDate || model.fromDate,
      toDate: toDate || model.toDate,
      rangeLabel: rangeLabel || `${fromDate || model.fromDate} → ${toDate || model.toDate}`,
      monthYm,
      fileStem,
      scoreLabel: row.scoreLabel,
      statusLabel: row.rowStatusLabel,
    },
    counts: row.counts || model.overall?.counts || {},
    cards,
    policySegments,
    servingBranchSegments: model.servingBranchSegments || [],
    serviceLines,
    sheets: {
      overview: cards,
      allLines: serviceLines,
      main: filterKpiServiceLineRows(serviceLines, 'main'),
      addon: filterKpiServiceLineRows(serviceLines, 'addon'),
      combo: filterKpiServiceLineRows(serviceLines, 'combo'),
      advanced: filterKpiServiceLineRows(serviceLines, 'advanced'),
      requested: filterKpiServiceLineRows(serviceLines, 'requested'),
      duration90: filterKpiServiceLineRows(serviceLines, 'duration90'),
    },
    /** Snapshot parity — copy từ engine, không tính lại. */
    parity: {
      main: row.counts?.main ?? 0,
      addon: row.counts?.addon ?? 0,
      advanced: row.counts?.advanced ?? 0,
      combo: row.counts?.combo ?? 0,
      duration90: row.counts?.duration90 ?? 0,
      totalInvoices: row.counts?.totalInvoices ?? 0,
      requestedInvoices: row.counts?.requestedInvoices ?? 0,
      rates: Object.fromEntries(cards.map((c) => [c.key, c.rate])),
      targets: Object.fromEntries(cards.map((c) => [c.key, c.target])),
      missing: Object.fromEntries(cards.map((c) => [c.key, c.missing])),
      status: Object.fromEntries(cards.map((c) => [c.key, c.status])),
      segmentCount: policySegments.length,
    },
  }
}

function overviewMatrix(bundle) {
  return [
    ['KPI', 'Thực tế', 'Tỷ lệ', 'Mục tiêu', 'Còn thiếu', 'Kết quả'],
    ...bundle.cards.map((c) => [
      c.title,
      `${c.actual} / ${c.denominator}`,
      c.rateLabel,
      c.targetLabel,
      c.missing == null ? (c.status === KPI_STATUS.NO_POLICY ? '—' : '—') : String(c.missing),
      c.statusLabel,
    ]),
  ]
}

function linesMatrix(rows) {
  return [
    ['Ngày', 'Mã HĐ', 'Chi nhánh phục vụ', 'Dịch vụ', 'Nhóm KPI', 'Khách yêu cầu'],
    ...rows.map((r) => [
      formatDateVi(r.date),
      r.invoiceId,
      getBranchName(r.branchId) || r.branchId,
      r.serviceName,
      r.groupLabel || KPI_GROUP_LABELS[r.group] || r.group,
      r.customerRequested ? 'Có' : 'Không',
    ]),
  ]
}

function policyMatrix(bundle) {
  const rows = [['Chi nhánh phục vụ', 'Policy', 'Nguồn', 'Hiệu lực', 'Target DV phụ/CS/Combo/YC/90', 'MAIN', 'ADDON', 'ADV', 'COMBO', '90\'', 'HĐ', 'YC']]
  for (const seg of bundle.policySegments) {
    const t = seg.targets
    const targetLabel = t
      ? `${formatTargetPercent(t.addon)} / ${formatTargetPercent(t.advanced)} / ${formatTargetPercent(t.combo)} / ${formatTargetPercent(t.requested)}${t.duration90 != null ? ` / ${formatTargetPercent(t.duration90)}` : ''}`
      : 'Chưa có chính sách KPI kỳ này'
    rows.push([
      seg.servingBranchName,
      seg.policyId || '—',
      seg.source || '—',
      `${formatDateVi(seg.effectiveFrom)} → ${seg.effectiveTo ? formatDateVi(seg.effectiveTo) : '∞'}`,
      targetLabel,
      seg.counts?.main ?? 0,
      seg.counts?.addon ?? 0,
      seg.counts?.advanced ?? 0,
      seg.counts?.combo ?? 0,
      seg.counts?.duration90 ?? 0,
      seg.counts?.totalInvoices ?? 0,
      seg.counts?.requestedInvoices ?? 0,
    ])
  }
  return rows
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportEmployeeKpiDetailExcel(bundle) {
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Khoẻ Spa Manager'
  wb.created = new Date()

  const meta = bundle.meta
  const overview = wb.addWorksheet('Tong quan KPI')
  overview.addRows([
    ['NHÂN VIÊN', meta.employeeName],
    ['Chi nhánh nhà', meta.homeBranchName],
    ['Thời gian', meta.rangeLabel],
    ['Chi nhánh phục vụ', (meta.servingBranchNames || []).join(', ') || '—'],
    ['Trạng thái', meta.statusLabel],
    ['Đạt', meta.scoreLabel],
    [],
    ['Tổng MAIN', bundle.counts.main],
    ['Tổng ADDON', bundle.counts.addon],
    ['Tổng ADVANCED', bundle.counts.advanced],
    ['Tổng COMBO', bundle.counts.combo],
    ['Tổng 90 phút', bundle.counts.duration90 || 0],
    ['Tổng HĐ', bundle.counts.totalInvoices],
    ['Khách yêu cầu', bundle.counts.requestedInvoices],
    [],
    ...overviewMatrix(bundle),
    [],
    ['Chính sách KPI áp dụng (theo segment)'],
    ...policyMatrix(bundle),
  ])
  overview.getRow(1).font = { bold: true }

  const addSheet = (name, matrix) => {
    const sh = wb.addWorksheet(name)
    sh.addRows(matrix)
    sh.getRow(1).font = { bold: true }
  }

  addSheet('Chi tiet HD', linesMatrix(bundle.sheets.allLines))
  addSheet('DV chinh', linesMatrix(bundle.sheets.main))
  addSheet('DV phu', linesMatrix(bundle.sheets.addon))
  addSheet('Combo', linesMatrix(bundle.sheets.combo))
  addSheet('Chuyen sau', linesMatrix(bundle.sheets.advanced))
  addSheet('90 phut', linesMatrix(bundle.sheets.duration90))
  addSheet('Khach yeu cau', linesMatrix(bundle.sheets.requested))

  const buffer = await wb.xlsx.writeBuffer()
  downloadBlob(
    `${meta.fileStem}.xlsx`,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
  return { ok: true, format: 'xlsx', fileStem: meta.fileStem, parity: bundle.parity }
}

export function exportEmployeeKpiDetailPdf(bundle) {
  const meta = bundle.meta
  const cardRows = bundle.cards.map((c) => `
    <tr>
      <td>${c.title}</td>
      <td>${c.actual} / ${c.denominator}</td>
      <td>${c.rateLabel}</td>
      <td>${c.targetLabel}</td>
      <td>${c.missing == null ? '—' : c.missing}</td>
      <td>${c.statusLabel}</td>
    </tr>`).join('')

  const policyRows = bundle.policySegments.map((seg) => {
    const t = seg.targets
    const targetLabel = t
      ? `${Math.round(t.addon * 100)}% / ${Math.round(t.advanced * 100)}% / ${Math.round(t.combo * 100)}% / ${Math.round(t.requested * 100)}%${t.duration90 != null ? ` / ${Math.round(t.duration90 * 100)}%` : ''}`
      : 'Chưa có chính sách KPI kỳ này'
    return `<tr>
      <td>${seg.servingBranchName}</td>
      <td>${targetLabel}</td>
      <td>${formatDateVi(seg.effectiveFrom)} → ${seg.effectiveTo ? formatDateVi(seg.effectiveTo) : '∞'}</td>
      <td>${seg.source || '—'}</td>
    </tr>`
  }).join('')

  const lineRows = bundle.sheets.allLines.map((r) => `
    <tr>
      <td>${formatDateVi(r.date)}</td>
      <td>${r.invoiceId}</td>
      <td>${getBranchName(r.branchId) || r.branchId}</td>
      <td>${r.serviceName}</td>
      <td>${r.groupLabel}</td>
      <td>${r.customerRequested ? 'Có' : 'Không'}</td>
    </tr>`).join('')

  const html = `
    <h1>KPI nhân viên</h1>
    <p><strong>NHÂN VIÊN:</strong> ${meta.employeeName}</p>
    <p><strong>Chi nhánh nhà:</strong> ${meta.homeBranchName}</p>
    <p><strong>Thời gian:</strong> ${meta.rangeLabel}</p>
    <p><strong>Chi nhánh phục vụ:</strong> ${(meta.servingBranchNames || []).join(', ') || '—'}</p>
    <p><strong>Trạng thái:</strong> ${meta.statusLabel} · ${meta.scoreLabel}</p>
    <h2>Tổng quan KPI</h2>
    <p>MAIN ${bundle.counts.main} · ADDON ${bundle.counts.addon} · ADV ${bundle.counts.advanced} · COMBO ${bundle.counts.combo} · 90' ${bundle.counts.duration90 || 0} · HĐ ${bundle.counts.totalInvoices} · YC ${bundle.counts.requestedInvoices}</p>
    <table>
      <thead><tr><th>KPI</th><th>Thực tế</th><th>Tỷ lệ</th><th>Mục tiêu</th><th>Còn thiếu</th><th>Kết quả</th></tr></thead>
      <tbody>${cardRows}</tbody>
    </table>
    <h2>Chính sách KPI áp dụng</h2>
    <table>
      <thead><tr><th>CN phục vụ</th><th>Target</th><th>Hiệu lực</th><th>Nguồn</th></tr></thead>
      <tbody>${policyRows || '<tr><td colspan="4">Không có segment</td></tr>'}</tbody>
    </table>
    <h2>Chi tiết theo ngày</h2>
    <table>
      <thead><tr><th>Ngày</th><th>Mã HĐ</th><th>CN phục vụ</th><th>Dịch vụ</th><th>Nhóm KPI</th><th>Khách YC</th></tr></thead>
      <tbody>${lineRows || '<tr><td colspan="6">Không có dòng dịch vụ</td></tr>'}</tbody>
    </table>
  `
  openPrintDocument(meta.fileStem, html)
  return { ok: true, format: 'pdf', fileStem: meta.fileStem, parity: bundle.parity }
}

/** CSV nhanh từ cùng bundle (tuỳ chọn). */
export function exportEmployeeKpiDetailCsv(bundle) {
  downloadCsv(bundle.meta.fileStem, linesMatrix(bundle.sheets.allLines))
}

export { formatKpiPercent, KPI_GROUPS }
