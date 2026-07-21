import { PAYROLL_DETAIL_LABELS } from '../../constants/payrollTypes'
import { downloadPayslipHtml, exportPayslipPdf, openPayslipPrint } from '../../utils/payslipExport'
import { formatCurrency } from '../../utils/invoice'

export default function PayrollPayslipPanel({ payslip, onClose }) {
  if (!payslip) return null

  const lines = [
    ['grossBeforeDeduction', payslip.grossBeforeDeduction ?? (
      (payslip.baseSalary ?? 0) + (payslip.commission ?? 0) + (payslip.tips ?? 0) + (payslip.bonus ?? 0)
      - (payslip.reduction ?? 0) - (payslip.penalty ?? 0)
    )],
    ['advance', payslip.advance],
    ['otherAdjustment', payslip.otherAdjustment],
  ]

  const detailLines = [
    ['baseSalary', payslip.baseSalary],
    ['commission', payslip.commission],
    ['tips', payslip.tips],
    ['bonus', payslip.bonus],
    ['penalty', payslip.penalty],
    ['reduction', payslip.reduction],
  ]

  return (
    <div className="salary-modal" role="dialog" aria-modal="true">
      <div className="salary-modal__backdrop" onClick={onClose} />
      <div className="salary-modal__panel salary-payslip">
        <header>
          <h3>Phiếu lương · {payslip.employeeName}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>

        <div className="salary-payslip__brand">
          <strong>KHOẺ SPA</strong>
          <span>Phiếu lương điện tử</span>
        </div>

        <div className="salary-payslip__meta">
          <div><small>Chi nhánh</small><span>{payslip.branchName}</span></div>
          <div><small>Tháng</small><span>{payslip.month}</span></div>
        </div>

        <ul className="salary-payslip__lines">
          {detailLines.map(([key, amount]) => (
            <li key={key}>
              <span>{PAYROLL_DETAIL_LABELS[key]}</span>
              <strong>{formatCurrency(amount)}</strong>
            </li>
          ))}
        </ul>

        <div className="salary-payslip__summary">
          {lines.map(([key, amount]) => (
            <div key={key} className="salary-payslip__summary-row">
              <span>{PAYROLL_DETAIL_LABELS[key] ?? key}</span>
              <strong>{formatCurrency(amount)}</strong>
            </div>
          ))}
        </div>

        <div className="salary-payslip__net">
          <span>Lương thực nhận</span>
          <strong>{formatCurrency(payslip.netSalary)}</strong>
        </div>

        <footer className="salary-payslip__actions">
          <button type="button" onClick={() => openPayslipPrint(payslip)}>In</button>
          <button type="button" onClick={() => exportPayslipPdf(payslip)}>Xuất PDF</button>
          <button type="button" onClick={() => downloadPayslipHtml(payslip)}>Tải xuống</button>
        </footer>
      </div>
    </div>
  )
}
