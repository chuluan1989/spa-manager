import { getActiveBranches } from '../../constants/branches'
import { canSelectBranch } from '../../constants/auth'
import './ExpenseModules.css'

export default function ExpenseFilters({
  draftFilters,
  onChange,
  onSearch,
  onReset,
  onExport,
  expenseTypes = [],
  enteredByOptions = [],
  monthValue = '',
  onMonthChange,
}) {
  return (
    <section className="exp-mod__filters exp-mod__filters--unified">
      <div className="exp-mod__filters-grid">
        <label className="exp-mod__filter-field">
          <span>Tháng</span>
          <input
            type="month"
            value={monthValue}
            onChange={(e) => onMonthChange?.(e.target.value)}
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
        <label className="exp-mod__filter-field">
          <span>Người nhập</span>
          <select
            value={draftFilters.enteredBy || ''}
            onChange={(e) => onChange({ ...draftFilters, enteredBy: e.target.value })}
          >
            <option value="">Tất cả</option>
            {enteredByOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="exp-mod__filter-field exp-mod__filter-field--search">
          <span>Tìm kiếm</span>
          <input
            type="search"
            placeholder="Nội dung, ghi chú…"
            value={draftFilters.search || ''}
            onChange={(e) => onChange({ ...draftFilters, search: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') onSearch?.() }}
          />
        </label>
      </div>
      <div className="exp-mod__filter-actions">
        <button type="button" className="exp-mod__btn exp-mod__btn--primary" onClick={onSearch}>Lọc</button>
        <button type="button" className="exp-mod__btn" onClick={onReset}>Làm mới</button>
        <button type="button" className="exp-mod__btn exp-mod__btn--export" onClick={onExport}>Xuất Excel</button>
      </div>
    </section>
  )
}
