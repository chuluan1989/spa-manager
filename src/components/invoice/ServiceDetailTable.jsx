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
              <th>% hoa hồng</th>
              <th>Tiền hoa hồng</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.id}-${index}`}>
                <td>{index + 1}</td>
                <td>{item.name}</td>
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
              <td colSpan={2}>Tổng tiền dịch vụ</td>
              <td colSpan={3} className="service-detail__money service-detail__total">
                {formatCurrency(totals.serviceTotal)}
              </td>
            </tr>
            <tr>
              <td colSpan={2}>Tổng hoa hồng dịch vụ</td>
              <td colSpan={3} className="service-detail__money service-detail__commission">
                {formatCurrency(totals.serviceCommission)}
              </td>
            </tr>
            <tr>
              <td colSpan={2}>Tips</td>
              <td colSpan={3} className="service-detail__money">
                {formatCurrency(totals.tips)}
              </td>
            </tr>
            <tr className="service-detail__row--highlight">
              <td colSpan={2}>Tổng hoa hồng nhân viên</td>
              <td colSpan={3} className="service-detail__money service-detail__commission">
                {formatCurrency(totals.commission)}
              </td>
            </tr>
            <tr className="service-detail__row--highlight">
              <td colSpan={2}>Tổng hóa đơn</td>
              <td colSpan={3} className="service-detail__money service-detail__grand">
                {formatCurrency(totals.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
