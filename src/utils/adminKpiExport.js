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
    const duration90 = formatAdminKpiCell(row.cards.duration90)
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
      duration90Count: row.counts.duration90 || 0,
      duration90Rate: duration90.rate,
      duration90Target: duration90.target,
      duration90Missing: duration90.missing,
      duration90Status: duration90.status,
      score: row.scoreLabel,
      status: row.rowStatusLabel,
    }
  })
}

const HEADERS = [
  'Nhân viên',
  'Chi nhánh hiện tại',
  'Chi nhánh phục vụ',
  'Dịch vụ chính',
  'Dịch vụ phụ',
  'Tỷ lệ DV phụ',
  'Mục tiêu DV phụ',
  'Còn thiếu DV phụ',
  'TT DV phụ',
  'Chuyên sâu',
  'Tỷ lệ Chuyên sâu',
  'Mục tiêu CS',
  'Còn thiếu CS',
  'TT CS',
  'Combo',
  'Tỷ lệ Combo',
  'Mục tiêu Combo',
  'Còn thiếu Combo',
  'TT Combo',
  'Tổng HĐ',
  'Khách yêu cầu',
  'Tỷ lệ Khách YC',
  'Mục tiêu YC',
  'Còn thiếu YC',
  'TT YC',
  '90 phút',
  'Tỷ lệ 90 phút',
  'Mục tiêu 90 phút',
  'Còn thiếu 90 phút',
  'TT 90 phút',
  'Kết quả',
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
      r.duration90Count,
      r.duration90Rate,
      r.duration90Target,
      r.duration90Missing,
      r.duration90Status,
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
