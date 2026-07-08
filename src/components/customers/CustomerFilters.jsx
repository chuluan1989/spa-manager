import { isAdmin } from '../../constants/auth'
import { loadBranches } from '../../utils/branchStorage'
import { loadEmployees } from '../../utils/employeeStorage'
import {
  CUSTOMER_SEGMENT_LABELS,
  CUSTOMER_SEGMENTS,
} from '../../constants/customerTypes'

export default function CustomerFilters({
  filters,
  onChange,
  onApply,
  onReset,
}) {
  const branches = loadBranches().filter((branch) => branch.status !== 'inactive')
  const employees = loadEmployees()

  const update = (key, value) => onChange({ ...filters, [key]: value })

  return (
    <section className="crm-filters">
      <div className="crm-filters__row">
        <label className="crm-filters__field crm-filters__field--grow">
          <span>Tìm kiếm</span>
          <input
            type="search"
            placeholder="Tên hoặc SĐT..."
            value={filters.query}
            onChange={(event) => update('query', event.target.value)}
          />
        </label>
        {isAdmin() && (
          <label className="crm-filters__field">
            <span>Chi nhánh</span>
            <select value={filters.branchId} onChange={(event) => update('branchId', event.target.value)}>
              <option value="">Tất cả</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="crm-filters__field">
          <span>Nhân viên</span>
          <select value={filters.employeeId} onChange={(event) => update('employeeId', event.target.value)}>
            <option value="">Tất cả</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="crm-filters__row">
        <label className="crm-filters__field">
          <span>Dịch vụ</span>
          <input
            type="text"
            placeholder="Tên dịch vụ..."
            value={filters.serviceQuery}
            onChange={(event) => update('serviceQuery', event.target.value)}
          />
        </label>
        <label className="crm-filters__field">
          <span>Phân loại</span>
          <select value={filters.segment} onChange={(event) => update('segment', event.target.value)}>
            <option value="">Tất cả</option>
            {Object.values(CUSTOMER_SEGMENTS).map((segment) => (
              <option key={segment} value={segment}>{CUSTOMER_SEGMENT_LABELS[segment]}</option>
            ))}
          </select>
        </label>
        <label className="crm-filters__field">
          <span>Từ ngày</span>
          <input type="date" value={filters.fromDate} onChange={(event) => update('fromDate', event.target.value)} />
        </label>
        <label className="crm-filters__field">
          <span>Đến ngày</span>
          <input type="date" value={filters.toDate} onChange={(event) => update('toDate', event.target.value)} />
        </label>
      </div>

      <div className="crm-filters__actions">
        <button type="button" className="crm-btn crm-btn--primary" onClick={onApply}>Áp dụng lọc</button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onReset}>Xóa lọc</button>
      </div>
    </section>
  )
}
