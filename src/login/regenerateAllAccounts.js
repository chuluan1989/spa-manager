import {
  assignEmployeeUsernames,
  branchManagerDefaultPassword,
  branchManagerUsername,
  employeeDefaultPassword,
} from './loginRules'
import { isEmployeeLoginEligible, loadEmployees } from '../utils/employeeStorage'
import { loadBranches } from '../constants/branches'
import { hashPassword } from '../utils/passwordHash'

/**
 * Sinh lại TOÀN BỘ credentials QL chi nhánh + nhân viên từ Hồ sơ hiện tại.
 * Không giữ username/password cũ. Không legacy.
 */
export async function buildRegeneratedCredentials(currentAdminPassword) {
  const employees = loadEmployees().filter(isEmployeeLoginEligible)
  const { usernames, duplicateResolutions } = assignEmployeeUsernames(employees)
  const passwordResetAt = new Date().toISOString()

  const branches = {}
  const branchPasswordMeta = {}
  const branchRows = []

  for (const branch of loadBranches()) {
    const plain = branchManagerDefaultPassword(branch.id)
    branches[branch.id] = await hashPassword(plain)
    branchPasswordMeta[branch.id] = {
      passwordUpdatedAt: passwordResetAt,
      customPassword: false,
    }
    branchRows.push({
      name: `QL ${branch.name}`,
      branchId: branch.id,
      branchName: branch.name,
      username: branchManagerUsername(branch.id),
      defaultPassword: plain,
      role: 'branch_manager',
      status: 'success',
    })
  }

  const employeesCred = {}
  const employeeRows = []
  const failures = []

  for (const employee of employees) {
    const username = usernames.get(employee.id)
    if (!username) {
      failures.push({
        employeeId: employee.id,
        name: employee.name,
        reason: 'Không sinh được username từ họ tên',
      })
      continue
    }

    const plain = employeeDefaultPassword(employee.name, employee.branchId)
    employeesCred[employee.id] = {
      branchId: employee.branchId ?? '',
      name: employee.name ?? '',
      loginUsername: username,
      password: await hashPassword(plain.toLowerCase()),
      passwordUpdatedAt: passwordResetAt,
      customPassword: false,
    }

    employeeRows.push({
      employeeId: employee.id,
      name: employee.name,
      branchId: employee.branchId,
      branchName: loadBranches().find((b) => b.id === employee.branchId)?.name ?? employee.branchId,
      username,
      defaultPassword: plain,
      role: 'employee',
      status: 'success',
    })
  }

  return {
    credentials: {
      admin: currentAdminPassword,
      branches,
      branchPasswordMeta,
      employees: employeesCred,
    },
    exportRows: [...branchRows, ...employeeRows],
    duplicateResolutions,
    failures,
    summary: {
      branchManagers: branchRows.length,
      employeesSucceeded: employeeRows.length,
      employeesFailed: failures.length,
      duplicateUsernames: duplicateResolutions.length,
    },
  }
}
