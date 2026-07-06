import {
  formatCurrency,
  formatServiceLine,
  getInvoiceServiceDetails,
  getInvoiceServiceTotal,
} from '../../utils/invoice'
import './InvoiceList.css'

export default function InvoiceList({
  invoices,
  onDelete,
  onEdit,
  allowDelete = false,
  allowEdit = false,
}) {
  const showActions = allowDelete || allowEdit

  if (invoices.length === 0) {
    return (
      <section className="invoice-list">
        <h3 className="invoice-list__title">Danh sách hóa đơn</h3>
        <p className="invoice-list__empty">Chưa có hóa đơn nào.</p>
      </section>
    )
  }

  return (
    <section className="invoice-list">
      <h3 className="invoice-list__title">Danh sách hóa đơn</h3>
      <div className="invoice-list__table-wrap">
        <table className="invoice-list__table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Ngày</th>
              <th>Chi nhánh</th>
              <th>Nhân viên chính</th>
              <th>Nhân viên hỗ trợ</th>
              <th>Khách</th>
              <th>Dịch vụ đã làm</th>
              <th>Tiền dịch vụ</th>
              <th>Tips</th>
              <th>Tổng hóa đơn</th>
              <th>Hoa hồng nhân viên</th>
              {showActions && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, index) => {
              const services = getInvoiceServiceDetails(inv)
              const serviceTotal = getInvoiceServiceTotal(inv)
              const tips = Number.isFinite(inv.tips) ? inv.tips : 0

              return (
                <tr key={inv.id}>
                  <td className="invoice-list__index">{index + 1}</td>
                  <td className="invoice-list__date">{inv.date}</td>
                  <td className="invoice-list__branch">{inv.branchName}</td>
                  <td className="invoice-list__employee">{inv.employeeName}</td>
                  <td className="invoice-list__employee">{inv.supportEmployeeName || '—'}</td>
                  <td className="invoice-list__customer">{inv.customerName || '—'}</td>
                  <td className="invoice-list__services">
                    {services.length > 0 ? (
                      <ul className="invoice-list__service-lines">
                        {services.map((service) => (
                          <li key={`${inv.id}-${service.id}-${service.name}`}>
                            {formatServiceLine(service)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="invoice-list__muted">—</span>
                    )}
                  </td>
                  <td className="invoice-list__money">{formatCurrency(serviceTotal)}</td>
                  <td className="invoice-list__money">{formatCurrency(tips)}</td>
                  <td className="invoice-list__money invoice-list__total">
                    {formatCurrency(inv.total)}
                  </td>
                  <td className="invoice-list__money invoice-list__commission">
                    {formatCurrency(inv.commission)}
                  </td>
                  {showActions && (
                    <td className="invoice-list__action">
                      {allowEdit && (
                        <button
                          type="button"
                          className="invoice-list__edit"
                          onClick={() => onEdit?.(inv)}
                        >
                          Sửa
                        </button>
                      )}
                      {allowDelete && (
                        <button
                          type="button"
                          className="invoice-list__delete"
                          onClick={() => onDelete(inv.id)}
                        >
                          Xóa
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
