import { useMemo } from 'react'
import {
  formatCurrency,
  getInvoiceServiceDetails,
  getInvoiceServiceTotal,
  getInvoicePayment,
  getInvoiceCustomerTotal,
  invoiceHasDiscount,
} from '../../utils/invoice'
import {
  computeInvoiceListTotals,
  formatInvoiceDateTime,
  paginateInvoices,
  readInvoiceTime,
} from '../../utils/invoiceFilters'
import './InvoiceList.css'

function ServiceLines({ services }) {
  if (services.length === 0) {
    return <span className="invoice-list__muted">—</span>
  }

  return (
    <ul className="invoice-list__service-lines">
      {services.map((service, index) => (
        <li key={`${service.id}-${service.name}-${index}`}>{service.name}</li>
      ))}
    </ul>
  )
}

function ServicePrices({ services }) {
  if (services.length === 0) {
    return <span className="invoice-list__muted">—</span>
  }

  return (
    <ul className="invoice-list__service-lines invoice-list__service-lines--prices">
      {services.map((service, index) => (
        <li key={`${service.id}-price-${index}`}>{formatCurrency(service.price)}</li>
      ))}
    </ul>
  )
}

export default function InvoiceList({
  invoices,
  page,
  onPageChange,
  onDelete,
  onEdit,
  onView,
  allowDelete = false,
  canEdit = () => false,
  emptyMessage = 'Chưa có hóa đơn nào.',
}) {
  const totals = useMemo(() => computeInvoiceListTotals(invoices), [invoices])
  const pagination = useMemo(() => paginateInvoices(invoices, page), [invoices, page])
  const showActions = allowDelete || invoices.some((inv) => canEdit(inv))

  if (invoices.length === 0) {
    return (
      <section className="invoice-list">
        <h3 className="invoice-list__title">Danh sách hóa đơn</h3>
        <p className="invoice-list__empty">{emptyMessage}</p>
      </section>
    )
  }

  return (
    <section className="invoice-list">
      <div className="invoice-list__header">
        <h3 className="invoice-list__title">Danh sách hóa đơn</h3>
        <p className="invoice-list__meta">
          Hiển thị {pagination.items.length} / {pagination.totalItems} hóa đơn
        </p>
      </div>

      <div className="invoice-list__table-wrap">
        <table className="invoice-list__table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Ngày</th>
              <th>Giờ</th>
              <th>Chi nhánh</th>
              <th>NV thực hiện</th>
              <th>NV hỗ trợ/tư vấn</th>
              <th>Tên khách</th>
              <th>SĐT khách</th>
              <th>Dịch vụ đã làm</th>
              <th>Giá từng DV</th>
              <th>Doanh thu tiền vé</th>
              <th>Tips</th>
              <th>Tổng khách thanh toán</th>
              <th>Hoa hồng</th>
              <th>Ghi chú</th>
              <th>Người nhập</th>
              <th>Tạo lúc</th>
              <th>Cập nhật</th>
              {showActions && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {pagination.items.map((inv, index) => {
              const services = getInvoiceServiceDetails(inv)
              const tips = Number.isFinite(inv.tips) ? inv.tips : 0
              const payment = getInvoicePayment(inv)
              const customerTotal = getInvoiceCustomerTotal(inv)
              const rowNumber = (pagination.page - 1) * pagination.pageSize + index + 1

              return (
                <tr key={inv.id}>
                  <td className="invoice-list__index">{rowNumber}</td>
                  <td className="invoice-list__date">
                    {inv.date}
                    {invoiceHasDiscount(inv) && (
                      <span className="invoice-list__promo-badge">🎁 Khuyến mãi</span>
                    )}
                  </td>
                  <td className="invoice-list__time">{readInvoiceTime(inv)}</td>
                  <td className="invoice-list__branch">{inv.branchName}</td>
                  <td className="invoice-list__employee">{inv.employeeName}</td>
                  <td className="invoice-list__employee">{inv.supportEmployeeName || '—'}</td>
                  <td className="invoice-list__customer">{inv.customerName || '—'}</td>
                  <td className="invoice-list__phone">{inv.customerPhone || '—'}</td>
                  <td className="invoice-list__services">
                    <ServiceLines services={services} />
                  </td>
                  <td className="invoice-list__service-prices">
                    <ServicePrices services={services} />
                  </td>
                  <td className="invoice-list__money invoice-list__payment">{formatCurrency(payment)}</td>
                  <td className="invoice-list__money">{formatCurrency(tips)}</td>
                  <td className="invoice-list__money invoice-list__total">
                    {formatCurrency(customerTotal)}
                  </td>
                  <td className="invoice-list__money invoice-list__commission">
                    {formatCurrency(inv.commission)}
                  </td>
                  <td className="invoice-list__note">{inv.note || '—'}</td>
                  <td className="invoice-list__entered-by">{inv.enteredBy || '—'}</td>
                  <td className="invoice-list__datetime">{formatInvoiceDateTime(inv.createdAt)}</td>
                  <td className="invoice-list__datetime">{formatInvoiceDateTime(inv.updatedAt)}</td>
                  {showActions && (
                    <td className="invoice-list__action">
                      <button
                        type="button"
                        className="invoice-list__view"
                        onClick={() => onView?.(inv)}
                      >
                        Chi tiết
                      </button>
                      {canEdit(inv) && (
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
          <tfoot>
            <tr className="invoice-list__totals-row">
              <td colSpan={10}><strong>Tổng theo bộ lọc</strong></td>
              <td className="invoice-list__money invoice-list__payment">
                <strong>{formatCurrency(totals.ticketRevenue ?? totals.revenue)}</strong>
              </td>
              <td className="invoice-list__money"><strong>{formatCurrency(totals.tips)}</strong></td>
              <td className="invoice-list__money invoice-list__total">
                <strong>{formatCurrency(totals.customerTotal)}</strong>
              </td>
              <td className="invoice-list__money invoice-list__commission">
                <strong>{formatCurrency(totals.commission)}</strong>
              </td>
              <td colSpan={showActions ? 5 : 4}>
                <strong>{totals.count} hóa đơn</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="invoice-list__pagination">
          <button
            type="button"
            className="invoice-list__page-btn"
            disabled={pagination.page <= 1}
            onClick={() => onPageChange(pagination.page - 1)}
          >
            Trang trước
          </button>
          <span className="invoice-list__page-info">
            Trang {pagination.page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            className="invoice-list__page-btn"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => onPageChange(pagination.page + 1)}
          >
            Trang sau
          </button>
        </div>
      )}
    </section>
  )
}
