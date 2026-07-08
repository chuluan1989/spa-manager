import { PAYROLL_DETAIL_LABELS } from '../constants/payrollTypes'
import { formatCurrency } from './invoice'

function formatMonthLabel(month) {
  if (!month) return '—'
  const [year, mm] = month.split('-')
  return `Tháng ${mm}/${year}`
}

function formatDisplayDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

function buildPayslipHtml(payslip) {
  const rows = [
    ['baseSalary', payslip.baseSalary],
    ['commission', payslip.commission],
    ['tips', payslip.tips],
    ['bonus', payslip.bonus],
    ['penalty', -payslip.penalty],
    ['reduction', -payslip.reduction],
    ['advance', -payslip.advance],
    ['otherAdjustment', payslip.otherAdjustment],
  ]

  const lineItems = rows
    .map(([key, amount]) => {
      const label = PAYROLL_DETAIL_LABELS[key] ?? key
      const cls = amount >= 0 ? 'pos' : 'neg'
      return `<tr><td>${label}</td><td class="${cls}">${formatCurrency(Math.abs(amount))}${amount < 0 ? ' (−)' : ''}</td></tr>`
    })
    .join('')

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/>
    <title>Phiếu lương ${payslip.employeeName}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:Georgia,'Times New Roman',serif;margin:0;padding:32px;background:#fafafa;color:#111}
      .slip{max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.06)}
      .brand{text-align:center;margin-bottom:24px;padding-bottom:20px;border-bottom:2px solid #111}
      .brand h1{margin:0;font-size:22px;letter-spacing:.04em;color:#111}
      .brand p{margin:6px 0 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.12em}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:24px;font-size:13px}
      .meta span{color:#6b7280;display:block;font-size:11px;text-transform:uppercase;margin-bottom:2px}
      table{width:100%;border-collapse:collapse;font-size:14px}
      td{padding:10px 0;border-bottom:1px dashed #e5e7eb}
      td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
      .pos{color:#059669}.neg{color:#dc2626}
      .total{margin-top:20px;padding:16px;background:#111;color:#d4af37;border-radius:10px;display:flex;justify-content:space-between;align-items:center;font-size:16px;font-weight:700}
      .footer{margin-top:24px;text-align:center;font-size:11px;color:#9ca3af}
    </style></head><body>
    <div class="slip">
      <div class="brand">
        <h1>KHOẺ SPA</h1>
        <p>Phiếu lương điện tử</p>
      </div>
      <div class="meta">
        <div><span>Nhân viên</span><strong>${payslip.employeeName}</strong></div>
        <div><span>Chi nhánh</span><strong>${payslip.branchName}</strong></div>
        <div><span>Chức vụ</span><strong>${payslip.position || '—'}</strong></div>
        <div><span>Kỳ lương</span><strong>${formatMonthLabel(payslip.month)}</strong></div>
        <div><span>Từ ngày</span><strong>${formatDisplayDate(payslip.fromDate)}</strong></div>
        <div><span>Đến ngày</span><strong>${formatDisplayDate(payslip.toDate)}</strong></div>
      </div>
      <table>${lineItems}</table>
      <div class="total">
        <span>Lương thực nhận</span>
        <span>${formatCurrency(payslip.netSalary)}</span>
      </div>
      <p class="footer">Khoẻ Spa Manager · ${new Date().toLocaleDateString('vi-VN')}</p>
    </div>
    <script>window.onload=()=>window.print()</script>
    </body></html>`
}

export function openPayslipPrint(payslip) {
  const html = buildPayslipHtml(payslip)
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) {
    window.alert('Trình duyệt chặn cửa sổ in. Vui lòng cho phép popup.')
    return
  }
  win.document.write(html)
  win.document.close()
}

export function downloadPayslipHtml(payslip) {
  const html = buildPayslipHtml(payslip).replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeName = payslip.employeeName.replace(/\s+/g, '-')
  link.href = url
  link.download = `phieu-luong-${safeName}-${payslip.month}.html`
  link.click()
  URL.revokeObjectURL(url)
}

export function exportPayslipPdf(payslip) {
  openPayslipPrint(payslip)
}
