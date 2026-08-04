/**
 * Export CSV / Excel / PDF — Hiệu quả chi nhánh (B4).
 * Gồm: tổng hệ thống, từng CN, drill-down.
 */
import { formatCurrency } from '../invoice'
import { downloadCsv, openPrintDocument } from '../csvExport'
import loadExcelJS from '../exceljsBridge.js'
import {
  BRANCH_EFFICIENCY_DRILL_TYPES,
  buildEfficiencyDrillModel,
  mergeEfficiencyDetails,
} from './branchEfficiencyDrillDown'

function money(n) {
  return Math.round(Number(n) || 0)
}

function periodSuffix(filters = {}) {
  return `${filters.fromDate || 'from'}_${filters.toDate || 'to'}`
}

function buildLookups(invoices = [], adjustments = []) {
  const invoiceById = new Map()
  for (const inv of invoices) {
    if (inv?.id) invoiceById.set(inv.id, inv)
  }
  const adjustmentById = new Map()
  for (const row of adjustments) {
    if (row?.id) adjustmentById.set(row.id, row)
  }
  return { invoiceById, adjustmentById }
}

function drillForRow(type, row, details, lookups) {
  return buildEfficiencyDrillModel({
    type,
    row,
    details: details || row?.details,
    invoiceById: lookups.invoiceById,
    adjustmentById: lookups.adjustmentById,
    isUnknownBranch: Boolean(row?.isUnknown),
  })
}

/** Chuẩn bị payload export dùng chung CSV/Excel/PDF. */
export function buildBranchEfficiencyExportBundle({
  rows = [],
  systemTotal = null,
  filters = {},
  invoices = [],
  adjustments = [],
  sortKey = 'profit',
  warnings = [],
} = {}) {
  const lookups = buildLookups(invoices, adjustments)
  const merged = mergeEfficiencyDetails(rows)
  const totalRow = systemTotal || null

  const summaryRows = rows.map((row, index) => ({
    rank: row.rank ?? (row.isUnknown ? '' : index + 1),
    branchName: row.branchName,
    branchId: row.branchId,
    isUnknown: Boolean(row.isUnknown),
    revenue: money(row.revenue),
    operatingCost: money(row.operatingCost),
    invoiceCommission: money(row.invoiceCommission),
    bonus: money(row.bonus),
    penalty: money(row.penalty),
    profit: money(row.profit),
    marginPercent: Number(row.marginPercent) || 0,
  }))

  const totalSummary = totalRow
    ? {
      rank: '',
      branchName: totalRow.branchName || 'Tổng hệ thống',
      branchId: totalRow.branchId || '__system__',
      isUnknown: false,
      revenue: money(totalRow.revenue),
      operatingCost: money(totalRow.operatingCost),
      invoiceCommission: money(totalRow.invoiceCommission),
      bonus: money(totalRow.bonus),
      penalty: money(totalRow.penalty),
      profit: money(totalRow.profit),
      marginPercent: Number(totalRow.marginPercent) || 0,
    }
    : null

  const drills = {
    revenue: drillForRow(BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE, totalRow || { revenue: 0 }, merged, lookups),
    opex: drillForRow(BRANCH_EFFICIENCY_DRILL_TYPES.OPEX, totalRow || { operatingCost: 0 }, merged, lookups),
    commission: drillForRow(BRANCH_EFFICIENCY_DRILL_TYPES.COMMISSION, totalRow || { invoiceCommission: 0 }, merged, lookups),
    bonus: drillForRow(BRANCH_EFFICIENCY_DRILL_TYPES.BONUS, totalRow || { bonus: 0 }, merged, lookups),
    penalty: drillForRow(BRANCH_EFFICIENCY_DRILL_TYPES.PENALTY, totalRow || { penalty: 0 }, merged, lookups),
  }

  // Drill theo từng CN
  const perBranch = rows.map((row) => ({
    branchName: row.branchName,
    branchId: row.branchId,
    revenue: drillForRow(BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE, row, row.details, lookups),
    opex: drillForRow(BRANCH_EFFICIENCY_DRILL_TYPES.OPEX, row, row.details, lookups),
    commission: drillForRow(BRANCH_EFFICIENCY_DRILL_TYPES.COMMISSION, row, row.details, lookups),
    bonus: drillForRow(BRANCH_EFFICIENCY_DRILL_TYPES.BONUS, row, row.details, lookups),
    penalty: drillForRow(BRANCH_EFFICIENCY_DRILL_TYPES.PENALTY, row, row.details, lookups),
    profit: drillForRow(BRANCH_EFFICIENCY_DRILL_TYPES.PROFIT, row, row.details, lookups),
  }))

  return {
    filters,
    sortKey,
    warnings,
    summaryRows,
    totalSummary,
    drills,
    perBranch,
    periodLabel: `${filters.fromDate || '—'} → ${filters.toDate || '—'}`,
  }
}

export function exportBranchEfficiencyCsv(bundle) {
  const rows = []
  rows.push(['BÁO CÁO HIỆU QUẢ CHI NHÁNH'])
  rows.push(['Kỳ', bundle.periodLabel])
  rows.push(['Xếp hạng theo', bundle.sortKey])
  rows.push([])
  rows.push(['=== TỔNG HỢP ==='])
  rows.push([
    'Hạng', 'Chi nhánh', 'Doanh thu', 'Chi phí vận hành', '% hóa đơn',
    'Thưởng', 'Phạt', 'Lợi nhuận', 'Biên lợi nhuận (%)',
  ])
  for (const row of bundle.summaryRows) {
    rows.push([
      row.rank, row.branchName, row.revenue, row.operatingCost, row.invoiceCommission,
      row.bonus, row.penalty, row.profit, row.marginPercent,
    ])
  }
  if (bundle.totalSummary) {
    const t = bundle.totalSummary
    rows.push([
      'TỔNG', t.branchName, t.revenue, t.operatingCost, t.invoiceCommission,
      t.bonus, t.penalty, t.profit, t.marginPercent,
    ])
  }

  rows.push([])
  rows.push(['=== DRILL DOANH THU ==='])
  rows.push(['Ngày', 'Mã HĐ', 'Nhân viên', 'CN phục vụ', 'Dịch vụ', 'Doanh thu', 'PTTT'])
  for (const line of bundle.drills.revenue.lines || []) {
    rows.push([
      line.date, line.invoiceId, line.employeeName, line.servingBranchName,
      line.services, line.revenue, line.paymentMethodLabel,
    ])
  }
  rows.push(['Tổng', '', '', '', '', bundle.drills.revenue.total, ''])

  rows.push([])
  rows.push(['=== DRILL CHI PHÍ VẬN HÀNH ==='])
  rows.push(['Ngày', 'Nhóm', 'Nội dung', 'Số tiền', 'Chi nhánh', 'Người nhập', 'Nguồn'])
  for (const line of bundle.drills.opex.lines || []) {
    rows.push([
      line.date, line.expenseTypeLabel, line.content, line.amount,
      line.branchName, line.enteredBy, line.sourceLabel,
    ])
  }
  rows.push(['Tổng', '', '', bundle.drills.opex.total, '', '', ''])

  rows.push([])
  rows.push(['=== DRILL % HÓA ĐƠN ==='])
  rows.push(['Ngày', 'Mã HĐ', 'NV', 'Vai trò', 'CN', 'DT dịch vụ', '% snapshot', 'Tỷ lệ', 'Thực trả'])
  for (const line of bundle.drills.commission.lines || []) {
    rows.push([
      line.date, line.invoiceId, line.employeeName, line.roleLabel, line.servingBranchName,
      line.invoiceRevenue, line.snapshotCommission, line.rateLabel, line.amountPaid,
    ])
  }
  rows.push(['Tổng', '', '', '', '', '', '', '', bundle.drills.commission.total])

  rows.push([])
  rows.push(['=== DRILL THƯỞNG ==='])
  rows.push(['Ngày', 'NV', 'CN', 'Số tiền', 'Lý do', 'Người tạo'])
  for (const line of bundle.drills.bonus.lines || []) {
    rows.push([line.date, line.employeeName, line.branchName, line.amount, line.reason, line.createdBy])
  }
  rows.push(['Tổng', '', '', bundle.drills.bonus.total, '', ''])

  rows.push([])
  rows.push(['=== DRILL PHẠT ==='])
  rows.push(['Ngày', 'NV', 'CN', 'Số tiền', 'Nguồn', 'Lý do', 'Cảnh báo'])
  for (const line of bundle.drills.penalty.lines || []) {
    rows.push([
      line.date, line.employeeName, line.branchName, line.amount,
      line.sourceLabel, line.reason, line.duplicateSuspect ? 'Nghi trùng phạt' : '',
    ])
  }
  rows.push(['Tổng', '', '', bundle.drills.penalty.total, '', '', ''])

  if (bundle.warnings?.length) {
    rows.push([])
    rows.push(['=== CẢNH BÁO ==='])
    for (const w of bundle.warnings) {
      rows.push([w.title, w.detail, w.count])
    }
  }

  downloadCsv(`hieu-qua-chi-nhanh-${periodSuffix(bundle.filters)}.csv`, rows)
  return { ok: true, format: 'csv', rowCount: rows.length }
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function exportBranchEfficiencyExcel(bundle) {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Khoẻ Spa Manager'
  workbook.created = new Date()

  const summary = workbook.addWorksheet('Tong hop')
  summary.addRow(['BÁO CÁO HIỆU QUẢ CHI NHÁNH'])
  summary.addRow(['Kỳ', bundle.periodLabel])
  summary.addRow(['Xếp hạng theo', bundle.sortKey])
  summary.addRow([])
  summary.addRow([
    'Hạng', 'Chi nhánh', 'Doanh thu', 'Chi phí vận hành', '% hóa đơn',
    'Thưởng', 'Phạt', 'Lợi nhuận', 'Biên LN (%)',
  ])
  for (const row of bundle.summaryRows) {
    summary.addRow([
      row.rank, row.branchName, row.revenue, row.operatingCost, row.invoiceCommission,
      row.bonus, row.penalty, row.profit, row.marginPercent,
    ])
  }
  if (bundle.totalSummary) {
    const t = bundle.totalSummary
    summary.addRow([
      'TỔNG', t.branchName, t.revenue, t.operatingCost, t.invoiceCommission,
      t.bonus, t.penalty, t.profit, t.marginPercent,
    ])
  }

  const addDrillSheet = (name, headers, lines, totalValue, totalColIndex) => {
    const sheet = workbook.addWorksheet(name)
    sheet.addRow(headers)
    for (const line of lines || []) {
      sheet.addRow(line)
    }
    const totalRow = headers.map(() => '')
    totalRow[0] = 'Tổng'
    totalRow[totalColIndex] = totalValue
    sheet.addRow(totalRow)
  }

  addDrillSheet(
    'Doanh thu',
    ['Ngày', 'Mã HĐ', 'NV', 'CN phục vụ', 'Dịch vụ', 'Doanh thu', 'PTTT'],
    (bundle.drills.revenue.lines || []).map((l) => [
      l.date, l.invoiceId, l.employeeName, l.servingBranchName, l.services, l.revenue, l.paymentMethodLabel,
    ]),
    bundle.drills.revenue.total,
    5,
  )

  addDrillSheet(
    'Chi phi',
    ['Ngày', 'Nhóm', 'Nội dung', 'Số tiền', 'CN', 'Người nhập', 'Nguồn'],
    (bundle.drills.opex.lines || []).map((l) => [
      l.date, l.expenseTypeLabel, l.content, l.amount, l.branchName, l.enteredBy, l.sourceLabel,
    ]),
    bundle.drills.opex.total,
    3,
  )

  addDrillSheet(
    'Phan tram HD',
    ['Ngày', 'Mã HĐ', 'NV', 'Vai trò', 'CN', 'DT', '% snapshot', 'Tỷ lệ', 'Thực trả'],
    (bundle.drills.commission.lines || []).map((l) => [
      l.date, l.invoiceId, l.employeeName, l.roleLabel, l.servingBranchName,
      l.invoiceRevenue, l.snapshotCommission, l.rateLabel, l.amountPaid,
    ]),
    bundle.drills.commission.total,
    8,
  )

  addDrillSheet(
    'Thuong',
    ['Ngày', 'NV', 'CN', 'Số tiền', 'Lý do', 'Người tạo'],
    (bundle.drills.bonus.lines || []).map((l) => [
      l.date, l.employeeName, l.branchName, l.amount, l.reason, l.createdBy,
    ]),
    bundle.drills.bonus.total,
    3,
  )

  addDrillSheet(
    'Phat',
    ['Ngày', 'NV', 'CN', 'Số tiền', 'Nguồn', 'Lý do', 'Cảnh báo'],
    (bundle.drills.penalty.lines || []).map((l) => [
      l.date, l.employeeName, l.branchName, l.amount, l.sourceLabel, l.reason,
      l.duplicateSuspect ? 'Nghi trùng phạt' : '',
    ]),
    bundle.drills.penalty.total,
    3,
  )

  if (bundle.perBranch?.length) {
    const sheet = workbook.addWorksheet('Theo CN')
    sheet.addRow(['Chi nhánh', 'Loại drill', 'Tổng'])
    for (const b of bundle.perBranch) {
      sheet.addRow([b.branchName, 'Doanh thu', b.revenue.total])
      sheet.addRow([b.branchName, 'Chi phí', b.opex.total])
      sheet.addRow([b.branchName, '% HĐ', b.commission.total])
      sheet.addRow([b.branchName, 'Thưởng', b.bonus.total])
      sheet.addRow([b.branchName, 'Phạt', b.penalty.total])
      sheet.addRow([b.branchName, 'Lợi nhuận', b.profit.profit])
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(
    `hieu-qua-chi-nhanh-${periodSuffix(bundle.filters)}.xlsx`,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
  return { ok: true, format: 'xlsx', sheets: workbook.worksheets.length }
}

function tableHtml(headers, bodyRows, totalCells) {
  const head = headers.map((h) => `<th>${h}</th>`).join('')
  const body = bodyRows.map((cells) => `<tr>${cells.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')
  const foot = totalCells
    ? `<tfoot><tr>${totalCells.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr></tfoot>`
    : ''
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`
}

export function exportBranchEfficiencyPdf(bundle) {
  const fmt = (n) => formatCurrency(money(n))
  const summaryBody = bundle.summaryRows.map((row) => [
    row.rank ?? '—',
    row.branchName,
    fmt(row.revenue),
    fmt(row.operatingCost),
    fmt(row.invoiceCommission),
    fmt(row.bonus),
    fmt(row.penalty),
    fmt(row.profit),
    `${row.marginPercent}%`,
  ])
  if (bundle.totalSummary) {
    const t = bundle.totalSummary
    summaryBody.push([
      'TỔNG', t.branchName, fmt(t.revenue), fmt(t.operatingCost), fmt(t.invoiceCommission),
      fmt(t.bonus), fmt(t.penalty), fmt(t.profit), `${t.marginPercent}%`,
    ])
  }

  const warnHtml = (bundle.warnings || []).length
    ? `<h2>Cảnh báo dữ liệu</h2><ul>${bundle.warnings.map((w) => `<li><strong>${w.title}</strong>: ${w.detail}</li>`).join('')}</ul>`
    : ''

  const revenueBody = (bundle.drills.revenue.lines || []).map((l) => [
    l.date, l.invoiceId, l.employeeName, l.servingBranchName, l.services, fmt(l.revenue), l.paymentMethodLabel,
  ])
  const opexBody = (bundle.drills.opex.lines || []).map((l) => [
    l.date, l.expenseTypeLabel, l.content, fmt(l.amount), l.branchName, l.enteredBy, l.sourceLabel,
  ])
  const commissionBody = (bundle.drills.commission.lines || []).map((l) => [
    l.date, l.invoiceId, l.employeeName, l.roleLabel, l.servingBranchName,
    fmt(l.invoiceRevenue), fmt(l.snapshotCommission), l.rateLabel, fmt(l.amountPaid),
  ])

  const html = `
    <h1>Báo cáo hiệu quả chi nhánh</h1>
    <p>Kỳ: <strong>${bundle.periodLabel}</strong> · Xếp hạng theo: ${bundle.sortKey}</p>
    ${warnHtml}
    <h2>Tổng hợp theo chi nhánh</h2>
    ${tableHtml(
      ['Hạng', 'Chi nhánh', 'Doanh thu', 'CP vận hành', '% HĐ', 'Thưởng', 'Phạt', 'LN', 'Biên'],
      summaryBody,
    )}
    <h2>Drill-down doanh thu</h2>
    ${tableHtml(
      ['Ngày', 'Mã HĐ', 'NV', 'CN', 'Dịch vụ', 'DT', 'PTTT'],
      revenueBody,
      ['Tổng', '', '', '', '', fmt(bundle.drills.revenue.total), ''],
    )}
    <h2>Drill-down chi phí vận hành</h2>
    ${tableHtml(
      ['Ngày', 'Nhóm', 'Nội dung', 'Số tiền', 'CN', 'Người nhập', 'Nguồn'],
      opexBody,
      ['Tổng', '', '', fmt(bundle.drills.opex.total), '', '', ''],
    )}
    <h2>Drill-down % hóa đơn</h2>
    ${tableHtml(
      ['Ngày', 'Mã HĐ', 'NV', 'Vai trò', 'CN', 'DT', '% snapshot', 'Tỷ lệ', 'Thực trả'],
      commissionBody,
      ['Tổng', '', '', '', '', '', '', '', fmt(bundle.drills.commission.total)],
    )}
    <h2>Drill-down thưởng / phạt</h2>
    <p>Thưởng tổng: <strong>${fmt(bundle.drills.bonus.total)}</strong>
    · Phạt tổng: <strong>${fmt(bundle.drills.penalty.total)}</strong></p>
  `

  openPrintDocument(`Hieu-qua-chi-nhanh-${periodSuffix(bundle.filters)}`, html)
  return { ok: true, format: 'pdf' }
}
