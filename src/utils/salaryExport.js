import { formatCurrency } from './invoice'
import { getBranchName } from './branchStorage'
import { downloadCsv, openPrintDocument } from './csvExport'
import { mapPayrollRowForExport } from './payrollExportModel'
import { getPayCycleLabel } from './salaryReport'

export function exportPayrollCsv(rows, month = '', branchId = '', cycle = '') {
  const suffix = [month, cycle, branchId].filter(Boolean).join('_') || 'all'
  const mapped = (rows ?? []).map((row) => mapPayrollRowForExport(row, month))

  downloadCsv(`luong-${suffix}`, [
    [
      'Tháng',
      'Kỳ',
      'Chi nhánh',
      'Nhân viên',
      'Doanh số',
      'Hoa hồng',
      'Tips',
      'Lương cơ bản',
      'Thưởng',
      'Phạt',
      'Ứng',
      'Điều chỉnh',
      'Tổng thu nhập',
      'Thực nhận',
      'Đã trả',
      'Còn lại',
      'Ngày công',
    ],
    ...mapped.map((row) => [
      month,
      getPayCycleLabel(cycle),
      getBranchName(row.branchId),
      row.employeeName,
      row.ticketRevenue,
      row.commission,
      row.tips,
      row.baseSalary,
      row.bonus,
      row.penalty,
      row.advance,
      row.otherAdjustment,
      row.grossIncome,
      row.netSalary,
      row.paidAmount,
      row.remainingAmount,
      row.workDays,
    ]),
  ])
}

export function exportPayrollPdf(rows, month = '', cycle = '') {
  const mapped = (rows ?? []).map((row) => mapPayrollRowForExport(row, month))
  const tableRows = mapped.map((row) => `
    <tr>
      <td>${row.employeeName}</td>
      <td>${getBranchName(row.branchId)}</td>
      <td>${formatCurrency(row.ticketRevenue)}</td>
      <td>${formatCurrency(row.commission)}</td>
      <td>${formatCurrency(row.tips)}</td>
      <td>${formatCurrency(row.penalty)}</td>
      <td>${formatCurrency(row.netSalary)}</td>
    </tr>`).join('')

  openPrintDocument(
    `Bang-luong-${month}`,
    `<h1>Bảng lương ${month} · ${getPayCycleLabel(cycle)}</h1>
    <table>
      <thead><tr><th>Nhân viên</th><th>Chi nhánh</th><th>Doanh số</th><th>Hoa hồng</th><th>Tips</th><th>Phạt</th><th>Thực nhận</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>`,
  )
}
