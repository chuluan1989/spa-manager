import BranchBanner from '../common/BranchBanner'
import { canSelectBranch } from '../../constants/auth'
import ExportActions from '../common/ExportActions'
import { loadBranches } from '../../constants/branches'
import { getActiveEmployeesByBranch, getAllActiveEmployees } from '../../utils/employeeStorage'
import { getMonthStartDate, getTodayDate } from '../../utils/invoiceStorage'
import './InvoiceFilters.css'

export default function InvoiceFilters({
  filters,
  onChange,
  onReset,
  onExport,
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

  const applyToday = () => {
    const today = getTodayDate()
    onChange({ ...filters, fromDate: today, toDate: today })
  }

  const applyThisMonth = () => {
    onChange({
      ...filters,
      fromDate: getMonthStartDate(),
      toDate: getTodayDate(),
    })
  }

  const applyAll = () => {
    onChange({ ...filters, fromDate: '', toDate: '' })
  }

  return (
    <section className="invoice-filters">
      <div className="invoice-filters__header">
        <h3 className="invoice-filters__title">Bộ lọc</h3>
        <span className="invoice-filters__count">{resultCount} hóa đơn</span>
      </div>

      <div className="invoice-filters__presets">
        <button type="button" className="invoice-filters__preset" onClick={applyToday}>
          Hôm nay
        </button>
        <button type="button" className="invoice-filters__preset" onClick={applyThisMonth}>
          Tháng này
        </button>
        <button type="button" className="invoice-filters__preset" onClick={applyAll}>
          Tất cả
        </button>
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

        <label className="invoice-filters__field invoice-filters__field--search">
          <span>Tìm kiếm</span>
          <input
            type="search"
            placeholder="Mã HĐ, tên khách, SĐT, ghi chú..."
            value={filters.search}
            onChange={(e) => update('search', e.target.value)}
          />
        </label>
      </div>

      <div className="invoice-filters__actions">
        <button type="button" className="invoice-filters__reset" onClick={onReset}>
          Xóa bộ lọc
        </button>
        {onExport && <ExportActions onExportExcel={onExport} className="invoice-filters__export" />}
      </div>
    </section>
  )
}
