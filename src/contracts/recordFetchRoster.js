/**
 * Branch roster contract — current branch + record-branch activity in period.
 * @see docs/employee-lifecycle-v1.md
 */

import {
  collectEmployeeIdsWithRecordBranchActivity,
  employeeCurrentlyAtBranch,
} from '../utils/employeeBranchTimeline'

/**
 * Employee IDs visible to a branch manager in a period:
 * - currently assigned to branch (Current Branch)
 * - OR has invoice/attendance/etc. at branch (Record Branch) in supplied activity records
 */
export function buildBranchRosterEmployeeIds({
  branchId,
  employees = [],
  activityRecords = [],
  employeeIdField = 'employeeId',
} = {}) {
  const ids = new Set()
  if (!branchId) {
    for (const employee of employees) {
      if (employee?.id) ids.add(employee.id)
    }
    return ids
  }

  for (const employee of employees) {
    if (employee?.id && employeeCurrentlyAtBranch(employee, branchId)) {
      ids.add(employee.id)
    }
  }

  for (const id of collectEmployeeIdsWithRecordBranchActivity(branchId, activityRecords, employeeIdField)) {
    ids.add(id)
  }

  return ids
}

export function filterEmployeesForBranchRoster({
  employees = [],
  branchId = '',
  activityRecords = [],
} = {}) {
  if (!branchId) return employees
  const ids = buildBranchRosterEmployeeIds({ branchId, employees, activityRecords })
  return employees.filter((employee) => ids.has(employee.id))
}
