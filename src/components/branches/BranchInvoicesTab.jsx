import { useMemo, useState } from 'react'
import {
  formatCurrency,
  getInvoicePayment,
  getInvoiceServiceDetails,
  getInvoiceTips,
} from '../../utils/invoice'
import { readInvoiceTime } from '../../utils/invoiceFilters'
import { getCurrentMonthValue, getPayPeriodRange, PAY_CYCLES } from '../../utils/salaryReport'
import { useBranchInvoices } from './useBranchInvoices'
import BranchEmptyState from './BranchEmptyState'

export default function BranchInvoicesTab({ branchId }) {
  const [month, setMonth] = useState(getCurrentMonthValue())
  const monthRange = useMemo(() => {
    if (!month) return { fromDate: '', toDate: '' }
    const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)
    return { fromDate, toDate }
  }, [month])

  const { invoices, loading, error } = useBranchInvoices(branchId, monthRange)

  const formatServices = (invoice) => {
    const services = getInvoiceServiceDetails(invoice)
    const text = services.map((service) => service.name).join(', ')
    return text || '—'
  }

  return (
    <div className="admin-branches__invoices">
      <div className="admin-branches__filters">
        <label>
          <span>Tháng</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <p className="admin-branches__hint">branch_id: {branchId} · {invoices.length} hóa đơn</p>
      </div>

      {loading && <p className="admin-branches__hint">Đang tải hóa đơn...</p>}
      {error && <p className="admin-branches__hint admin-branches__hint--error">{error}</p>}

      {!loading && !error && invoices.length === 0 && (
        <BranchEmptyState />
      )}

      {!loading && invoices.length > 0 && (
        <div className="admin-branches__table-wrap admin-branches__table-wrap--wide">
          <table className="admin-branches__table admin-branches__table--compact">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Giờ</th>
                <th>invoice_id</th>
                <th>Nhân viên</th>
                <th>Khách</th>
                <th>Dịch vụ</th>
                <th>Tiền vé</th>
                <th>Tips</th>
                <th>Thanh toán</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.date || '—'}</td>
                  <td>{readInvoiceTime(invoice) || '—'}</td>
                  <td className="admin-branches__mono">{invoice.id}</td>
                  <td>{invoice.employeeName || invoice.employeeId || '—'}</td>
                  <td>{invoice.customerName || '—'}</td>
                  <td>{formatServices(invoice)}</td>
                  <td>{formatCurrency(invoice.serviceTotal ?? 0)}</td>
                  <td>{formatCurrency(getInvoiceTips(invoice))}</td>
                  <td>{formatCurrency(getInvoicePayment(invoice))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
