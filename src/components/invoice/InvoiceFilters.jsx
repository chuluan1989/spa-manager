import BranchBanner from '../common/BranchBanner'
import { canSelectBranch } from '../../constants/auth'
import { loadBranches } from '../../constants/branches'
import { getActiveEmployeesByBranch, getAllActiveEmployees } from '../../utils/employeeStorage'
import { PAYMENT_METHOD_OPTIONS } from '../../utils/invoiceFilters'
import './InvoiceFilters.css'

export default function InvoiceFilters({
  filters,
  onChange,
  onReset,
  lockedBranch = false,
  branchName = '',
  resultCount = 0,
  serviceOptions = [],
}) {
  const branchEmployees = filters.branchId
    ? getActiveEmployeesByBranch(filters.branchId)
    : getAllActiveEmployees()

  const update = (field, value) => {
    if (field === 'branchId') {
      onChange({ ...filters, branchId: value, employeeId: '', serviceId: '' })
      return
    }
    onChange({ ...filters, [field]: value })
  }

  return (
    <section className="invoice-filters">
      <div className="invoice-filters__header">
        <h3 className="invoice-filters__title">Bộ lọc hóa đơn</h3>
        <span className="invoice-filters__count">{resultCount} hóa đơn phù hợp</span>
      </div>

      <div className="invoice-filters__grid">
        {lockedBranch && (
          <div className="invoice-filters__field invoice-filters__field--banner">
            <BranchBanner branchName={branchName} />
          </div>
        )}

        <label className="invoice-filters__field">
          <span>Từ ngày</span>
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => update('fromDate', e.target.value)}
          />
        </label>

        <label className="invoice-filters__field">
          <span>Đến ngày</span>
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => update('toDate', e.target.value)}
          />
        </label>

        {canSelectBranch() && (
          <label className="invoice-filters__field">
            <span>Chi nhánh</span>
            <select value={filters.branchId} onChange={(e) => update('branchId', e.target.value)}>
              <option value="">Tất cả chi nhánh</option>
              {loadBranches().map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="invoice-filters__field">
          <span>Nhân viên</span>
          <select value={filters.employeeId} onChange={(e) => update('employeeId', e.target.value)}>
            <option value="">Tất cả nhân viên</option>
            {branchEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
        </label>

        <label className="invoice-filters__field">
          <span>Dịch vụ</span>
          <select value={filters.serviceId} onChange={(e) => update('serviceId', e.target.value)}>
            <option value="">Tất cả dịch vụ</option>
            {serviceOptions.map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
        </label>

        <label className="invoice-filters__field">
          <span>Phương thức thanh toán</span>
          <select value={filters.paymentMethod} onChange={(e) => update('paymentMethod', e.target.value)}>
            {PAYMENT_METHOD_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="invoice-filters__field">
          <span>Khuyến mãi</span>
          <select value={filters.discountFilter} onChange={(e) => update('discountFilter', e.target.value)}>
            <option value="">Tất cả hóa đơn</option>
            <option value="with">Chỉ có giảm giá</option>
            <option value="without">Không giảm giá</option>
          </select>
        </label>

        <label className="invoice-filters__field invoice-filters__field--search">
          <span>Tìm tên khách / SĐT</span>
          <input
            type="search"
            placeholder="Nhập tên hoặc số điện thoại..."
            value={filters.search}
            onChange={(e) => update('search', e.target.value)}
          />
        </label>
      </div>

      <div className="invoice-filters__actions">
        <button type="button" className="invoice-filters__reset" onClick={onReset}>
          Xóa bộ lọc
        </button>
      </div>
    </section>
  )
}
