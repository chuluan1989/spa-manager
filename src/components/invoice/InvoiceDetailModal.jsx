import {
  formatCurrency,
  getInvoiceDiscountAmount,
  getInvoiceOriginalServiceTotal,
  getInvoiceServiceDetails,
  getInvoiceServiceTotal,
  invoiceHasDiscount,
} from '../../utils/invoice'
import {
  formatInvoiceDateTime,
  getPaymentMethodLabel,
  readInvoiceTime,
} from '../../utils/invoiceFilters'
import './InvoiceDetailModal.css'

export default function InvoiceDetailModal({ invoice, onClose, onEdit, canEdit }) {
  if (!invoice) return null

  const services = getInvoiceServiceDetails(invoice)
  const serviceTotal = getInvoiceServiceTotal(invoice)
  const tips = Number.isFinite(invoice.tips) ? invoice.tips : 0

  return (
    <div className="invoice-detail-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-detail-title">
      <button type="button" className="invoice-detail-modal__backdrop" onClick={onClose} aria-label="Đóng" />
      <div className="invoice-detail-modal__panel">
        <header className="invoice-detail-modal__header">
          <div>
            <h3 id="invoice-detail-title">Chi tiết hóa đơn</h3>
            <p>{invoice.date} · {readInvoiceTime(invoice)} · {invoice.branchName}</p>
          </div>
          <button type="button" className="invoice-detail-modal__close" onClick={onClose}>×</button>
        </header>

        <div className="invoice-detail-modal__body">
          <section className="invoice-detail-modal__section">
            <h4>Nhân viên & khách</h4>
            <dl className="invoice-detail-modal__grid">
              <div><dt>Nhân viên thực hiện</dt><dd>{invoice.employeeName || '—'}</dd></div>
              <div><dt>Nhân viên hỗ trợ/tư vấn</dt><dd>{invoice.supportEmployeeName || '—'}</dd></div>
              <div><dt>Tên khách</dt><dd>{invoice.customerName || '—'}</dd></div>
              <div><dt>SĐT khách</dt><dd>{invoice.customerPhone || '—'}</dd></div>
            </dl>
          </section>

          <section className="invoice-detail-modal__section">
            <h4>Dịch vụ</h4>
            {services.length === 0 ? (
              <p className="invoice-detail-modal__empty">—</p>
            ) : (
              <ul className="invoice-detail-modal__services">
                {services.map((service, index) => (
                  <li key={`${service.id}-${index}`}>
                    <span>{service.name}</span>
                    <span>{formatCurrency(service.price)}</span>
                    <span>HH {service.commissionPercent}% = {formatCurrency(service.commissionAmount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="invoice-detail-modal__section">
            <h4>Thanh toán</h4>
            {invoiceHasDiscount(invoice) && (
              <p className="invoice-detail-modal__promo">🎁 Khuyến mãi</p>
            )}
            <dl className="invoice-detail-modal__grid">
              <div><dt>Giá gốc dịch vụ</dt><dd>{formatCurrency(getInvoiceOriginalServiceTotal(invoice))}</dd></div>
              <div><dt>Giảm giá</dt><dd>−{formatCurrency(getInvoiceDiscountAmount(invoice))}</dd></div>
              <div><dt>Giá thực thu (dịch vụ)</dt><dd>{formatCurrency(serviceTotal)}</dd></div>
              <div><dt>Tips</dt><dd>{formatCurrency(tips)}</dd></div>
              <div><dt>Tổng khách thanh toán</dt><dd className="invoice-detail-modal__total">{formatCurrency(invoice.total)}</dd></div>
              <div><dt>Hoa hồng</dt><dd className="invoice-detail-modal__commission">{formatCurrency(invoice.commission)}</dd></div>
              <div><dt>Phương thức</dt><dd>{getPaymentMethodLabel(invoice.paymentMethod)}</dd></div>
              <div><dt>Ghi chú</dt><dd>{invoice.note || '—'}</dd></div>
            </dl>
          </section>

          <section className="invoice-detail-modal__section">
            <h4>Hệ thống</h4>
            <dl className="invoice-detail-modal__grid">
              <div><dt>Người nhập</dt><dd>{invoice.enteredBy || '—'}</dd></div>
              <div><dt>Thời gian tạo</dt><dd>{formatInvoiceDateTime(invoice.createdAt)}</dd></div>
              <div><dt>Thời gian cập nhật</dt><dd>{formatInvoiceDateTime(invoice.updatedAt)}</dd></div>
            </dl>
          </section>
        </div>

        <footer className="invoice-detail-modal__footer">
          {canEdit?.(invoice) && (
            <button type="button" className="invoice-detail-modal__edit" onClick={() => onEdit?.(invoice)}>
              Sửa hóa đơn
            </button>
          )}
          <button type="button" className="invoice-detail-modal__close-btn" onClick={onClose}>
            Đóng
          </button>
        </footer>
      </div>
    </div>
  )
}
