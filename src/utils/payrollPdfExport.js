import { formatCurrency } from './invoice'
import { formatDisplayDate } from './salaryReport'
import { openPrintDocument } from './csvExport'

function formatMonthLabel(month) {
  if (!month) return '—'
  const [year, mm] = month.split('-')
  return `${mm}/${year}`
}

function buildEmployeeInfoHtml(data) {
  return `
    <section class="block">
      <h2>Thông tin nhân viên</h2>
      <table class="meta">
        <tbody>
          <tr><td>Họ tên</td><td><strong>${data.meta.employeeName}</strong></td></tr>
          <tr><td>Chi nhánh</td><td>${data.meta.branchName}</td></tr>
          <tr><td>Tháng</td><td>${formatMonthLabel(data.meta.month)}</td></tr>
          <tr><td>Kỳ lương</td><td>${data.meta.cycleLabel}</td></tr>
        </tbody>
      </table>
    </section>`
}

function buildOverviewHtml(data) {
  const s = data.summary
  return `
    <section class="block">
      <h2>Tổng quan</h2>
      <table>
        <tbody>
          <tr><td>Doanh số</td><td>${formatCurrency(s.ticketRevenue)}</td></tr>
          <tr><td>Hoa hồng</td><td>${formatCurrency(s.commission)}</td></tr>
          <tr><td>Tips</td><td>${formatCurrency(s.tips)}</td></tr>
          <tr><td>Thưởng</td><td>${formatCurrency(s.bonus)}</td></tr>
          <tr><td>Phạt</td><td>${formatCurrency(s.penalty)}</td></tr>
          <tr><td>Ứng</td><td>${formatCurrency(s.advance)}</td></tr>
          <tr class="net"><td><strong>Thực nhận</strong></td><td><strong>${formatCurrency(s.netSalary)}</strong></td></tr>
        </tbody>
      </table>
    </section>`
}

function buildServiceDetailHtml(data) {
  if (!data.invoiceLines.length) {
    return `
      <section class="block">
        <h2>Chi tiết dịch vụ</h2>
        <p>Không có dịch vụ trong kỳ.</p>
      </section>`
  }

  const rows = data.invoiceLines.map((line) => {
    const dateTime = [line.displayDate, line.time].filter(Boolean).join(' ')
    return `
    <tr>
      <td>${dateTime}</td>
      <td>${line.customerName}</td>
      <td>${line.serviceName}</td>
      <td>${formatCurrency(line.price)}</td>
      <td>${line.commissionPercent}%</td>
      <td>${formatCurrency(line.tips)}</td>
      <td>${formatCurrency(line.earnedAmount)}</td>
    </tr>`
  }).join('')

  return `
    <section class="block">
      <h2>Chi tiết dịch vụ</h2>
      <table>
        <thead>
          <tr>
            <th>Ngày giờ</th>
            <th>Khách hàng</th>
            <th>Dịch vụ</th>
            <th>Giá</th>
            <th>%</th>
            <th>Tips</th>
            <th>Tiền hưởng</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`
}

function buildAttendanceHtml(data) {
  if (!data.attendanceRows.length) {
    return `
      <section class="block">
        <h2>Chấm công</h2>
        <p>Không có bản ghi chấm công trong kỳ.</p>
      </section>`
  }

  const rows = data.attendanceRows.map((row) => `
    <tr>
      <td>${row.displayDate}</td>
      <td>${row.statusLabel}</td>
      <td>${row.isLate || '—'}</td>
      <td>${row.isEarly || '—'}</td>
      <td>${formatCurrency(row.penaltyAmount)}</td>
    </tr>`).join('')

  return `
    <section class="block">
      <h2>Chấm công</h2>
      <table>
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Trạng thái</th>
            <th>Đi trễ</th>
            <th>Về sớm</th>
            <th>Phạt</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`
}

function buildAnalysisHtml(data) {
  const a = data.analysis
  return `
    <section class="block">
      <h2>Phân tích hiệu suất</h2>
      <ul>
        <li>Tổng số hóa đơn: <strong>${a.invoiceCount}</strong></li>
        <li>Giá trị hóa đơn TB: <strong>${formatCurrency(a.avgInvoiceValue)}</strong></li>
        <li>Dịch vụ làm nhiều nhất: <strong>${a.topServiceName}</strong> (${a.topServiceCount})</li>
        <li>Tips TB / hóa đơn: <strong>${formatCurrency(a.avgTipsPerInvoice)}</strong></li>
        <li>% hoa hồng TB: <strong>${a.avgCommissionPercent}%</strong></li>
        <li>Ngày doanh thu cao nhất: <strong>${a.topRevenueDay}</strong> — ${formatCurrency(a.topRevenueDayAmount)}</li>
        <li>Ngày tips cao nhất: <strong>${a.topTipsDay}</strong> — ${formatCurrency(a.topTipsDayAmount)}</li>
      </ul>
    </section>`
}

export function buildEmployeePayrollPdfHtml(data) {
  return `
    <style>
      body{font-family:system-ui,-apple-system,sans-serif;color:#111;font-size:12px;line-height:1.4;margin:0}
      h1{font-size:18px;margin:0 0 10px}
      h2{font-size:14px;margin:0 0 6px;color:#374151}
      .block{margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #e5e7eb}
      table{width:100%;border-collapse:collapse;margin-top:6px}
      th,td{border:1px solid #e5e7eb;padding:5px 6px;text-align:left;vertical-align:top}
      th{background:#f3f4f6;font-size:11px}
      table.meta td:first-child{width:28%;color:#6b7280}
      tr.net td{background:#fef3c7}
      ul{margin:0;padding-left:18px}
      @media print{.block{break-inside:avoid}}
    </style>
    <h1>Đối soát lương</h1>
    ${buildEmployeeInfoHtml(data)}
    ${buildOverviewHtml(data)}
    ${buildServiceDetailHtml(data)}
    ${buildAttendanceHtml(data)}
    ${buildAnalysisHtml(data)}
    <p style="font-size:10px;color:#6b7280;margin-top:8px">Xuất lúc ${new Date(data.meta.exportedAt).toLocaleString('vi-VN')} · Khoẻ Spa Manager</p>`
}

export function exportEmployeePayrollPdf(data) {
  openPrintDocument(
    `Doi-soat-${data.meta.employeeName}`,
    buildEmployeePayrollPdfHtml(data),
  )
}
