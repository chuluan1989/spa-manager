import { useMemo, useState } from 'react'
import { canSelectBranch, getCurrentUserBranch, isAdmin } from '../../constants/auth'
import { getBranchName } from '../../utils/branchStorage'
import {
  computeProfileCompletionPercent,
  filterEmployeesByProfileCompliance,
  formatProfileDeadlineDisplay,
  getEmployeeProfileCompliance,
  getProfileComplianceFilterStatus,
} from '../../utils/employeeProfilePolicy'
import { getEmployeeProfileStatus } from '../../utils/employeeStorage'

const FILTER_OPTIONS = [
  { value: '', label: 'Tất cả hồ sơ' },
  { value: 'complete', label: 'Đã hoàn thành' },
  { value: 'incomplete', label: 'Chưa hoàn thành' },
  { value: 'overdue', label: 'Quá hạn' },
]

function formatUpdatedAt(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function EmployeeProfileCompliancePanel({ employees, branchId = '' }) {
  const [profileFilter, setProfileFilter] = useState('')

  const scopedEmployees = useMemo(() => {
    let rows = employees.filter((emp) => emp.status !== 'archived')
    if (branchId) rows = rows.filter((emp) => emp.branchId === branchId)
    else if (!canSelectBranch()) {
      rows = rows.filter((emp) => emp.branchId === getCurrentUserBranch())
    }
    return filterEmployeesByProfileCompliance(rows, profileFilter)
  }, [employees, branchId, profileFilter])

  return (
    <section className="employee-profile-compliance">
      <header className="employee-profile-compliance__head">
        <div>
          <h3>Theo dõi hoàn thiện hồ sơ</h3>
          <p>Hạn cập nhật: {formatProfileDeadlineDisplay()}</p>
        </div>
        <label>
          Lọc hồ sơ
          <select value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)}>
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="employee-profile-compliance__table-wrap">
        <table className="employee-profile-compliance__table">
          <thead>
            <tr>
              <th>Tên</th>
              {isAdmin() && !branchId && <th>Chi nhánh</th>}
              <th>Hoàn thành</th>
              <th>Cập nhật cuối</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {scopedEmployees.length === 0 ? (
              <tr>
                <td colSpan={isAdmin() && !branchId ? 5 : 4}>Không có nhân viên phù hợp.</td>
              </tr>
            ) : scopedEmployees.map((employee) => {
              const filterStatus = getProfileComplianceFilterStatus(employee)
              return (
                <tr key={employee.id}>
                  <td>{employee.name || '—'}</td>
                  {isAdmin() && !branchId && <td>{getBranchName(employee.branchId)}</td>}
                  <td>{computeProfileCompletionPercent(employee)}%</td>
                  <td>{formatUpdatedAt(employee.updatedAt)}</td>
                  <td>
                    <span className={`employee-profile-compliance__badge employee-profile-compliance__badge--${filterStatus}`}>
                      {filterStatus === 'overdue'
                        ? 'Quá hạn'
                        : getEmployeeProfileStatus(employee).label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
