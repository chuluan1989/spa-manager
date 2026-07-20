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
        'Ngày công',
        'DT/ngày làm',
        'Khách',
        'Khách/ngày',
        'Khách yêu cầu',
        'Khách YC/ngày',
        'Tỷ lệ yêu cầu (%)',
        'Tips',
        'Tips/ngày',
        'DT/khách',
        'Performance Score',
        'Xếp loại',
        'Xu hướng 3 tháng',
        'Kỳ so sánh',
      ],
      ...rows.map((row) => [
        row.name,
        fmt(row.revenue),
        trendLabel(row.revenueTrend),
        fmt(row.workDays),
        fmt(row.revenuePerWorkDay),
        fmt(row.totalCustomerCount),
        fmt(row.customersPerWorkDay),
        fmt(row.requestedCustomerCount),
        fmt(row.requestedPerWorkDay),
        fmt(row.requestedRate),
        fmt(row.tips),
        fmt(row.tipsPerWorkDay),
        fmt(row.averageRevenuePerCustomer),
        fmt(row.performanceScore),
        row.performanceGrade ?? '',
        row.performanceTrendLabel ?? '',
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
        'Ngày công',
        'DT/ngày làm',
        'Khách',
        'Khách/ngày',
        'Khách yêu cầu',
        'Khách YC/ngày',
        'Tỷ lệ yêu cầu (%)',
        'Tips',
        'Tips/ngày',
        'DT/khách',
        'Performance Score',
        'Xếp loại',
        'Xu hướng 3 tháng',
        'Hạng score CN',
        'Hạng score hệ thống',
        'Kỳ so sánh',
      ],
      ...rows.map((row) => [
        row.name,
        row.branchName,
        fmt(row.revenue),
        trendLabel(row.revenueTrend),
        fmt(row.workDays),
        fmt(row.revenuePerWorkDay),
        fmt(row.totalCustomerCount),
        fmt(row.customersPerWorkDay),
        fmt(row.requestedCustomerCount),
        fmt(row.requestedPerWorkDay),
        fmt(row.requestedRate),
        fmt(row.tips),
        fmt(row.tipsPerWorkDay),
        fmt(row.averageRevenuePerCustomer),
        fmt(row.performanceScore),
        row.performanceGrade ?? '',
        row.performanceTrendLabel ?? '',
        row.performanceRankInBranch != null
          ? `${row.performanceRankInBranch}/${row.performanceRankInBranchTotal}`
          : '',
        row.performanceRankSystem != null
          ? `${row.performanceRankSystem}/${row.performanceRankSystemTotal}`
          : '',
        `${compare.fromDate} → ${compare.toDate}`,
      ]),
    ],
  )
}
