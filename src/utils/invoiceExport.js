import { getInvoicePayment, getInvoiceServiceCommission, getInvoiceTips } from './invoice'
import { getPaymentMethodLabel } from '../constants/paymentMethods'
import { downloadCsv } from './csvExport'

export function exportInvoicesCsv(invoices, filters = {}) {
  const suffix = [filters.fromDate, filters.toDate, filters.branchId].filter(Boolean).join('_') || 'all'
  downloadCsv(`hoa-don-${suffix}`, [
    [
      'Ngày',
      'Giờ',
      'Chi nhánh',
      'Nhân viên',
      'Khách hàng',
      'SĐT',
      'Dịch vụ',
      'Giá vé',
      'Khuyến mãi',
      'Thanh toán',
      'Tips',
      'Hoa hồng',
      'Phương thức thanh toán',
      'Ghi chú',
    ],
    ...invoices.map((inv) => {
      const services = (inv.services ?? []).map((s) => s.name ?? s.id).join('; ')
      return [
        inv.date,
        inv.invoiceTime ?? '',
        inv.branchName ?? inv.branchId,
        inv.employeeName ?? inv.employeeId,
        inv.customerName ?? '',
        inv.customerPhone ?? '',
        services,
        inv.originalServiceTotal ?? inv.serviceTotal ?? 0,
        inv.discountAmount ?? inv.discount ?? 0,
        getInvoicePayment(inv),
        getInvoiceTips(inv),
        getInvoiceServiceCommission(inv),
        getPaymentMethodLabel(inv.paymentMethod),
        inv.note ?? '',
      ]
    }),
  ])
}
