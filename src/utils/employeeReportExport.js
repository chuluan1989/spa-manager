import { formatCurrency } from './invoice'
import { formatDisplayDate } from './salaryReport'

function escapeCsv(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function buildExportRows(detail) {
  const rows = []
  rows.push([
    'Ngày',
    'Giờ',
    'Khách',
    'SĐT',
    'Dịch vụ',
    'Giá vé',
    'Khuyến mãi',
    'Thanh toán',
    'Tips',
    'Hoa hồng',
    'Lương dòng',
    'Vai trò',
  ])

  for (const day of detail.days) {
    for (const inv of day.invoices) {
      rows.push([
        day.displayDate,
        inv.invoiceTime,
        inv.customerName,
        inv.customerPhone,
        inv.serviceNames,
        inv.ticketPrice,
        inv.discount,
        inv.payment,
        inv.tips,
        inv.commission,
        inv.totalSalary,
        inv.roleLabel,
      ])
    }
    rows.push([
      `Tổng ngày ${day.displayDate}`,
      '',
      '',
      '',
      '',
      '',
      '',
      day.serviceRevenue,
      day.tips,
      day.serviceCommission,
      day.totalSalary,
      `${day.invoiceCount} HĐ`,
    ])
  }

  rows.push([
    'TỔNG KỲ',
    '',
    '',
    '',
    '',
    '',
    '',
    detail.periodTotals.serviceRevenue,
    detail.periodTotals.tips,
    detail.periodTotals.serviceCommission,
    detail.periodTotals.totalSalary,
    `${detail.periodTotals.invoiceCount} HĐ`,
  ])

  return rows
}

export function exportEmployeeReportCsv(detail) {
  const rows = buildExportRows(detail)
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeName = detail.employeeName.replace(/\s+/g, '-')
  link.href = url
  link.download = `bao-cao-${safeName}-${detail.fromDate}-${detail.toDate}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function buildPrintHtml(detail) {
  const daySections = detail.days
    .map((day) => {
      const invoiceBlocks = day.invoices
        .map(
          (inv) => `
        <div class="inv">
          <div class="time">${inv.invoiceTime}</div>
          <div><strong>Khách:</strong> ${inv.customerName}</div>
          <div><strong>Dịch vụ:</strong> ${inv.serviceNames}</div>
          <div class="grid">
            <span>Giá vé: ${formatCurrency(inv.ticketPrice)}</span>
            <span>KM: ${formatCurrency(inv.discount)}</span>
            <span>TT: ${formatCurrency(inv.payment)}</span>
            <span>Tips: ${formatCurrency(inv.tips)}</span>
            <span>HH: ${formatCurrency(inv.commission)}</span>
          </div>
        </div>`,
        )
        .join('<hr/>')

      return `
      <section class="day">
        <h3>Ngày ${day.displayDate}</h3>
        ${invoiceBlocks}
        <div class="day-total">
          <strong>Tổng ngày:</strong>
          ${day.invoiceCount} HĐ · DT ${formatCurrency(day.serviceRevenue)} ·
          Tips ${formatCurrency(day.tips)} · HH ${formatCurrency(day.serviceCommission)} ·
          Lương ${formatCurrency(day.totalSalary)}
        </div>
      </section>`
    })
    .join('')

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/>
    <title>Báo cáo ${detail.employeeName}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;color:#111;font-size:13px}
      h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;color:#555;font-weight:normal;margin:0 0 20px}
      h3{font-size:15px;border-bottom:1px solid #ccc;padding-bottom:4px}
      .inv{margin:12px 0;padding:8px 0}.time{font-weight:bold;font-size:14px;margin-bottom:6px}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:6px}
      hr{border:none;border-top:1px dashed #ccc;margin:8px 0}
      .day-total{margin-top:12px;padding:10px;background:#f5f5f5;border-radius:6px}
      .period{margin-top:24px;padding:14px;border:2px solid #333;border-radius:8px}
    </style></head><body>
    <h1>${detail.employeeName}</h1>
    <h2>${detail.branchName} · ${detail.cycleLabel} · ${formatDisplayDate(detail.fromDate)} – ${formatDisplayDate(detail.toDate)}</h2>
    ${daySections || '<p>Không có dữ liệu</p>'}
    <div class="period">
      <strong>Tổng kỳ:</strong>
      Doanh thu ${formatCurrency(detail.periodTotals.serviceRevenue)} ·
      Tips ${formatCurrency(detail.periodTotals.tips)} ·
      HH ${formatCurrency(detail.periodTotals.serviceCommission)} ·
      Lương ${formatCurrency(detail.periodTotals.totalSalary)}
    </div>
    <script>window.onload=()=>window.print()</script>
    </body></html>`
}

export function exportEmployeeReportPdf(detail) {
  const html = buildPrintHtml(detail)
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) {
    window.alert('Trình duyệt chặn cửa sổ in. Vui lòng cho phép popup.')
    return
  }
  win.document.write(html)
  win.document.close()
}
