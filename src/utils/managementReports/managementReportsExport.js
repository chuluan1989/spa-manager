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

function trendLabel(trend) {
  if (!trend) return ''
  return trend.label ?? ''
}

function fmt(value) {
  if (value == null || Number.isNaN(value)) return ''
  return value
}

export function exportManagementBranchCsv(rows, filters, compare) {
  downloadCsv(
    `bao-cao-quan-tri-chi-nhanh-${filters.fromDate}-${filters.toDate}.csv`,
    [
      [
        'Chi nhánh',
        'Doanh thu',
        'Tăng/giảm DT',
        'Tổng khách',
        'Tăng/giảm khách',
        'Tổng tour',
        'Lượt khách yêu cầu (tour)',
        'Tỷ lệ YC/tour (%)',
        'Tăng/giảm tỷ lệ YC/tour',
        'Tips',
        'Tăng/giảm tips',
        'Tiền mặt',
        'Chuyển khoản',
        'Chưa xác định',
        'Tổng thu',
        'Tỷ lệ tiền mặt (%)',
        'Tỷ lệ chuyển khoản (%)',
        'Tiền vé/HĐ',
        'Tips/HĐ',
        'DT/ngày',
        'Lợi nhuận',
        'Kỳ so sánh',
      ],
      ...rows.map((row) => [
        row.name,
        fmt(row.revenue),
        trendLabel(row.revenueTrend),
        fmt(row.totalCustomerCount),
        trendLabel(row.customerTrend),
        fmt(row.invoiceCount),
        fmt(row.customerRequestedTourCount),
        fmt(row.customerRequestedTourRate),
        trendLabel(row.customerRequestedTourRateTrend),
        fmt(row.tips),
        trendLabel(row.tipsTrend),
        fmt(row.cashAmount),
        fmt(row.bankTransferAmount),
        fmt(row.unknownPaymentAmount),
        fmt(row.totalCollected),
        fmt(row.cashRatePercent),
        fmt(row.bankTransferRatePercent),
        fmt(row.ticketRevenuePerInvoice),
        fmt(row.tipsPerInvoice),
        fmt(row.averageRevenuePerDay),
        row.profitAvailable ? fmt(row.profit) : '',
        `${compare.fromDate} → ${compare.toDate}`,
      ]),
    ],
  )
}

export function exportManagementEmployeeCsv(rows, filters, compare) {
  downloadCsv(
    `bao-cao-quan-tri-nhan-vien-${filters.fromDate}-${filters.toDate}.csv`,
    [
      [
        'Nhân viên',
        'Chi nhánh',
        'Tour chính',
        'Tour hỗ trợ',
        'Tổng tour',
        'Khách yêu cầu',
        'Tỷ lệ YC/tour chính (%)',
        'Tăng/giảm tỷ lệ YC',
        'Doanh thu',
        'Tăng/giảm DT',
        'Tips',
        'Tăng/giảm tips',
        'Lương',
        'Ngày làm hợp lệ',
        'DT/ngày làm',
        'Hạng DT trong CN',
        'Kỳ so sánh',
      ],
      ...rows.map((row) => [
        row.name,
        row.branchName,
        fmt(row.mainTourCount),
        fmt(row.supportTourCount),
        fmt(row.totalTourCount ?? row.invoiceCount),
        fmt(row.customerRequestedTourCount),
        fmt(row.customerRequestedTourRate),
        trendLabel(row.customerRequestedTourRateTrend),
        fmt(row.revenue),
        trendLabel(row.revenueTrend),
        fmt(row.tips),
        trendLabel(row.tipsTrend),
        fmt(row.totalSalary),
        fmt(row.workDays),
        fmt(row.averageRevenuePerWorkDay),
        row.revenueRankInBranch != null ? `${row.revenueRankInBranch}/${row.revenueRankTotal}` : '',
        `${compare.fromDate} → ${compare.toDate}`,
      ]),
    ],
  )
}
