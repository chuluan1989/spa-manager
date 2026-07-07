import { useMemo } from 'react'
import {
  formatCurrency,
  getInvoiceDiscountAmount,
  getInvoiceOriginalServiceTotal,
  getInvoicePayment,
  getInvoiceCustomerTotal,
  getInvoiceServiceDetails,
  getInvoiceTips,
  invoiceHasDiscount,
} from '../../utils/invoice'
import {
  computeInvoiceListTotals,
  paginateInvoices,
  readInvoiceTime,
} from '../../utils/invoiceFilters'
import './InvoiceList.css'

function formatServiceSummary(services, maxLength = 52) {
  const text = services.map((service) => service.name).join(', ')
  if (!text) return '—'
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

function shortInvoiceId(id) {
  if (!id) return '—'
  if (id.length <= 12) return id
  return id.slice(-10)
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

  if (invoices.length === 0) {
    return (
      <section className="invoice-list">
        <div className="invoice-list__header">
          <h3 className="invoice-list__title">Danh sách hóa đơn</h3>
        </div>
        <p className="invoice-list__empty">{emptyMessage}</p>
      </section>
    )
  }

  return (
    <section className="invoice-list">
      <div className="invoice-list__header">
        <h3 className="invoice-list__title">Danh sách hóa đơn</h3>
        <p className="invoice-list__meta">
          {pagination.items.length} / {pagination.totalItems} hóa đơn
        </p>
      </div>

      <div className="invoice-list__table-wrap">
        <table className="invoice-list__table">
          <thead>
            <tr>
              <th>Mã HĐ</th>
              <th className="is-center">Ngày</th>
              <th className="is-center">Giờ</th>
              <th>Chi nhánh</th>
              <th>Nhân viên</th>
              <th>Dịch vụ</th>
              <th className="is-money">Giá vé</th>
              <th className="is-money">Khuyến mãi</th>
              <th className="is-money">Thanh toán</th>
              <th className="is-money">Tips</th>
              <th className="is-money">Tổng khách trả</th>
              <th>Tên khách</th>
              <th>SĐT khách</th>
              <th>Ghi chú</th>
              <th className="is-actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map((inv) => {
              const services = getInvoiceServiceDetails(inv)
              const ticketPrice = getInvoiceOriginalServiceTotal(inv)
              const discount = getInvoiceDiscountAmount(inv)
              const payment = getInvoicePayment(inv)
              const tips = getInvoiceTips(inv)
              const customerTotal = getInvoiceCustomerTotal(inv)
              const hasDiscount = invoiceHasDiscount(inv)

              return (
                <tr key={inv.id} className={hasDiscount ? 'has-discount' : ''}>
                  <td className="invoice-list__id" title={inv.id}>
                    {shortInvoiceId(inv.id)}
                    {hasDiscount && <span className="invoice-list__km-badge">KM</span>}
                  </td>
                  <td className="is-center">{inv.date}</td>
                  <td className="is-center">{readInvoiceTime(inv)}</td>
                  <td>{inv.branchName}</td>
                  <td>{inv.employeeName}</td>
                  <td className="invoice-list__services" title={services.map((s) => s.name).join(', ')}>
                    {formatServiceSummary(services)}
                  </td>
                  <td className="is-money">{formatCurrency(ticketPrice)}</td>
                  <td className="is-money invoice-list__discount">
                    {discount > 0 ? `−${formatCurrency(discount)}` : '—'}
                  </td>
                  <td className="is-money">{formatCurrency(payment)}</td>
                  <td className="is-money">{formatCurrency(tips)}</td>
                  <td className="is-money invoice-list__customer-total">{formatCurrency(customerTotal)}</td>
                  <td>{inv.customerName || '—'}</td>
                  <td>{inv.customerPhone || '—'}</td>
                  <td className="invoice-list__note">{inv.note || '—'}</td>
                  <td className="invoice-list__actions">
                    <button
                      type="button"
                      className="invoice-list__btn invoice-list__btn--detail"
                      onClick={() => onView?.(inv)}
                    >
                      Chi tiết
                    </button>
                    {canEdit(inv) && (
                      <button
                        type="button"
                        className="invoice-list__btn invoice-list__btn--edit"
                        onClick={() => onEdit?.(inv)}
                      >
                        Sửa
                      </button>
                    )}
                    {allowDelete && (
                      <button
                        type="button"
                        className="invoice-list__btn invoice-list__btn--delete"
                        onClick={() => onDelete(inv.id)}
                      >
                        Xóa
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="invoice-list__totals-row">
              <td colSpan={6}><strong>Tổng theo bộ lọc ({totals.count})</strong></td>
              <td className="is-money"><strong>{formatCurrency(totals.ticketPrice)}</strong></td>
              <td className="is-money"><strong>−{formatCurrency(totals.discount)}</strong></td>
              <td className="is-money"><strong>{formatCurrency(totals.ticketRevenue)}</strong></td>
              <td className="is-money"><strong>{formatCurrency(totals.tips)}</strong></td>
              <td className="is-money invoice-list__customer-total">
                <strong>{formatCurrency(totals.customerTotal)}</strong>
              </td>
              <td colSpan={4} />
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
