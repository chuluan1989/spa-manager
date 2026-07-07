import { formatCurrency } from '../../utils/invoice'
import './InvoiceSummary.css'

function SummaryRow({ label, value, variant = '' }) {
  return (
    <div className={`invoice-summary__row${variant ? ` invoice-summary__row--${variant}` : ''}`}>
      <span>{label}</span>
      <span className="invoice-summary__value">{value}</span>
    </div>
  )
}

export default function InvoiceSummary({
  originalServiceTotal,
  discountAmount,
  payment,
  serviceTotal,
  tips,
  total,
  customerTotal,
  commission,
}) {
  const ticketTotal = originalServiceTotal ?? serviceTotal ?? 0
  const promoAmount = Number(discountAmount ?? 0)
  const paymentAmount = payment ?? serviceTotal ?? ticketTotal
  const tipsAmount = Number(tips ?? 0)
  const customerPay = customerTotal ?? total ?? paymentAmount + tipsAmount

  return (
    <aside className="invoice-summary">
      <h3 className="invoice-summary__title">Tính tiền</h3>
      <div className="invoice-summary__flow">
        <SummaryRow label="Giá vé" value={formatCurrency(ticketTotal)} />
        <div className="invoice-summary__arrow" aria-hidden>↓</div>
        <SummaryRow
          label="Khuyến mãi"
          value={promoAmount > 0 ? `−${formatCurrency(promoAmount)}` : formatCurrency(0)}
          variant={promoAmount > 0 ? 'discount' : ''}
        />
        <div className="invoice-summary__arrow" aria-hidden>↓</div>
        <SummaryRow label="Thanh toán" value={formatCurrency(paymentAmount)} variant="payment" />
        <p className="invoice-summary__hint">Tự động tính: Giá vé − Khuyến mãi</p>
        <div className="invoice-summary__arrow" aria-hidden>↓</div>
        <SummaryRow label="Tips" value={formatCurrency(tipsAmount)} />
        <div className="invoice-summary__arrow" aria-hidden>↓</div>
        <SummaryRow label="Tổng khách thanh toán" value={formatCurrency(customerPay)} variant="total" />
        <p className="invoice-summary__hint">Tự động tính: Thanh toán + Tips</p>
      </div>
      <div className="invoice-summary__rows">
        <SummaryRow label="Hoa hồng nhân viên" value={formatCurrency(commission)} variant="commission" />
      </div>
    </aside>
  )
}
