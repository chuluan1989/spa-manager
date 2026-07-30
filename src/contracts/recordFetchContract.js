/**
 * Record Fetch Contract V2 — single source for historical vs operational fetch scope.
 *
 * Resolver returns Strategy + repository filters only.
 * Repositories apply `.eq('branch_id')` / `.eq('employee_id')` from `buildRepositoryFilters`.
 *
 * @see docs/employee-lifecycle-v1.md
 */

import { ROLES } from '../constants/roles'

/** Business use cases — not tied to a specific screen. */
export const RECORD_FETCH_USE_CASES = {
  /** Employee self history, Admin drill-down by employee_id. */
  VIEW_SINGLE_EMPLOYEE_HISTORY: 'VIEW_SINGLE_EMPLOYEE_HISTORY',
  /** Manager branch reports, Admin branch filter — by record.branch_id. */
  VIEW_BRANCH_HISTORY: 'VIEW_BRANCH_HISTORY',
  /** Admin system-wide explorer. */
  VIEW_SYSTEM_HISTORY: 'VIEW_SYSTEM_HISTORY',
  /** Dashboard / today ops — current branch context. */
  TODAY_OPERATION: 'TODAY_OPERATION',
  /** New invoice, attendance check-in — current branch. */
  CREATE_RECORD: 'CREATE_RECORD',
  /** Branch employee list / roster. */
  BRANCH_ROSTER: 'BRANCH_ROSTER',
}

export const RECORD_FETCH_STRATEGIES = {
  BY_EMPLOYEE_ID: 'BY_EMPLOYEE_ID',
  BY_RECORD_BRANCH: 'BY_RECORD_BRANCH',
  BY_CURRENT_BRANCH: 'BY_CURRENT_BRANCH',
  UNRESTRICTED: 'UNRESTRICTED',
}

/**
 * @param {object} params
 * @param {string} params.useCase
 * @param {{ role?: string, branch?: string, employeeId?: string }} params.session
 * @param {string} [params.selectedBranchId]
 * @param {string} [params.selectedEmployeeId]
 * @returns {{ strategy: string, branchId: string, employeeId: string }}
 */
export function resolveRecordFetchStrategy({
  useCase,
  session = {},
  selectedBranchId = '',
  selectedEmployeeId = '',
}) {
  const role = session.role ?? ''
  const sessionBranch = session.branch ?? ''
  const sessionEmployeeId = session.employeeId ?? ''

  switch (useCase) {
    case RECORD_FETCH_USE_CASES.VIEW_SINGLE_EMPLOYEE_HISTORY: {
      if (role === ROLES.EMPLOYEE) {
        return {
          strategy: RECORD_FETCH_STRATEGIES.BY_EMPLOYEE_ID,
          branchId: '',
          employeeId: sessionEmployeeId,
        }
      }
      if (selectedEmployeeId) {
        return {
          strategy: RECORD_FETCH_STRATEGIES.BY_EMPLOYEE_ID,
          branchId: '',
          employeeId: selectedEmployeeId,
        }
      }
      if (role === ROLES.BRANCH_MANAGER) {
        return {
          strategy: RECORD_FETCH_STRATEGIES.BY_RECORD_BRANCH,
          branchId: sessionBranch,
          employeeId: '',
        }
      }
      return {
        strategy: RECORD_FETCH_STRATEGIES.BY_RECORD_BRANCH,
        branchId: selectedBranchId,
        employeeId: '',
      }
    }

    case RECORD_FETCH_USE_CASES.VIEW_BRANCH_HISTORY: {
      if (role === ROLES.EMPLOYEE) {
        return {
          strategy: RECORD_FETCH_STRATEGIES.BY_EMPLOYEE_ID,
          branchId: '',
          employeeId: sessionEmployeeId,
        }
      }
      if (role === ROLES.BRANCH_MANAGER) {
        return {
          strategy: RECORD_FETCH_STRATEGIES.BY_RECORD_BRANCH,
          branchId: sessionBranch,
          employeeId: selectedEmployeeId,
        }
      }
      if (selectedEmployeeId) {
        return {
          strategy: RECORD_FETCH_STRATEGIES.BY_EMPLOYEE_ID,
          branchId: '',
          employeeId: selectedEmployeeId,
        }
      }
      return {
        strategy: RECORD_FETCH_STRATEGIES.BY_RECORD_BRANCH,
        branchId: selectedBranchId,
        employeeId: '',
      }
    }

    case RECORD_FETCH_USE_CASES.VIEW_SYSTEM_HISTORY:
      return {
        strategy: RECORD_FETCH_STRATEGIES.UNRESTRICTED,
        branchId: selectedBranchId,
        employeeId: selectedEmployeeId,
      }

    case RECORD_FETCH_USE_CASES.TODAY_OPERATION:
    case RECORD_FETCH_USE_CASES.CREATE_RECORD: {
      if (role === ROLES.EMPLOYEE) {
        return {
          strategy: RECORD_FETCH_STRATEGIES.BY_CURRENT_BRANCH,
          branchId: sessionBranch,
          employeeId: sessionEmployeeId,
        }
      }
      if (role === ROLES.BRANCH_MANAGER) {
        return {
          strategy: RECORD_FETCH_STRATEGIES.BY_CURRENT_BRANCH,
          branchId: sessionBranch,
          employeeId: selectedEmployeeId,
        }
      }
      return {
        strategy: RECORD_FETCH_STRATEGIES.BY_CURRENT_BRANCH,
        branchId: selectedBranchId || sessionBranch,
        employeeId: selectedEmployeeId,
      }
    }

    case RECORD_FETCH_USE_CASES.BRANCH_ROSTER: {
      if (role === ROLES.ADMIN) {
        return {
          strategy: RECORD_FETCH_STRATEGIES.BY_CURRENT_BRANCH,
          branchId: selectedBranchId,
          employeeId: '',
        }
      }
      return {
        strategy: RECORD_FETCH_STRATEGIES.BY_CURRENT_BRANCH,
        branchId: sessionBranch,
        employeeId: '',
      }
    }

    default:
      return {
        strategy: RECORD_FETCH_STRATEGIES.UNRESTRICTED,
        branchId: selectedBranchId,
        employeeId: selectedEmployeeId,
      }
  }
}

/**
 * Map strategy → repository query params ({ branchId, employeeId }).
 * Record Branch is immutable — historical fetch always uses record.branch_id when strategy says so.
 */
export function buildRepositoryFilters({ strategy, branchId = '', employeeId = '' }) {
  switch (strategy) {
    case RECORD_FETCH_STRATEGIES.BY_EMPLOYEE_ID:
      return { branchId: '', employeeId }
    case RECORD_FETCH_STRATEGIES.BY_RECORD_BRANCH:
      return { branchId, employeeId: employeeId || '' }
    case RECORD_FETCH_STRATEGIES.BY_CURRENT_BRANCH:
      return { branchId, employeeId: employeeId || '' }
    case RECORD_FETCH_STRATEGIES.UNRESTRICTED:
    default:
      return { branchId: branchId || '', employeeId: employeeId || '' }
  }
}

/**
 * Resolve use case + session → repository filters in one call.
 */
export function resolveRecordFetchFilters(params) {
  const strategyResult = resolveRecordFetchStrategy(params)
  return {
    ...strategyResult,
    filters: buildRepositoryFilters(strategyResult),
  }
}

/**
 * Post-fetch scope filter — Manager by record.branch_id, Employee by employee_id.
 * Admin returns all items (caller may pre-filter at repository level).
 */
export function applyRecordFetchScope(
  items,
  {
    session = {},
    getBranchId = (item) => item.branchId,
    getEmployeeId = (item) => item.employeeId,
    getSupportEmployeeId = (item) => item.supportEmployeeId ?? '',
  } = {},
) {
  const role = session.role ?? ''
  if (role === ROLES.ADMIN) return items

  if (role === ROLES.EMPLOYEE) {
    const employeeId = session.employeeId ?? ''
    if (!employeeId) return []
    return items.filter((item) =>
      getEmployeeId(item) === employeeId || getSupportEmployeeId(item) === employeeId,
    )
  }

  const branchId = session.branch ?? ''
  if (!branchId) return []
  return items.filter((item) => getBranchId(item) === branchId)
}
