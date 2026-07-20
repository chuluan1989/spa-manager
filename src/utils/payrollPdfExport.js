import { formatCurrency } from './invoice'
import { formatDisplayDate } from './salaryReport'
import { openPrintDocument } from './csvExport'

function formatMonthLabel(month) {
  if (!month) return '—'
  const [year, mm] = month.split('-')
  return `${mm}/${year}`
}

function buildSummaryHtml(data) {
  const s = data.summary
  return `
    <section class="block">
      <h2>Tổng quan kỳ lương</h2>
      <p><strong>${data.meta.employeeName}</strong> · ${data.meta.branchName}</p>
      <p>${formatMonthLabel(data.meta.month)} · ${data.meta.cycleLabel} · ${formatDisplayDate(data.meta.fromDate)} – ${formatDisplayDate(data.meta.toDate)}</p>
      <table>
        <tbody>
          <tr><td>Doanh số</td><td>${formatCurrency(s.ticketRevenue)}</td></tr>
          <tr><td>Hoa hồng</td><td>${formatCurrency(s.commission)}</td></tr>
          <tr><td>Tips</td><td>${formatCurrency(s.tips)}</td></tr>
          <tr><td>Lương cơ bản</td><td>${formatCurrency(s.baseSalary)}</td></tr>
          <tr><td>Thưởng</td><td>${formatCurrency(s.bonus)}</td></tr>
          <tr><td>Phạt</td><td>${formatCurrency(s.penalty)}</td></tr>
          <tr><td>Ứng</td><td>${formatCurrency(s.advance)}</td></tr>
          <tr><td>Điều chỉnh</td><td>${formatCurrency(s.otherAdjustment)}</td></tr>
          <tr class="net"><td><strong>Thực nhận</strong></td><td><strong>${formatCurrency(s.netSalary)}</strong></td></tr>
          <tr><td>Đã trả</td><td>${formatCurrency(s.paidAmount)}</td></tr>
          <tr><td>Còn lại</td><td>${formatCurrency(s.remainingAmount)}</td></tr>
        </tbody>
      </table>
    </section>`
}

function buildRecentInvoicesHtml(data, limit = 12) {
  const lines = data.invoiceLines.slice(-limit)
  if (!lines.length) return '<p>Không có hóa đơn trong kỳ.</p>'

  const rows = lines.map((line) => `
    <tr>
      <td>${line.displayDate} ${line.time}</td>
      <td>${line.customerName}</td>
      <td>${line.serviceName}</td>
      <td>${formatCurrency(line.earnedAmount)}</td>
    </tr>`).join('')

  return `
    <section class="block">
      <h2>Chi tiết gần nhất (${lines.length} dòng)</h2>
      <table>
        <thead><tr><th>Ngày</th><th>Khách</th><th>Dịch vụ</th><th>Được hưởng</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`
}

function buildWalletHtml(data, limit = 10) {
  const rows = data.walletRows.slice(-limit)
  if (!rows.length) return ''

  const body = rows.map((row) => `
    <tr>
      <td>${row.displayDate}</td>
      <td>${row.typeLabel}</td>
      <td>${row.label}</td>
      <td>${formatCurrency(row.amount)}</td>
    </tr>`).join('')

  return `
    <section class="block">
      <h2>Ví lương (gần nhất)</h2>
      <table>
        <thead><tr><th>Ngày</th><th>Loại</th><th>Mô tả</th><th>Số tiền</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>`
}

function buildAnalysisHtml(data) {
  const a = data.analysis
  return `
    <section class="block">
      <h2>Phân tích nhanh</h2>
      <ul>
        <li>Tổng hóa đơn: <strong>${a.invoiceCount}</strong></li>
        <li>Hóa đơn TB: <strong>${formatCurrency(a.avgInvoiceValue)}</strong></li>
        <li>Dịch vụ nhiều nhất: <strong>${a.topServiceName}</strong> (${a.topServiceCount})</li>
        <li>Tips TB/HĐ: <strong>${formatCurrency(a.avgTipsPerInvoice)}</strong></li>
      </ul>
    </section>`
}

export function buildEmployeePayrollPdfHtml(data) {
  return `
    <style>
      body{font-family:system-ui,-apple-system,sans-serif;color:#111;font-size:13px;line-height:1.45}
      h1{font-size:20px;margin:0 0 8px}
      h2{font-size:15px;margin:0 0 8px;color:#374151}
      .block{margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #e5e7eb}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top}
      th{background:#f3f4f6;font-size:12px}
      tr.net td{background:#fef3c7}
      ul{margin:0;padding-left:18px}
    </style>
    <h1>Đối soát lương</h1>
    ${buildSummaryHtml(data)}
    ${buildRecentInvoicesHtml(data)}
    ${buildWalletHtml(data)}
    ${buildAnalysisHtml(data)}
    <p style="font-size:11px;color:#6b7280">Xuất lúc ${new Date(data.meta.exportedAt).toLocaleString('vi-VN')} · Khoẻ Spa Manager</p>`
}

export function exportEmployeePayrollPdf(data) {
  openPrintDocument(
    `Doi-soat-${data.meta.employeeName}`,
    buildEmployeePayrollPdfHtml(data),
  )
}
