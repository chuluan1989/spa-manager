import { getActiveBranches } from '../../constants/branches'
import { EXPENSE_TYPES } from '../../constants/expenseTypes'
import { canSelectBranch } from '../../constants/auth'
import './ExpenseModules.css'

const EMPTY_FILTERS = {
  fromDate: '',
  toDate: '',
  branchId: '',
  expenseType: '',
}

export default function ExpenseFilters({
  draftFilters,
  appliedFilters,
  onChange,
  onSearch,
  onReset,
  onExport,
  expenseTypes = EXPENSE_TYPES,
}) {
  return (
    <section className="exp-mod__filters">
      <div className="exp-mod__filters-grid">
        <label className="exp-mod__filter-field">
          <span>Từ ngày</span>
          <input
            type="date"
            value={draftFilters.fromDate}
            onChange={(e) => onChange({ ...draftFilters, fromDate: e.target.value })}
          />
        </label>
        <label className="exp-mod__filter-field">
          <span>Đến ngày</span>
          <input
            type="date"
            value={draftFilters.toDate}
            onChange={(e) => onChange({ ...draftFilters, toDate: e.target.value })}
          />
        </label>
        {canSelectBranch() && (
          <label className="exp-mod__filter-field">
            <span>Chi nhánh</span>
            <select
              value={draftFilters.branchId}
              onChange={(e) => onChange({ ...draftFilters, branchId: e.target.value })}
            >
              <option value="">Tất cả chi nhánh</option>
              {getActiveBranches().map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="exp-mod__filter-field">
          <span>Nhóm chi phí</span>
          <select
            value={draftFilters.expenseType}
            onChange={(e) => onChange({ ...draftFilters, expenseType: e.target.value })}
          >
            <option value="">Tất cả nhóm</option>
            {expenseTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="exp-mod__filter-actions">
        <button type="button" className="exp-mod__btn exp-mod__btn--primary" onClick={onSearch}>
          Tìm
        </button>
        <button type="button" className="exp-mod__btn" onClick={onReset}>
          Làm mới
        </button>
        <button type="button" className="exp-mod__btn exp-mod__btn--export" onClick={onExport}>
          Xuất Excel
        </button>
      </div>
      {appliedFilters && (
        <p className="exp-mod__filter-meta">
          Đang lọc: {appliedFilters.fromDate || '—'} → {appliedFilters.toDate || '—'}
          {appliedFilters.branchId ? ` · Chi nhánh đã chọn` : ''}
          {appliedFilters.expenseType ? ` · Nhóm đã chọn` : ''}
        </p>
      )}
    </section>
  )
}

export { EMPTY_FILTERS }
