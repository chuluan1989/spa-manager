import { downloadCsv } from './csvExport'
import loadExcelJS from './exceljsBridge'
import { getBranchName } from './branchStorage'
import { formatAdminKpiCell } from './adminKpiDashboard'

function exportRows(rows = []) {
  return rows.map((row) => {
    const addon = formatAdminKpiCell(row.cards.addon)
    const advanced = formatAdminKpiCell(row.cards.advanced)
    const combo = formatAdminKpiCell(row.cards.combo)
    const requested = formatAdminKpiCell(row.cards.requested)
    return {
      employeeName: row.employeeName,
      homeBranch: row.homeBranchName,
      servingBranches: (row.servingBranchNames || []).join(', '),
      main: row.counts.main,
      addonCount: row.counts.addon,
      addonRate: addon.rate,
      addonTarget: addon.target,
      addonMissing: addon.missing,
      addonStatus: addon.status,
      advancedCount: row.counts.advanced,
      advancedRate: advanced.rate,
      advancedTarget: advanced.target,
      advancedMissing: advanced.missing,
      advancedStatus: advanced.status,
      comboCount: row.counts.combo,
      comboRate: combo.rate,
      comboTarget: combo.target,
      comboMissing: combo.missing,
      comboStatus: combo.status,
      totalInvoices: row.counts.totalInvoices,
      requestedCount: row.counts.requestedInvoices,
      requestedRate: requested.rate,
      requestedTarget: requested.target,
      requestedMissing: requested.missing,
      requestedStatus: requested.status,
      score: row.scoreLabel,
      status: row.rowStatusLabel,
    }
  })
}

const HEADERS = [
  'Nhân viên',
  'Chi nhánh nhà',
  'CN phục vụ',
  'MAIN',
  'ADDON',
  'KPI DV phụ',
  'Target DV phụ',
  'Thiếu DV phụ',
  'TT DV phụ',
  'ADVANCED',
  'KPI Chuyên sâu',
  'Target CS',
  'Thiếu CS',
  'TT CS',
  'COMBO',
  'KPI Combo',
  'Target Combo',
  'Thiếu Combo',
  'TT Combo',
  'Tổng HĐ',
  'Khách yêu cầu',
  'KPI Khách YC',
  'Target YC',
  'Thiếu YC',
  'TT YC',
  'Đạt /4',
  'Trạng thái',
]

function toMatrix(rows) {
  const data = exportRows(rows)
  return [
    HEADERS,
    ...data.map((r) => [
      r.employeeName,
      r.homeBranch,
      r.servingBranches,
      r.main,
      r.addonCount,
      r.addonRate,
      r.addonTarget,
      r.addonMissing,
      r.addonStatus,
      r.advancedCount,
      r.advancedRate,
      r.advancedTarget,
      r.advancedMissing,
      r.advancedStatus,
      r.comboCount,
      r.comboRate,
      r.comboTarget,
      r.comboMissing,
      r.comboStatus,
      r.totalInvoices,
      r.requestedCount,
      r.requestedRate,
      r.requestedTarget,
      r.requestedMissing,
      r.requestedStatus,
      r.score,
      r.status,
    ]),
  ]
}

export function exportAdminKpiCsv(rows, { month = '', branchId = '' } = {}) {
  const suffix = [month, branchId ? getBranchName(branchId) || branchId : ''].filter(Boolean).join('_') || 'all'
  downloadCsv(`kpi-admin-${suffix}`, toMatrix(rows))
}

export async function exportAdminKpiExcel(rows, { month = '', branchId = '' } = {}) {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Khoẻ Spa Manager'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('KPI Admin')
  const matrix = toMatrix(rows)
  sheet.addRows(matrix)
  sheet.getRow(1).font = { bold: true }
  sheet.columns.forEach((col) => {
    let max = 10
    col.eachCell({ includeEmpty: true }, (cell) => {
      max = Math.max(max, String(cell.value ?? '').length)
    })
    col.width = Math.min(28, max + 2)
  })
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const suffix = [month, branchId ? getBranchName(branchId) || branchId : ''].filter(Boolean).join('_') || 'all'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kpi-admin-${suffix}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
