import { formatCurrency } from '../../utils/invoice'
import './InvoiceSummary.css'

export default function InvoiceSummary({ serviceTotal, tips, total, commission }) {
  return (
    <aside className="invoice-summary">
      <h3 className="invoice-summary__title">Tổng kết</h3>
      <div className="invoice-summary__rows">
        <div className="invoice-summary__row">
          <span>Tổng tiền dịch vụ</span>
          <span className="invoice-summary__value">{formatCurrency(serviceTotal)}</span>
        </div>
        <div className="invoice-summary__row">
          <span>Tips</span>
          <span className="invoice-summary__value">{formatCurrency(tips)}</span>
        </div>
        <div className="invoice-summary__row invoice-summary__row--total">
          <span>Tổng hóa đơn</span>
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
