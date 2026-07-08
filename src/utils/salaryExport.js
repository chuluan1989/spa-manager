import { formatCurrency } from './invoice'
import { getBranchName } from './branchStorage'
import { downloadCsv, openPrintDocument } from './csvExport'

export function exportPayrollCsv(rows, month = '', branchId = '') {
  const suffix = [month, branchId].filter(Boolean).join('_') || 'all'
  downloadCsv(`luong-${suffix}`, [
    [
      'Tháng',
      'Chi nhánh',
      'Nhân viên',
      'Doanh thu',
      'Tips',
      'Hoa hồng',
      'Phạt chấm công',
      'Phạt thủ công',
      'Thưởng/Trừ',
      'Lương thực nhận',
      'Ngày công',
    ],
    ...rows.map((row) => [
      month,
      getBranchName(row.branchId),
      row.employeeName,
      row.serviceRevenue ?? 0,
      row.tips ?? 0,
      row.serviceCommission ?? 0,
      row.attendancePenalty ?? 0,
      row.manualPenalty ?? 0,
      row.adjustmentTotal ?? 0,
      row.netSalary ?? 0,
      row.workDays ?? 0,
    ]),
  ])
}

export function exportPayrollPdf(rows, month = '') {
  const tableRows = rows.map((row) => `
    <tr>
      <td>${row.employeeName}</td>
      <td>${getBranchName(row.branchId)}</td>
      <td>${formatCurrency(row.serviceRevenue ?? 0)}</td>
      <td>${formatCurrency(row.tips ?? 0)}</td>
      <td>${formatCurrency(row.attendancePenalty ?? 0)}</td>
      <td>${formatCurrency(row.netSalary ?? 0)}</td>
    </tr>`).join('')

  openPrintDocument(
    `Bang-luong-${month}`,
    `<h1>Bảng lương ${month}</h1>
    <table>
      <thead><tr><th>Nhân viên</th><th>Chi nhánh</th><th>Doanh thu</th><th>Tips</th><th>Phạt CC</th><th>Thực nhận</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>`,
  )
}
