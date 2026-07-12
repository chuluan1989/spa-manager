import {
  ADMIN_NAV_ORDER,
  BRANCH_MANAGER_NAV_ORDER,
  EMPLOYEE_NAV_ORDER,
  NAV_ITEMS,
  pickNavItems,
} from './navigation'
import { ADMIN_BRANCH, ROLES } from './roles'
import { getBranchName } from '../utils/branchStorage'
import { getEmployeeById } from '../utils/employeeStorage'
import { isEmployeeProfileLocked } from '../utils/employeeProfilePolicy'
import { loadCurrentUser } from '../utils/authStorage'
import { loadSystemSettings } from '../utils/systemSettingsStorage'
import { checkPermission, hasPermission, PERMISSION_KEYS } from '../utils/permissionsStorage'

export { ADMIN_BRANCH, ROLES }

export function getCurrentUser() {
  return loadCurrentUser()
}

export function isLoggedIn() {
  const user = getCurrentUser()
  return Boolean(user?.role && user?.branch)
}

export function getCurrentUserRole() {
  return getCurrentUser()?.role ?? null
}

export function getCurrentUserBranch() {
  return getCurrentUser()?.branch ?? ''
}

export function getCurrentUserEmployeeId() {
  return getCurrentUser()?.employeeId ?? ''
}

export function getCurrentUserBranchName() {
  const branch = getCurrentUserBranch()
  if (branch === ADMIN_BRANCH) return 'Tất cả chi nhánh'
  return getBranchName(branch)
}

export function getCurrentUserName() {
  const user = getCurrentUser()
  if (!user) return ''
  if (user.role === ROLES.ADMIN) return 'Admin'
  if (user.role === ROLES.EMPLOYEE) {
    return user.employeeName ?? getEmployeeById(user.employeeId)?.name ?? 'Nhân viên'
  }
  return `QL ${getCurrentUserBranchName()}`
}

export function isAdmin() {
  return getCurrentUserRole() === ROLES.ADMIN
}

export function isBranchManager() {
  return getCurrentUserRole() === ROLES.BRANCH_MANAGER
}

export function isEmployee() {
  return getCurrentUserRole() === ROLES.EMPLOYEE
}

export function canSelectBranch() {
  return isAdmin()
}

export function getScopedBranchId(selectedBranchId = '') {
  if (isBranchManager() || isEmployee()) return getCurrentUserBranch()
  return selectedBranchId
}

export function getScopedEmployeeId(selectedEmployeeId = '') {
  if (isEmployee()) return getCurrentUserEmployeeId()
  return selectedEmployeeId
}

export function filterByUserBranch(items, getBranchId = (item) => item.branchId) {
  if (isAdmin()) return items
  const branchId = getCurrentUserBranch()
  if (!branchId) return []
  return items.filter((item) => getBranchId(item) === branchId)
}

export function filterByUserScope(
  items,
  getBranchId = (item) => item.branchId,
  getEmployeeId = (item) => item.employeeId,
  getSupportEmployeeId = (item) => item.supportEmployeeId ?? '',
) {
  if (isAdmin()) return items

  const branchId = getCurrentUserBranch()
  if (!branchId) return []

  let scoped = items.filter((item) => getBranchId(item) === branchId)
  if (isEmployee()) {
    const employeeId = getCurrentUserEmployeeId()
    scoped = scoped.filter((item) =>
      getEmployeeId(item) === employeeId || getSupportEmployeeId(item) === employeeId,
    )
  }
  return scoped
}

export function isEmployeeInUserBranch(employee) {
  if (isAdmin()) return true
  if (!employee) return false
  return employee.branchId === getCurrentUserBranch()
}

export function canAccessEmployeesPage(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  if (role === ROLES.ADMIN) return false
  return checkPermission(PERMISSION_KEYS.VIEW_EMPLOYEE_PROFILE, role, branchId)
    || checkPermission(PERMISSION_KEYS.MANAGE_EMPLOYEES, role, branchId)
}

export function canAccessInvoicesPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN || role === ROLES.BRANCH_MANAGER || role === ROLES.EMPLOYEE
}

export function canAccessCustomersPage(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_CUSTOMERS, role, branchId)
}

export function canEditCustomerProfile(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.EDIT_CUSTOMER, role, branchId)
}

export function canManageCustomerCare(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.CARE_CUSTOMER, role, branchId)
}

export function canAccessAttendancePage(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  if (role === ROLES.EMPLOYEE) {
    const employee = getEmployeeById(getCurrentUserEmployeeId())
    if (isEmployeeProfileLocked(employee)) return false
  }
  return checkPermission(PERMISSION_KEYS.VIEW_ATTENDANCE, role, branchId)
}

export function canEditAttendance(recordBranchId = '', role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  if (!checkPermission(PERMISSION_KEYS.EDIT_ATTENDANCE, role, branchId)) return false
  if (role === ROLES.ADMIN) return true
  if (role === ROLES.BRANCH_MANAGER) {
    return !recordBranchId || recordBranchId === branchId
  }
  return false
}

export function canAccessExpensesPage(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return canViewExpense(role, branchId)
}

export function canViewEmployeeCccd(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_SENSITIVE, role, branchId)
    || checkPermission(PERMISSION_KEYS.VIEW_CCCD, role, branchId)
}

export function canViewEmployeePersonalInfo(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_SENSITIVE, role, branchId)
}

export function canViewEmployeeNote(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_SENSITIVE, role, branchId)
}

/** Ảnh chân dung là thông tin riêng tư — cần quyền xem nhạy cảm. */
export function canViewEmployeeAvatar(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_SENSITIVE, role, branchId)
}

export function canEditEmployeeAvatar(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.EDIT_EMPLOYEE, role, branchId)
}

/** Địa chỉ hiện tại là thông tin riêng tư. */
export function canViewEmployeeCurrentAddress(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_SENSITIVE, role, branchId)
}

/** Ngân hàng/số tài khoản là thông tin riêng tư. */
export function canViewEmployeeBankInfo(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_SENSITIVE, role, branchId)
}

/** Người liên hệ khẩn cấp là thông tin riêng tư. */
export function canViewEmployeeEmergencyContact(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_SENSITIVE, role, branchId)
}

export function canViewEmployeePosition(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_EMPLOYEE_PROFILE, role, branchId)
}

export function canChangeEmployeeBranch(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canAddEmployee(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canEditEmployee(employee = null, role = getCurrentUserRole()) {
  if (role !== ROLES.ADMIN) return false
  return true
}

export function canDeleteEmployee(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canTransferEmployee(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canLockEmployee(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canViewReport(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_REPORT, role, branchId)
}

export function canViewOverviewReport(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_REPORT, role, branchId)
}

export function canExportReport(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.EXPORT_EXCEL, role, branchId)
}

export function canViewSalary(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  if (role === ROLES.EMPLOYEE) return true
  return checkPermission(PERMISSION_KEYS.VIEW_SALARY, role, branchId)
}

export function canAccessSalaryPage(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  if (role === ROLES.EMPLOYEE) return true
  return canViewSalary(role, branchId)
}

export function canManagePayroll(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  if (role === ROLES.EMPLOYEE) return false
  return checkPermission(PERMISSION_KEYS.MANAGE_PAYROLL, role, branchId)
    || (role === ROLES.ADMIN)
}

export function canLockPayroll(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.LOCK_PAYROLL, role, branchId)
}

export function canDeletePayroll(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.DELETE_PAYROLL, role, branchId)
}

export function canViewSystemWide(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_SYSTEM_WIDE, role, branchId)
}

export function canAddInvoice(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.ADD_INVOICE, role, branchId)
}

export function canEditInvoice(invoice = null, role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  const settings = loadSystemSettings()

  if (role === ROLES.ADMIN) return true

  if (role === ROLES.BRANCH_MANAGER) {
    if (!settings.allowManagerEditBranchInvoice) return false
    if (!checkPermission(PERMISSION_KEYS.EDIT_INVOICE, role, branchId)) return false
    if (!invoice) return true
    return invoice.branchId === getCurrentUserBranch()
  }

  if (role === ROLES.EMPLOYEE) {
    if (!settings.allowEmployeeEditOwnInvoice) return false
    if (!checkPermission(PERMISSION_KEYS.EDIT_INVOICE, role, branchId)) {
      return Boolean(invoice) && invoice.employeeId === getCurrentUserEmployeeId()
    }
    return Boolean(invoice) && invoice.employeeId === getCurrentUserEmployeeId()
  }

  return false
}

export function canDeleteInvoice(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  const settings = loadSystemSettings()
  if (settings.onlyAdminDeleteInvoice) return role === ROLES.ADMIN
  return checkPermission(PERMISSION_KEYS.DELETE_INVOICE, role, branchId)
}

export function canViewExpense(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.VIEW_EXPENSE, role, branchId)
    || checkPermission(PERMISSION_KEYS.MANAGE_EXPENSES, role, branchId)
}

export function canAddExpense(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.ADD_EXPENSE, role, branchId)
    || checkPermission(PERMISSION_KEYS.MANAGE_EXPENSES, role, branchId)
}

export function canEditExpense(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.EDIT_EXPENSE, role, branchId)
    || checkPermission(PERMISSION_KEYS.MANAGE_EXPENSES, role, branchId)
}

export function canDeleteExpense(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  return checkPermission(PERMISSION_KEYS.DELETE_EXPENSE, role, branchId)
}

export function canAccessLegacySyncPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN || role === ROLES.BRANCH_MANAGER || role === ROLES.EMPLOYEE
}

export function canAccessSettingsPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Menu Chi nhánh — chỉ Admin (quản lý toàn bộ). */
export function canAccessBranchesPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canManageBranches(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canManageServiceCatalog(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canAccessServiceCatalogPage(role = getCurrentUserRole(), branchId = getCurrentUserBranch()) {
  if (role === ROLES.ADMIN) return true
  if (role === ROLES.BRANCH_MANAGER) return Boolean(branchId)
  return false
}

export function canViewBranchServicePricing(branchId, role = getCurrentUserRole(), userBranchId = getCurrentUserBranch()) {
  if (role === ROLES.ADMIN) return true
  if (role === ROLES.BRANCH_MANAGER) return branchId === userBranchId
  return false
}

export function canEditBranchServicePricing(branchId, role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Chỉ Nhân viên có màn "Hồ sơ cá nhân" (Admin/Quản lý sửa hồ sơ trong Cài đặt). */
export function canAccessMyProfilePage(role = getCurrentUserRole()) {
  return role === ROLES.EMPLOYEE
}

export function canAccessPayroll1CheckPage(role = getCurrentUserRole()) {
  return role === ROLES.EMPLOYEE
}

export function canAccessPayroll1AdminPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN || role === ROLES.BRANCH_MANAGER
}

export function getVisibleNavItems(role = getCurrentUserRole()) {
  if (role === ROLES.ADMIN) {
    return pickNavItems(NAV_ITEMS, ADMIN_NAV_ORDER)
  }

  if (role === ROLES.BRANCH_MANAGER) {
    const branchId = getCurrentUserBranch()
    return pickNavItems(NAV_ITEMS, BRANCH_MANAGER_NAV_ORDER).filter((item) => {
      if (item.id === 'admin-services') return canAccessServiceCatalogPage(role, branchId)
      if (item.id === 'reports') return canViewReport(role, branchId)
      if (item.id === 'expenses') return canViewExpense(role, branchId)
      if (item.id === 'customers') return canAccessCustomersPage(role, branchId)
      if (item.id === 'attendance') return canAccessAttendancePage(role, branchId)
      if (item.id === 'salary') return canAccessSalaryPage(role, branchId)
      return true
    })
  }

  if (role === ROLES.EMPLOYEE) {
    const branchId = getCurrentUserBranch()
    const items = pickNavItems(NAV_ITEMS, EMPLOYEE_NAV_ORDER).filter((item) => {
      if (item.id === 'reports') return canViewReport(role, branchId)
      if (item.id === 'expenses') return canViewExpense(role, branchId)
      if (item.id === 'customers') return canAccessCustomersPage(role, branchId)
      if (item.id === 'salary') return canAccessSalaryPage(role, branchId)
      return true
    })
    if (canViewExpense(role, branchId)) {
      const expenseItem = NAV_ITEMS.find((item) => item.id === 'expenses')
      if (expenseItem && !items.some((item) => item.id === 'expenses')) {
        items.splice(2, 0, expenseItem)
      }
    }
    return items
  }

  return NAV_ITEMS.filter((item) => !['settings', 'admin-employees', 'admin-services', 'revenue'].includes(item.id))
}

export function getRoleLabel(role = getCurrentUserRole()) {
  if (role === ROLES.ADMIN) return 'Admin'
  if (role === ROLES.BRANCH_MANAGER) return 'Quản lý chi nhánh'
  if (role === ROLES.EMPLOYEE) return 'Nhân viên'
  return '—'
}
