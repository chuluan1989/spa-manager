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
import { loadCurrentUser } from '../utils/authStorage'
import { hasPermission, PERMISSION_KEYS } from '../utils/permissionsStorage'

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
) {
  if (isAdmin()) return items

  const branchId = getCurrentUserBranch()
  if (!branchId) return []

  let scoped = items.filter((item) => getBranchId(item) === branchId)
  if (isEmployee()) {
    const employeeId = getCurrentUserEmployeeId()
    scoped = scoped.filter((item) => getEmployeeId(item) === employeeId)
  }
  return scoped
}

export function isEmployeeInUserBranch(employee) {
  if (isAdmin()) return true
  if (!employee) return false
  return employee.branchId === getCurrentUserBranch()
}

export function canAccessEmployeesPage(role = getCurrentUserRole()) {
  if (role === ROLES.ADMIN) return false
  return role === ROLES.BRANCH_MANAGER || hasPermission(PERMISSION_KEYS.MANAGE_EMPLOYEES, role)
}

export function canAccessInvoicesPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN || role === ROLES.BRANCH_MANAGER || role === ROLES.EMPLOYEE
}

export function canAccessExpensesPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN || role === ROLES.BRANCH_MANAGER
}

export function canViewEmployeeCccd(role = getCurrentUserRole()) {
  return hasPermission(PERMISSION_KEYS.VIEW_CCCD, role)
}

export function canViewEmployeePersonalInfo(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canViewEmployeeNote(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Ảnh chân dung là thông tin riêng tư — chỉ Admin được xem. */
export function canViewEmployeeAvatar(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canEditEmployeeAvatar(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Địa chỉ hiện tại là thông tin riêng tư — chỉ Admin được xem. */
export function canViewEmployeeCurrentAddress(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Ngân hàng/số tài khoản là thông tin riêng tư — chỉ Admin được xem. */
export function canViewEmployeeBankInfo(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Người liên hệ khẩn cấp là thông tin riêng tư — chỉ Admin được xem. */
export function canViewEmployeeEmergencyContact(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canViewEmployeePosition(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN || role === ROLES.BRANCH_MANAGER
}

export function canChangeEmployeeBranch(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canAddEmployee(role = getCurrentUserRole()) {
  return hasPermission(PERMISSION_KEYS.MANAGE_EMPLOYEES, role)
}

export function canEditEmployee(employee = null, role = getCurrentUserRole()) {
  if (!hasPermission(PERMISSION_KEYS.MANAGE_EMPLOYEES, role)) return false
  if (role === ROLES.ADMIN) return true
  return isEmployeeInUserBranch(employee)
}

export function canDeleteEmployee(role = getCurrentUserRole()) {
  return hasPermission(PERMISSION_KEYS.DELETE_EMPLOYEE, role)
}

export function canTransferEmployee(role = getCurrentUserRole()) {
  return hasPermission(PERMISSION_KEYS.TRANSFER_EMPLOYEE, role)
}

export function canViewReport(role = getCurrentUserRole()) {
  return hasPermission(PERMISSION_KEYS.VIEW_REPORT, role) || role === ROLES.EMPLOYEE
}

export function canViewOverviewReport(role = getCurrentUserRole()) {
  return role === ROLES.EMPLOYEE || hasPermission(PERMISSION_KEYS.VIEW_REPORT, role)
}

export function canAddInvoice(role = getCurrentUserRole()) {
  if (role === ROLES.EMPLOYEE) return true
  return hasPermission(PERMISSION_KEYS.ADD_INVOICE, role)
}

/**
 * Admin: sửa mọi hóa đơn (không phụ thuộc ma trận phân quyền).
 * Nhân viên: chỉ sửa hóa đơn do chính mình thực hiện.
 * Quản lý chi nhánh: chỉ xem danh sách, không sửa hóa đơn đã lưu.
 */
export function canEditInvoice(invoice = null, role = getCurrentUserRole()) {
  if (role === ROLES.ADMIN) return true
  if (role === ROLES.EMPLOYEE) {
    return Boolean(invoice) && invoice.employeeId === getCurrentUserEmployeeId()
  }
  return false
}

/** Chỉ Admin được xóa hóa đơn. */
export function canDeleteInvoice(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canAccessLegacySyncPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN || role === ROLES.BRANCH_MANAGER || role === ROLES.EMPLOYEE
}

export function canAccessSettingsPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Chỉ Nhân viên có màn "Hồ sơ cá nhân" (Admin/Quản lý sửa hồ sơ trong Cài đặt). */
export function canAccessMyProfilePage(role = getCurrentUserRole()) {
  return role === ROLES.EMPLOYEE
}

export function getVisibleNavItems(role = getCurrentUserRole()) {
  if (role === ROLES.ADMIN) {
    return pickNavItems(NAV_ITEMS, ADMIN_NAV_ORDER)
  }

  if (role === ROLES.BRANCH_MANAGER) {
    return pickNavItems(NAV_ITEMS, BRANCH_MANAGER_NAV_ORDER)
  }

  if (role === ROLES.EMPLOYEE) {
    return pickNavItems(NAV_ITEMS, EMPLOYEE_NAV_ORDER)
  }

  return NAV_ITEMS.filter((item) => !['settings', 'admin-employees', 'admin-services', 'revenue'].includes(item.id))
}

export function getRoleLabel(role = getCurrentUserRole()) {
  if (role === ROLES.ADMIN) return 'Admin'
  if (role === ROLES.BRANCH_MANAGER) return 'Quản lý chi nhánh'
  if (role === ROLES.EMPLOYEE) return 'Nhân viên'
  return '—'
}
