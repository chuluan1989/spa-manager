import BranchBanner from '../common/BranchBanner'
import { canSelectBranch, isBranchManager } from '../../constants/auth'
import ExportActions from '../common/ExportActions'
import { loadBranches } from '../../constants/branches'
import { getActiveEmployeesByBranch, getAllActiveEmployees } from '../../utils/employeeStorage'
import { getMonthStartDate, getTodayDate } from '../../utils/invoiceStorage'
import {
  BRANCH_FILTER_MODE_OPTIONS,
  BRANCH_FILTER_MODES,
  PAYMENT_METHOD_OPTIONS,
} from '../../utils/invoiceFilters'
import {
  getDefaultPayCycleForVietnamDate,
  getPayPeriodRange,
  getPrevPayCycle,
  getVietnamCurrentMonthValue,
  PAY_CYCLE_OPTIONS,
  PAY_CYCLES,
  shiftMonthValue,
} from '../../utils/salaryReport'
import './InvoiceFilters.css'

function monthFromFilters(filters) {
  if (filters?.month) return filters.month
  if (filters?.fromDate && filters.fromDate.length >= 7) return filters.fromDate.slice(0, 7)
  return getVietnamCurrentMonthValue()
}

export default function InvoiceFilters({
  filters,
  onChange,
  onReset,
  onExport,
  lockedBranch = false,
  branchName = '',
  resultCount = 0,
  serviceOptions = [],
  managerHistoryScope = false,
}) {
  const branchEmployees = filters.branchId
    ? getActiveEmployeesByBranch(filters.branchId)
    : getAllActiveEmployees()
  const employeeSelected = Boolean(filters.employeeId)
  const branchSelected = Boolean(filters.branchId)
  const selectedBranchName = branchName
    || loadBranches().find((b) => b.id === filters.branchId)?.name
    || filters.branchId
  const selectedMonth = monthFromFilters(filters)
  const selectedCycle = filters.cycle || PAY_CYCLES.FULL
  const showManagerHistoryHint = managerHistoryScope || isBranchManager()

  const update = (field, value) => {
    if (field === 'branchId') {
      onChange({ ...filters, branchId: value, employeeId: '', serviceId: '' })
      return
    }
    onChange({ ...filters, [field]: value })
  }

  const applyRange = (patch) => {
    onChange({ ...filters, ...patch })
  }

  const applyMonthCycle = (month, cycle) => {
    const nextCycle = cycle || PAY_CYCLES.FULL
    const range = getPayPeriodRange(month, nextCycle)
    applyRange({
      month,
      cycle: nextCycle,
      fromDate: range.fromDate,
      toDate: range.toDate,
    })
  }

  const applyToday = () => {
    const today = getTodayDate()
    applyRange({
      fromDate: today,
      toDate: today,
      month: today.slice(0, 7),
      cycle: '',
    })
  }

  const applyThisMonth = () => {
    const month = getVietnamCurrentMonthValue()
    applyRange({
      month,
      cycle: PAY_CYCLES.FULL,
      fromDate: getMonthStartDate(),
      toDate: getTodayDate(),
    })
  }

  const applyPrevMonth = () => {
    const month = shiftMonthValue(getVietnamCurrentMonthValue(), -1)
    applyMonthCycle(month, PAY_CYCLES.FULL)
  }

  const applyPrevCycle = () => {
    const current = getPrevPayCycle(
      getVietnamCurrentMonthValue(),
      getDefaultPayCycleForVietnamDate(),
    )
    applyMonthCycle(current.month, current.cycle)
  }

  const applyAll = () => {
    applyRange({ fromDate: '', toDate: '', cycle: '' })
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
        <button
          type="button"
          className="invoice-filters__preset"
          data-testid="invoice-preset-prev-month"
          onClick={applyPrevMonth}
        >
          Tháng trước
        </button>
        <button
          type="button"
          className="invoice-filters__preset"
          data-testid="invoice-preset-prev-cycle"
          onClick={applyPrevCycle}
        >
          Kỳ trước
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
          <span>Tháng</span>
          <input
            type="month"
            data-testid="invoice-filter-month"
            value={selectedMonth}
            onChange={(e) => applyMonthCycle(e.target.value, selectedCycle || PAY_CYCLES.FULL)}
          />
        </label>

        <label className="invoice-filters__field">
          <span>Kỳ lương</span>
          <select
            data-testid="invoice-filter-cycle"
            value={selectedCycle}
            onChange={(e) => applyMonthCycle(selectedMonth, e.target.value)}
          >
            {PAY_CYCLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label className="invoice-filters__field">
          <span>Từ ngày</span>
          <input
            type="date"
            data-testid="invoice-filter-from"
            value={filters.fromDate}
            onChange={(e) => update('fromDate', e.target.value)}
          />
        </label>

        <label className="invoice-filters__field">
          <span>Đến ngày</span>
          <input
            type="date"
            data-testid="invoice-filter-to"
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

        {canSelectBranch() && (
          <label className="invoice-filters__field">
            <span>Lọc chi nhánh theo</span>
            <select
              value={filters.branchFilterMode || BRANCH_FILTER_MODES.SERVING}
              onChange={(e) => update('branchFilterMode', e.target.value)}
            >
              {BRANCH_FILTER_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        )}

        <label className="invoice-filters__field">
          <span>Nhân viên</span>
          <select
            data-testid="invoice-filter-employee"
            value={filters.employeeId}
            onChange={(e) => update('employeeId', e.target.value)}
          >
            <option value="">Tất cả nhân viên</option>
            {branchEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
        </label>

        <label className="invoice-filters__field">
          <span>Phương thức TT</span>
          <select
            value={filters.paymentMethod || ''}
            onChange={(e) => update('paymentMethod', e.target.value)}
          >
            {PAYMENT_METHOD_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
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

      <p className="invoice-filters__hint invoice-filters__hint--scope" role="note">
        {showManagerHistoryHint && !employeeSelected ? (
          <>
            Phạm vi xem: <strong>nhân viên thuộc chi nhánh mình</strong>
            {selectedBranchName ? ` (${selectedBranchName})` : ''}
            {' '}— gồm hóa đơn phục vụ chi nhánh khác. Chỉ xem lịch sử; kỳ đã chốt không sửa/xóa tại đây.
          </>
        ) : employeeSelected ? (
          <>
            Phạm vi bộ lọc đang áp dụng: <strong>Đang lọc theo nhân viên</strong>
            {' '}— danh sách hóa đơn theo NV đã chọn. Không mặc định bằng tổng thu nhập đa chi nhánh trên màn Lương.
          </>
        ) : branchSelected || lockedBranch ? (
          <>
            Phạm vi bộ lọc đang áp dụng: <strong>Chi nhánh hiện tại</strong>
            {selectedBranchName ? ` (${selectedBranchName})` : ''}
            {' '}— chỉ hóa đơn khớp chi nhánh này, không phải toàn bộ thu nhập trên màn Lương.
          </>
        ) : (
          <>
            Phạm vi bộ lọc đang áp dụng: <strong>Tất cả chi nhánh</strong>
            {' '}— theo ngày / NV / dịch vụ đang chọn. Khác phạm vi “tổng thu nhập NV” trên màn Lương nếu chưa lọc cùng NV.
          </>
        )}
      </p>

      <div className="invoice-filters__actions">
        <button type="button" className="invoice-filters__reset" onClick={onReset}>
          Xóa bộ lọc
        </button>
        {onExport && <ExportActions onExportExcel={onExport} className="invoice-filters__export" />}
      </div>
    </section>
  )
}
