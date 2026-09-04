import { Download, FileText, Pencil, Trash2 } from 'lucide-react'
import InvoiceDetailModal from '../invoice/InvoiceDetailModal'
import { formatCurrency } from '../../utils/invoice'
import { exportEmployeeReportCsv, exportEmployeeReportPdf } from '../../utils/employeeReportExport'

function InvoiceRow({ item, onView, onEdit, onDelete, allowDelete }) {
  return (
    <article className="employee-invoice-row">
      <button type="button" className="employee-invoice-row__main" onClick={() => onView(item.invoice)}>
        <div className="employee-invoice-row__time">{item.invoiceTime}</div>
        <div className="employee-invoice-row__grid">
          <div className="employee-invoice-row__field">
            <span className="employee-invoice-row__label">Khách</span>
            <span className="employee-invoice-row__value">{item.customerName}</span>
            {item.customerRequested && (
              <span className="employee-invoice-row__request-badge">Khách yêu cầu</span>
            )}
          </div>
          <div className="employee-invoice-row__field employee-invoice-row__field--wide">
            <span className="employee-invoice-row__label">Dịch vụ</span>
            <span className="employee-invoice-row__value">{item.serviceNames}</span>
          </div>
          <div className="employee-invoice-row__field">
            <span className="employee-invoice-row__label">Giá vé</span>
            <span className="employee-invoice-row__value">{formatCurrency(item.ticketPrice)}</span>
          </div>
          <div className="employee-invoice-row__field">
            <span className="employee-invoice-row__label">Khuyến mãi</span>
            <span className="employee-invoice-row__value employee-invoice-row__discount">
              {formatCurrency(item.discount)}
            </span>
          </div>
          <div className="employee-invoice-row__field">
            <span className="employee-invoice-row__label">Doanh thu tiền vé</span>
            <span className="employee-invoice-row__value employee-invoice-row__payment">
              {formatCurrency(item.payment)}
            </span>
          </div>
          <div className="employee-invoice-row__field">
            <span className="employee-invoice-row__label">Tips</span>
            <span className="employee-invoice-row__value employee-invoice-row__tips">
              {formatCurrency(item.tips)}
            </span>
          </div>
          <div className="employee-invoice-row__field">
            <span className="employee-invoice-row__label">Phương thức thanh toán</span>
            <span className="employee-invoice-row__value">{item.paymentMethodLabel || 'Chưa xác định'}</span>
          </div>
          <div className="employee-invoice-row__field">
            <span className="employee-invoice-row__label">Hoa hồng</span>
            <span className="employee-invoice-row__value employee-invoice-row__commission">
              {formatCurrency(item.commission)}
            </span>
          </div>
        </div>
        {item.roleLabel === 'Hỗ trợ' && (
          <span className="employee-invoice-row__role">NV hỗ trợ</span>
        )}
      </button>
      <div className="employee-invoice-row__actions">
        <button type="button" className="employee-invoice-row__action" onClick={() => onEdit(item.invoice)} title="Sửa">
          <Pencil size={16} />
        </button>
        {allowDelete && (
          <button type="button" className="employee-invoice-row__action employee-invoice-row__action--danger" onClick={() => onDelete(item.invoice)} title="Xóa">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </article>
  )
}

export default function AdminEmployeeDetail({
  detail,
  attendanceBreakdown,
  onClose,
  onEdit,
  onDelete,
  allowDelete,
  detailInvoice,
  onViewInvoice,
  onCloseDetail,
  canEditInvoice,
}) {
  if (!detail) return null

  return (
    <section className="admin-employee-report__detail">
      <div className="admin-employee-report__detail-header">
        <div>
          <h3>Chi tiết: {detail.employeeName}</h3>
          <p>
            {detail.branchName} — {detail.cycleLabel}
          </p>
        </div>
        <div className="admin-employee-report__detail-actions">
          <button type="button" className="admin-employee-report__export-btn" onClick={() => exportEmployeeReportCsv(detail)}>
            <Download size={16} />
            Xuất Excel
          </button>
          <button type="button" className="admin-employee-report__export-btn" onClick={() => exportEmployeeReportPdf(detail)}>
            <FileText size={16} />
            Xuất PDF
          </button>
          <button type="button" className="admin-employee-report__close-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>

      {attendanceBreakdown && (
        <div className="salary-report__period-total">
          <h4 className="salary-report__period-total-title">Khấu trừ chấm công — Kỳ 2</h4>
          <div className="salary-report__period-total-grid">
            <div><span>Nghỉ có phép ngày thường (ngày)</span><strong>{attendanceBreakdown.permittedDays}</strong></div>
            <div><span>Miễn trừ (tối đa 3 ngày)</span><strong>{attendanceBreakdown.permittedFreeDays}</strong></div>
            <div><span>Vượt hạn mức (ngày)</span><strong>{attendanceBreakdown.permittedExceedDays}</strong></div>
            <div><span>Nghỉ không phép ngày thường (ngày)</span><strong>{attendanceBreakdown.unpermittedDays}</strong></div>
            <div><span>Đi trễ (2h không phép)</span><strong>{attendanceBreakdown.lateUnpermittedCount}</strong></div>
            <div><span>Về sớm (2h không phép)</span><strong>{attendanceBreakdown.earlyUnpermittedCount}</strong></div>
            <div><span>Nghỉ T7/CN/Lễ (ngày)</span><strong>{attendanceBreakdown.weekendHolidayDays}</strong></div>
            <div><span>Tổng khấu trừ chấm công</span><strong>{formatCurrency(attendanceBreakdown.totalPenalty)}</strong></div>
            <div><span>Thực nhận Kỳ 2</span><strong>{formatCurrency(attendanceBreakdown.netSalary)}</strong></div>
          </div>
        </div>
      )}

      {detail.days.length === 0 ? (
        <p className="report-table-card__empty">Chưa có hóa đơn trong kỳ này</p>
      ) : (
        <>
          {detail.days.map((day) => (
            <article key={day.date} className="employee-report-day">
              <h4 className="employee-report-day__title">Ngày {day.displayDate}</h4>

              <div className="employee-report-day__invoices">
                {day.invoices.map((item) => (
                  <InvoiceRow
                    key={item.invoiceId}
                    item={item}
                    onView={onViewInvoice}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    allowDelete={allowDelete}
                  />
                ))}
              </div>

              <div className="employee-report-day__totals">
                <div><span>Tổng hóa đơn</span><strong>{day.invoiceCount}</strong></div>
                <div><span>Khách yêu cầu</span><strong>{day.customerRequestedCount ?? 0}</strong></div>
                <div><span>Doanh thu tiền vé</span><strong>{formatCurrency(day.serviceRevenue)}</strong></div>
                <div><span>Tổng Tips</span><strong className="employee-invoice-row__tips">{formatCurrency(day.tips)}</strong></div>
                <div><span>Tổng hoa hồng</span><strong className="employee-invoice-row__commission">{formatCurrency(day.serviceCommission)}</strong></div>
                <div><span>Tổng lương ngày</span><strong className="salary-report__salary">{formatCurrency(day.totalSalary)}</strong></div>
              </div>
            </article>
          ))}

          <div className="salary-report__period-total">
            <h4 className="salary-report__period-total-title">Tổng cuối kỳ — {detail.employeeName}</h4>
            <div className="salary-report__period-total-grid">
              <div><span>Doanh thu tiền vé</span><strong>{formatCurrency(detail.periodTotals.serviceRevenue)}</strong></div>
              <div><span>Khách yêu cầu</span><strong>{detail.periodTotals.customerRequestedCount ?? 0}</strong></div>
              <div><span>Tour hỗ trợ liên CN</span><strong>{detail.periodTotals.crossBranchSupportTourCount ?? 0}</strong></div>
              <div><span>DT hỗ trợ liên CN</span><strong>{formatCurrency(detail.periodTotals.crossBranchSupportRevenue ?? 0)}</strong></div>
              <div><span>Tổng Tips</span><strong className="employee-invoice-row__tips">{formatCurrency(detail.periodTotals.tips)}</strong></div>
              <div><span>Tiền mặt</span><strong>{formatCurrency(detail.periodTotals.cashAmount ?? 0)}</strong></div>
              <div><span>Chuyển khoản</span><strong>{formatCurrency(detail.periodTotals.bankTransferAmount ?? 0)}</strong></div>
              <div><span>Tổng thu</span><strong>{formatCurrency(detail.periodTotals.totalCollected ?? 0)}</strong></div>
              <div><span>Số HĐ tiền mặt</span><strong>{detail.periodTotals.cashCount ?? 0}</strong></div>
              <div><span>Số HĐ chuyển khoản</span><strong>{detail.periodTotals.bankTransferCount ?? 0}</strong></div>
              <div><span>Tổng hoa hồng</span><strong className="salary-report__commission">{formatCurrency(detail.periodTotals.serviceCommission)}</strong></div>
              <div><span>Tổng lương</span><strong className="salary-report__salary">{formatCurrency(detail.periodTotals.totalSalary)}</strong></div>
            </div>
          </div>
        </>
      )}

      <InvoiceDetailModal
        invoice={detailInvoice}
        onClose={onCloseDetail}
        onEdit={onEdit}
        canEdit={canEditInvoice}
      />
    </section>
  )
}
