import { formatDisplayDate } from './salaryReport'

const HEADER_FILL = 'FFE8F0FE'
const CURRENCY_FMT = '#,##0" ₫"'
const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
}

async function loadExcelJS() {
  const mod = await import('exceljs')
  return mod.default ?? mod
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.font = { bold: true, size: 11 }
    cell.border = THIN_BORDER
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  row.height = 22
}

function writeCurrencyCell(cell, value) {
  cell.value = Number(value ?? 0)
  cell.numFmt = CURRENCY_FMT
  cell.border = THIN_BORDER
}

function writeTextCell(cell, value) {
  cell.value = value ?? ''
  cell.border = THIN_BORDER
}

function applySheetChrome(worksheet, headerRow, lastCol) {
  worksheet.views = [{ state: 'frozen', ySplit: headerRow, activeCell: `A${headerRow + 1}` }]
  worksheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: lastCol },
  }
}

function autoFitColumns(worksheet, min = 10, max = 42) {
  worksheet.columns.forEach((column) => {
    let longest = min
    column.eachCell({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length
      if (len > longest) longest = len
    })
    column.width = Math.min(max, Math.max(min, longest + 2))
  })
}

function formatMonthLabel(month) {
  if (!month) return '—'
  const [year, mm] = month.split('-')
  return `${mm}/${year}`
}

function safeFilename(text) {
  return String(text ?? 'export').replace(/[^\w\-]+/g, '-').replace(/-+/g, '-')
}

export async function writeBranchPayrollWorkbook(data) {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Khoẻ Spa Manager'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Báo cáo chi lương', {
    views: [{ showGridLines: true }],
  })

  sheet.mergeCells('A1:L1')
  sheet.getCell('A1').value = 'BÁO CÁO CHI LƯƠNG CHI NHÁNH'
  sheet.getCell('A1').font = { bold: true, size: 16 }

  sheet.getCell('A2').value = 'Chi nhánh'
  sheet.getCell('B2').value = data.meta.branchName
  sheet.getCell('A3').value = 'Kỳ lương'
  sheet.getCell('B3').value = `${formatMonthLabel(data.meta.month)} · ${data.meta.cycleLabel}`
  sheet.getCell('A4').value = 'Từ ngày'
  sheet.getCell('B4').value = formatDisplayDate(data.meta.fromDate)
  sheet.getCell('C4').value = 'Đến ngày'
  sheet.getCell('D4').value = formatDisplayDate(data.meta.toDate)
  sheet.getCell('A5').value = 'Ngày xuất'
  sheet.getCell('B5').value = new Date(data.meta.exportedAt).toLocaleString('vi-VN')

  const headerRowIndex = 7
  const headers = [
    'STT', 'Nhân viên', 'Doanh số', 'Hoa hồng', 'Tips',
    'Thưởng', 'Phạt', 'Ứng', 'Tổng thu nhập', 'Thực nhận', 'Đã trả', 'Còn lại',
  ]
  const headerRow = sheet.getRow(headerRowIndex)
  headers.forEach((label, index) => {
    headerRow.getCell(index + 1).value = label
  })
  styleHeaderRow(headerRow)

  const firstDataRow = headerRowIndex + 1
  data.rows.forEach((row, index) => {
    const r = sheet.getRow(firstDataRow + index)
    writeTextCell(r.getCell(1), index + 1)
    writeTextCell(r.getCell(2), row.employeeName)
    writeCurrencyCell(r.getCell(3), row.ticketRevenue)
    writeCurrencyCell(r.getCell(4), row.commission)
    writeCurrencyCell(r.getCell(5), row.tips)
    writeCurrencyCell(r.getCell(6), row.bonus)
    writeCurrencyCell(r.getCell(7), row.penalty)
    writeCurrencyCell(r.getCell(8), row.advance)
    writeCurrencyCell(r.getCell(9), row.grossIncome)
    writeCurrencyCell(r.getCell(10), row.netSalary)
    writeCurrencyCell(r.getCell(11), row.paidAmount)
    writeCurrencyCell(r.getCell(12), row.remainingAmount)
  })

  const totalRowIndex = firstDataRow + data.rows.length
  const totalRow = sheet.getRow(totalRowIndex)
  writeTextCell(totalRow.getCell(1), '')
  writeTextCell(totalRow.getCell(2), 'TỔNG CHI LƯƠNG CHI NHÁNH')
  totalRow.getCell(2).font = { bold: true }

  for (let col = 3; col <= 12; col += 1) {
    const letter = sheet.getColumn(col).letter
    const cell = totalRow.getCell(col)
    cell.value = { formula: `SUM(${letter}${firstDataRow}:${letter}${totalRowIndex - 1})` }
    cell.numFmt = CURRENCY_FMT
    cell.font = { bold: true }
    cell.border = THIN_BORDER
  }

  applySheetChrome(sheet, headerRowIndex, headers.length)
  autoFitColumns(sheet)

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export async function writeEmployeePayrollWorkbook(data) {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Khoẻ Spa Manager'
  workbook.created = new Date()

  // Sheet 1 — Tổng quan
  const overview = workbook.addWorksheet('Tổng quan')
  overview.mergeCells('A1:B1')
  overview.getCell('A1').value = 'ĐỐI SOÁT LƯƠNG — TỔNG QUAN'
  overview.getCell('A1').font = { bold: true, size: 16 }

  const info = [
    ['Nhân viên', data.meta.employeeName],
    ['Chi nhánh', data.meta.branchName],
    ['Tháng', formatMonthLabel(data.meta.month)],
    ['Kỳ', data.meta.cycleLabel],
    ['Từ ngày', formatDisplayDate(data.meta.fromDate)],
    ['Đến ngày', formatDisplayDate(data.meta.toDate)],
    ['Ngày xuất', new Date(data.meta.exportedAt).toLocaleString('vi-VN')],
  ]
  info.forEach(([label, value], index) => {
    overview.getCell(`A${index + 3}`).value = label
    overview.getCell(`B${index + 3}`).value = value
  })

  const summaryStart = info.length + 5
  overview.getCell(`A${summaryStart}`).value = 'Khoản mục'
  overview.getCell(`B${summaryStart}`).value = 'Số tiền'
  styleHeaderRow(overview.getRow(summaryStart))

  const summaryRows = [
    ['Doanh số', data.summary.ticketRevenue],
    ['Hoa hồng', data.summary.commission],
    ['Tips', data.summary.tips],
    ['Lương cơ bản', data.summary.baseSalary],
    ['Thưởng', data.summary.bonus],
    ['Phạt', data.summary.penalty],
    ['Ứng', data.summary.advance],
    ['Điều chỉnh', data.summary.otherAdjustment],
    ['Thực nhận', data.summary.netSalary],
    ['Đã trả', data.summary.paidAmount],
    ['Còn lại', data.summary.remainingAmount],
  ]
  summaryRows.forEach(([label, amount], index) => {
    const row = overview.getRow(summaryStart + 1 + index)
    writeTextCell(row.getCell(1), label)
    writeCurrencyCell(row.getCell(2), amount)
    if (label === 'Thực nhận') row.getCell(1).font = { bold: true }
    if (label === 'Thực nhận') row.getCell(2).font = { bold: true }
  })

  const analysisStart = summaryStart + summaryRows.length + 3
  overview.getCell(`A${analysisStart}`).value = 'PHÂN TÍCH'
  overview.getCell(`A${analysisStart}`).font = { bold: true, size: 13 }
  const analysisItems = [
    ['Tổng số hóa đơn', data.analysis.invoiceCount],
    ['Giá trị hóa đơn TB', data.analysis.avgInvoiceValue],
    ['Dịch vụ làm nhiều nhất', `${data.analysis.topServiceName} (${data.analysis.topServiceCount})`],
    ['Tips TB / hóa đơn', data.analysis.avgTipsPerInvoice],
    ['% hoa hồng TB', data.analysis.avgCommissionPercent],
    ['Ngày doanh thu cao nhất', `${data.analysis.topRevenueDay} — ${data.analysis.topRevenueDayAmount.toLocaleString('vi-VN')} ₫`],
    ['Ngày tips cao nhất', `${data.analysis.topTipsDay} — ${data.analysis.topTipsDayAmount.toLocaleString('vi-VN')} ₫`],
  ]
  analysisItems.forEach(([label, value], index) => {
    overview.getCell(`A${analysisStart + 1 + index}`).value = `• ${label}`
    overview.getCell(`B${analysisStart + 1 + index}`).value = value
  })

  autoFitColumns(overview, 12, 48)

  // Sheet 2 — Chi tiết dịch vụ
  const invoices = workbook.addWorksheet('Chi tiết dịch vụ')
  const invHeaders = [
    'Ngày giờ', 'Tên khách hàng', 'Dịch vụ', 'Giá', '%', 'Tips', 'Tiền hưởng',
  ]
  const invHeaderRow = invoices.getRow(1)
  invHeaders.forEach((label, index) => {
    invHeaderRow.getCell(index + 1).value = label
  })
  styleHeaderRow(invHeaderRow)

  let invRowIndex = 2
  for (const day of data.invoiceDays) {
    for (const line of day.lines) {
      const row = invoices.getRow(invRowIndex)
      const dateTime = [line.displayDate, line.time].filter(Boolean).join(' ')
      writeTextCell(row.getCell(1), dateTime)
      writeTextCell(row.getCell(2), line.customerName)
      writeTextCell(row.getCell(3), line.serviceName)
      writeCurrencyCell(row.getCell(4), line.price)
      row.getCell(5).value = line.commissionPercent
      row.getCell(5).numFmt = '0"%"'
      row.getCell(5).border = THIN_BORDER
      writeCurrencyCell(row.getCell(6), line.tips)
      writeCurrencyCell(row.getCell(7), line.earnedAmount)
      invRowIndex += 1
    }

    const totalRow = invoices.getRow(invRowIndex)
    writeTextCell(totalRow.getCell(1), `TỔNG NGÀY ${day.displayDate}`)
    totalRow.getCell(1).font = { bold: true }
    writeTextCell(totalRow.getCell(2), `${day.totals.invoiceCount} HĐ`)
    writeCurrencyCell(totalRow.getCell(4), day.totals.price)
    writeCurrencyCell(totalRow.getCell(6), day.totals.tips)
    writeCurrencyCell(totalRow.getCell(7), day.totals.earned)
    invRowIndex += 1
  }

  applySheetChrome(invoices, 1, invHeaders.length)
  autoFitColumns(invoices)

  // Sheet 3 — Chấm công
  const attendance = workbook.addWorksheet('Chấm công')
  const attHeaders = ['Ngày', 'Giờ vào', 'Giờ ra', 'Trạng thái', 'Đi trễ', 'Về sớm', 'Phạt', 'Ghi chú']
  const attHeaderRow = attendance.getRow(1)
  attHeaders.forEach((label, index) => {
    attHeaderRow.getCell(index + 1).value = label
  })
  styleHeaderRow(attHeaderRow)

  data.attendanceRows.forEach((entry, index) => {
    const row = attendance.getRow(index + 2)
    writeTextCell(row.getCell(1), entry.displayDate)
    writeTextCell(row.getCell(2), entry.checkIn)
    writeTextCell(row.getCell(3), entry.checkOut)
    writeTextCell(row.getCell(4), entry.statusLabel)
    writeTextCell(row.getCell(5), entry.isLate)
    writeTextCell(row.getCell(6), entry.isEarly)
    writeCurrencyCell(row.getCell(7), entry.penaltyAmount)
    writeTextCell(row.getCell(8), entry.note)
  })

  applySheetChrome(attendance, 1, attHeaders.length)
  autoFitColumns(attendance)

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export async function downloadBranchPayrollWorkbook(data) {
  const blob = await writeBranchPayrollWorkbook(data)
  const filename = `chi-luong-${safeFilename(data.meta.branchName)}-${data.meta.month}-${data.meta.cycle}.xlsx`
  downloadBlob(filename, blob)
}

export async function downloadEmployeePayrollWorkbook(data) {
  const blob = await writeEmployeePayrollWorkbook(data)
  const filename = `doi-soat-${safeFilename(data.meta.employeeName)}-${data.meta.month}-${data.meta.cycle}.xlsx`
  downloadBlob(filename, blob)
}

export { loadExcelJS }
