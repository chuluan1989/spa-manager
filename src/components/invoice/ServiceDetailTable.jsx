import { formatCurrency } from '../../utils/invoice'
import './ServiceDetailTable.css'

export default function ServiceDetailTable({ items, totals }) {
  if (items.length === 0) {
    return (
      <div className="service-detail">
        <h4 className="service-detail__title">Chi tiết dịch vụ đã chọn</h4>
        <p className="service-detail__empty">Chưa chọn dịch vụ nào.</p>
      </div>
    )
  }

  const ticketTotal = totals.originalServiceTotal ?? totals.serviceTotal ?? 0
  const promoAmount = totals.discountAmount ?? 0
  const payment = totals.payment ?? totals.serviceTotal ?? 0
  const customerTotal = totals.customerTotal ?? totals.total ?? payment + (totals.tips ?? 0)

  return (
    <div className="service-detail">
      <h4 className="service-detail__title">Chi tiết dịch vụ đã chọn</h4>
      <div className="service-detail__table-wrap">
        <table className="service-detail__table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên dịch vụ</th>
              <th>Giá vé</th>
              <th>Thanh toán</th>
              <th>% HH</th>
              <th>Hoa hồng</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.id}-${index}`}>
                <td>{index + 1}</td>
                <td>{item.name}</td>
                <td className="service-detail__money">{formatCurrency(item.originalPrice ?? item.price)}</td>
                <td className="service-detail__money">{formatCurrency(item.price)}</td>
                <td>{item.commissionPercent}%</td>
                <td className="service-detail__money service-detail__commission">
                  {formatCurrency(item.commissionAmount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Giá vé</td>
              <td colSpan={4} className="service-detail__money">{formatCurrency(ticketTotal)}</td>
            </tr>
            <tr>
              <td colSpan={2}>Khuyến mãi</td>
              <td colSpan={4} className="service-detail__money service-detail__discount">
                {promoAmount > 0 ? `−${formatCurrency(promoAmount)}` : formatCurrency(0)}
              </td>
            </tr>
            <tr className="service-detail__row--highlight">
              <td colSpan={2}>Thanh toán</td>
              <td colSpan={4} className="service-detail__money service-detail__payment">
                {formatCurrency(payment)}
              </td>
            </tr>
            <tr>
              <td colSpan={2}>Tips</td>
              <td colSpan={4} className="service-detail__money">{formatCurrency(totals.tips)}</td>
            </tr>
            <tr className="service-detail__row--highlight">
              <td colSpan={2}>Tổng khách thanh toán</td>
              <td colSpan={4} className="service-detail__money service-detail__grand">
                {formatCurrency(customerTotal)}
              </td>
            </tr>
            <tr>
              <td colSpan={2}>Hoa hồng nhân viên</td>
              <td colSpan={4} className="service-detail__money service-detail__commission">
                {formatCurrency(totals.commission)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
