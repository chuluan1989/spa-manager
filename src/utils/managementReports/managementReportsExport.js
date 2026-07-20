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
        'Khách yêu cầu',
        'Tỷ lệ yêu cầu (%)',
        'Tăng/giảm tỷ lệ YC',
        'Tips',
        'Tăng/giảm tips',
        'DT/khách',
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
        fmt(row.requestedCustomerCount),
        fmt(row.requestedRate),
        trendLabel(row.requestedRateTrend),
        fmt(row.tips),
        trendLabel(row.tipsTrend),
        fmt(row.averageRevenuePerCustomer),
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
        'Doanh thu',
        'Tăng/giảm DT',
        'Tổng khách',
        'Khách yêu cầu',
        'Tỷ lệ yêu cầu (%)',
        'Tăng/giảm tỷ lệ YC',
        'Tips',
        'Tăng/giảm tips',
        'DT/khách',
        'Ngày làm hợp lệ',
        'DT/ngày làm',
        'Hạng DT trong CN',
        'Hạng tỷ lệ YC trong CN',
        'Kỳ so sánh',
      ],
      ...rows.map((row) => [
        row.name,
        row.branchName,
        fmt(row.revenue),
        trendLabel(row.revenueTrend),
        fmt(row.totalCustomerCount),
        fmt(row.requestedCustomerCount),
        fmt(row.requestedRate),
        trendLabel(row.requestedRateTrend),
        fmt(row.tips),
        trendLabel(row.tipsTrend),
        fmt(row.averageRevenuePerCustomer),
        fmt(row.workDays),
        fmt(row.averageRevenuePerWorkDay),
        row.revenueRankInBranch != null ? `${row.revenueRankInBranch}/${row.revenueRankTotal}` : '',
        row.requestedRateRankInBranch != null
          ? `${row.requestedRateRankInBranch}/${row.requestedRateRankTotal}`
          : '',
        `${compare.fromDate} → ${compare.toDate}`,
      ]),
    ],
  )
}
