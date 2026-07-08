import { getActiveBranches } from '../../constants/branches'
import { canSelectBranch } from '../../constants/auth'
import { loadEmployees } from '../../utils/employeeStorage'

export default function PayrollFilters({
  month,
  branchId,
  employeeId,
  onMonthChange,
  onBranchChange,
  onEmployeeChange,
}) {
  const branches = getActiveBranches()
  const employees = loadEmployees().filter((emp) => {
    if (emp.status === 'inactive' || emp.status === 'archived') return false
    if (branchId && emp.branchId !== branchId) return false
    return true
  })

  return (
    <div className="salary-page__filters">
      <label>
        Tháng
        <input type="month" value={month} onChange={(e) => onMonthChange(e.target.value)} />
      </label>
      {canSelectBranch() && (
        <label>
          Chi nhánh
          <select value={branchId} onChange={(e) => onBranchChange(e.target.value)}>
            <option value="">Tất cả chi nhánh</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        Nhân viên
        <select value={employeeId} onChange={(e) => onEmployeeChange(e.target.value)}>
          <option value="">Tất cả nhân viên</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.name}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
