import { formatCurrency } from '../../utils/invoice'
import './InvoiceSummary.css'

export default function InvoiceSummary({
  originalServiceTotal,
  discountAmount,
  serviceTotal,
  tips,
  total,
  commission,
}) {
  const hasDiscount = Number(discountAmount) > 0

  return (
    <aside className="invoice-summary">
      <h3 className="invoice-summary__title">Tổng kết</h3>
      <div className="invoice-summary__rows">
        <div className="invoice-summary__row">
          <span>Giá gốc dịch vụ</span>
          <span className="invoice-summary__value">{formatCurrency(originalServiceTotal ?? serviceTotal)}</span>
        </div>
        {hasDiscount && (
          <div className="invoice-summary__row invoice-summary__row--discount">
            <span>Giảm giá / Khuyến mãi</span>
            <span className="invoice-summary__value">−{formatCurrency(discountAmount)}</span>
          </div>
        )}
        <div className="invoice-summary__row">
          <span>Giá thực thu (dịch vụ)</span>
          <span className="invoice-summary__value">{formatCurrency(serviceTotal)}</span>
        </div>
        <div className="invoice-summary__row">
          <span>Tips</span>
          <span className="invoice-summary__value">{formatCurrency(tips)}</span>
        </div>
        <div className="invoice-summary__row invoice-summary__row--total">
          <span>Tổng khách thanh toán</span>
          <span className="invoice-summary__value">{formatCurrency(total)}</span>
        </div>
        <div className="invoice-summary__row invoice-summary__row--commission">
          <span>Hoa hồng nhân viên</span>
          <span className="invoice-summary__value">{formatCurrency(commission)}</span>
        </div>
      </div>
    </aside>
  )
}
