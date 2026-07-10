function escapeCsv(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function downloadCsv(filename, rows) {
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function exportReportOverviewCsv(summary, filters) {
  downloadCsv(
    `bao-cao-tong-quan-${filters.fromDate}-${filters.toDate}.csv`,
    [
      ['Chỉ số', 'Giá trị'],
      ['Doanh thu tiền vé', summary.ticketRevenue],
      ['Tips', summary.tips],
      ['Tổng doanh thu thực thu', summary.actualRevenue],
      ['Tổng lương nhân viên', summary.totalSalary],
      ['Chi phí', summary.expenses],
      ['Lợi nhuận', summary.profit],
      ['Tỷ suất lợi nhuận (%)', summary.profitMargin],
      ['Tổng khách', summary.customerCount],
      ['Tổng hóa đơn', summary.invoiceCount],
    ],
  )
}

export function exportReportBranchCsv(rows, filters) {
  downloadCsv(
    `bao-cao-chi-nhanh-${filters.fromDate}-${filters.toDate}.csv`,
    [
      ['Chi nhánh', 'Doanh thu tiền vé', 'Tips', 'DT thực thu', 'Tổng lương', 'Chi phí', 'Lợi nhuận', 'Tỷ suất LN (%)'],
      ...rows.map((row) => [
        row.branchName,
        row.ticketRevenue,
        row.tips,
        row.actualRevenue,
        row.totalSalary,
        row.expenses,
        row.profit,
        row.profitMargin,
      ]),
    ],
  )
}

export function exportReportEmployeeCsv(rows, filters) {
  downloadCsv(
    `bao-cao-nhan-vien-${filters.fromDate}-${filters.toDate}.csv`,
    [
      ['Nhân viên', 'Chi nhánh', 'Doanh thu tiền vé', 'Tips', 'Khách', 'Hóa đơn', 'Hoa hồng'],
      ...rows.map((row) => [
        row.employeeName,
        row.branchName,
        row.ticketRevenue,
        row.tips,
        row.customerCount,
        row.invoiceCount,
        row.commission,
      ]),
    ],
  )
}

export function exportReportInvoiceCsv(items, employeeName, filters) {
  downloadCsv(
    `bao-cao-hoa-don-${employeeName.replace(/\s+/g, '-')}-${filters.fromDate}-${filters.toDate}.csv`,
    [
      ['Ngày', 'Giờ', 'Khách', 'Dịch vụ', 'Giá vé', 'Khuyến mãi', 'Doanh thu tiền vé', 'Tips', 'Hoa hồng'],
      ...items.flatMap((day) => day.invoices.map((inv) => [
        day.displayDate,
        inv.invoiceTime,
        inv.customerName,
        inv.serviceNames,
        inv.ticketPrice,
        inv.discount,
        inv.payment,
        inv.tips,
        inv.commission,
      ])),
    ],
  )
}
